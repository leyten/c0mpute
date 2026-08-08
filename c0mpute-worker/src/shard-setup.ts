// Self-provisioning enroll for shard mode (NODE_DAEMON.md §2-A / §3-interim): a stranger's box
// gets EVERYTHING the daemon drives — the shard engine checkout, a pinned python venv, the
// libp2p sidecar binary, and the probe slice — with zero env vars and zero hand-patching.
// The pip step is the known interim cost the signed runtime ARTIFACT (§3) later kills; the
// pins here are the fleet's proven env (phase0/requirements_vmoe.txt lineage), not latest.
//
// Every step is idempotent (re-runs are no-ops), logged, and fails LOUD with the fix named.

import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  DRAFTER_DIR, MANIFEST_DEV_FILE, MANIFEST_FILE, MANIFEST_PUBKEY, MANIFEST_REF, MODEL_DIR,
  MODEL_REPO, SHARD_HOME, SHARD_REPO, SIDECAR_BIN, manifestRefName, pullProbeSliceRaw, pullRange,
  pythonBin,
} from './shard-runner.js';

const ENGINE_GIT_URL = process.env.C0MPUTE_SHARD_GIT || 'https://github.com/leyten/shard';
const VENV_DIR = join(SHARD_HOME, 'venv');
const DEPS_MARKER = join(VENV_DIR, '.deps-ok-v1');

// The serving stage's proven env (vllm pulls the torch/CUDA wheel chain itself).
const ENGINE_DEPS = process.env.C0MPUTE_SHARD_DEPS
  || 'vllm==0.23.0 torch==2.11.0 transformers==5.12.1 safetensors cryptography numpy huggingface_hub hf_transfer';

// Prebuilt sidecar (linux-amd64, CGO_ENABLED=0) — verified against this sha256 before first use.
// PUBLISHED 2026-07-29 as sidecar-v0.2.0 (reproducible: CGO_ENABLED=0 go build -trimpath
// -buildvcs=false -ldflags="-s -w -buildid=", go 1.25.7 per sidecar/go.mod — rebuildable from the
// public workflow, verify against this pin). Cutting a new release = update this pin in the same
// breath (no auto-update by design). An overridden URL must bring its own checksum.
// v0.2.0 adds comma-list multi-target forward parsing (parseForwardTargets); the daemon's
// dial-every-addr change depends on it — v0.1.0 fails the comma-list parse.
const SIDECAR_URL = process.env.C0MPUTE_SIDECAR_URL
  || 'https://github.com/leyten/shard/releases/download/sidecar-v0.2.0/sidecar-linux-amd64';
const SIDECAR_SHA256 = process.env.C0MPUTE_SIDECAR_URL
  ? (process.env.C0MPUTE_SIDECAR_SHA256 ?? '')
  : '45a22cbda27011abe0d96927737f4a1a5ac30112d744e3f0fdf447a6b16cd9be';

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [shard-setup] ${msg}`);
}

function run(cmd: string, args: string[], opts: { cwd?: string; label: string; streamTag?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const tag = opts.streamTag ?? opts.label;
    p.stdout.on('data', (d: Buffer) => process.stdout.write(`[${tag}] ${d}`));
    p.stderr.on('data', (d: Buffer) => process.stderr.write(`[${tag}] ${d}`));
    p.on('error', (e) => reject(new Error(`${opts.label}: ${e.message}`)));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${opts.label} exited ${code}`))));
  });
}

/** The shard engine checkout at ~/.c0mpute/shard (shallow; a re-run fast-forwards). */
async function ensureEngine(): Promise<void> {
  if (process.env.C0MPUTE_SHARD_REPO && existsSync(SHARD_REPO)) {
    log(`engine: using operator checkout ${SHARD_REPO}`);
    return;
  }
  if (existsSync(join(SHARD_REPO, 'shard', 'stage.py'))) {
    log('engine: updating checkout');
    try {
      await run('git', ['pull', '--ff-only'], { cwd: SHARD_REPO, label: 'git pull', streamTag: 'engine' });
    } catch {
      log('engine: pull failed (offline or diverged) — continuing on the existing checkout');
    }
    return;
  }
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('git is required to fetch the shard engine: install git and re-run');
  }
  log(`engine: cloning ${ENGINE_GIT_URL} -> ${SHARD_REPO} (shallow)`);
  await run('git', ['clone', '--depth', '1', ENGINE_GIT_URL, SHARD_REPO], { label: 'git clone', streamTag: 'engine' });
}

/** A pinned venv at ~/.c0mpute/venv — the engine's proven deps, installed once. */
async function ensureVenv(): Promise<void> {
  if (process.env.C0MPUTE_SHARD_PYTHON) {
    log(`venv: using operator python ${process.env.C0MPUTE_SHARD_PYTHON}`);
    return;
  }
  if (!existsSync(join(VENV_DIR, 'bin', 'python'))) {
    const v = spawnSync('python3', ['-c', 'import sys; print(sys.version_info>=(3,11))'], { encoding: 'utf8' });
    if (v.status !== 0) throw new Error('python3 not found: install Python 3.11+ and re-run');
    if (!v.stdout.includes('True')) {
      throw new Error(`the shard engine needs Python >= 3.11 (found ${spawnSync('python3', ['--version'], { encoding: 'utf8' }).stdout.trim()})`);
    }
    log(`venv: creating ${VENV_DIR}`);
    const mk = spawnSync('python3', ['-m', 'venv', VENV_DIR], { encoding: 'utf8' });
    if (mk.status !== 0) {
      throw new Error(`venv creation failed (on Debian/Ubuntu/WSL: sudo apt install python3-venv): ${mk.stderr.trim().slice(-200)}`);
    }
  }
  if (existsSync(DEPS_MARKER)) {
    log('venv: deps already installed');
    return;
  }
  log(`venv: installing engine deps (${ENGINE_DEPS.split(' ')[0]} + pins) — the one slow step, several GB of wheels`);
  const pip = join(VENV_DIR, 'bin', 'pip');
  await run(pip, ['install', '-q', '--upgrade', 'pip'], { label: 'pip upgrade', streamTag: 'venv' });
  await run(pip, ['install', '--no-cache-dir', ...ENGINE_DEPS.split(' ')], { label: 'pip install', streamTag: 'venv' });
  writeFileSync(DEPS_MARKER, ENGINE_DEPS + '\n');
  log('venv: deps installed');
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The libp2p sidecar: operator env > existing binary > pinned release download > go build. */
async function ensureSidecar(): Promise<void> {
  if (existsSync(SIDECAR_BIN)) {
    log(`sidecar: ${SIDECAR_BIN}`);
    return;
  }
  mkdirSync(join(SHARD_HOME, 'bin'), { recursive: true });
  const dest = join(SHARD_HOME, 'bin', 'sidecar');
  if (process.platform === 'linux' && process.arch === 'x64') {
    try {
      log(`sidecar: downloading ${SIDECAR_URL}`);
      const res = await fetch(SIDECAR_URL, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tmp = dest + '.part';
      writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      const got = sha256(tmp);
      if (got !== SIDECAR_SHA256) throw new Error(`sha256 mismatch (got ${got.slice(0, 12)}…)`);
      chmodSync(tmp, 0o755);
      renameSync(tmp, dest);
      log('sidecar: downloaded + sha256 verified');
      return;
    } catch (e: any) {
      log(`sidecar: download unavailable (${e.message}) — trying a local go build`);
    }
  }
  if (spawnSync('go', ['version'], { stdio: 'ignore' }).status === 0) {
    log('sidecar: building from the engine checkout (go)');
    await run('go', ['build', '-o', dest, '.'],
      { cwd: join(SHARD_REPO, 'sidecar'), label: 'go build sidecar', streamTag: 'sidecar' });
    log('sidecar: built');
    return;
  }
  throw new Error('no sidecar: the prebuilt release is not published yet and no Go toolchain is '
    + 'installed. Fix: install Go (sudo apt install golang-go) and re-run, or set C0MPUTE_SIDECAR_BIN.');
}

// The EAGLE-3 drafter head (thoughtworks/MiniMax-M2.5-Eagle3, Apache-2.0) — the coordinator-side
// speculative g-lever. Pinned to an immutable revision + per-file sha256 (an upstream repo change
// can never silently swap the checkpoint). Every node stages it (0.46 GB ≈ 1.5% of a weight
// range) because ANY node can become head after a churn re-form; only the head's coordinator
// loads it. Trust surface: the head only shapes DRAFTS, and the ring verifies every draft
// against the base model — a wrong head costs speed, never correctness.
const EAGLE_REV = 'fb4699b3d33913e6b5e2462dd7962775e44e5fea';
const EAGLE_URL = `https://huggingface.co/thoughtworks/MiniMax-M2.5-Eagle3/resolve/${EAGLE_REV}`;
const EAGLE_FILES: Array<{ name: string; sha256: string }> = [
  { name: 'config.json', sha256: 'c9bca72dae76e2f2970143a55d46e1a798cfc3e0aa8be80b030454a12ce452b1' },
  { name: 'model.safetensors', sha256: '29510581a9d8448063820fed2b0f99ed9d3f8ba3625d419f8132ddff62872ce1' },
];

/** The drafter head → DRAFTER_DIR, sha-verified (re-verified every boot: a truncated pull
 *  re-downloads). NON-FATAL by design: a node without the head still enrolls and serves — if it
 *  becomes head, eagle_armed() degrades the ring to the n-gram drafter (the pre-drafter world)
 *  instead of blocking the join. */
export async function ensureDrafter(): Promise<void> {
  try {
    mkdirSync(DRAFTER_DIR, { recursive: true });
    for (const f of EAGLE_FILES) {
      const dest = join(DRAFTER_DIR, f.name);
      if (existsSync(dest) && sha256(dest) === f.sha256) continue;
      log(`drafter: downloading ${f.name}`);
      const res = await fetch(`${EAGLE_URL}/${f.name}`,
        { signal: AbortSignal.timeout(600_000), redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const tmp = dest + '.part';
      await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp));
      const got = sha256(tmp);
      if (got !== f.sha256) { rmSync(tmp); throw new Error(`${f.name} sha256 mismatch (got ${got.slice(0, 12)}…)`); }
      renameSync(tmp, dest);
    }
    log(`drafter: EAGLE head staged at ${DRAFTER_DIR} (sha256 verified)`);
  } catch (e: any) {
    log(`drafter: unavailable (${e.message}) — this node serves without the speculative lever; `
      + 'a ring it heads runs the n-gram drafter (slower, never wrong)');
  }
}

/** The probe slice (config + index + the probe layer's shards, ~2.4 GB) so `shard.probe
 *  --measure` runs REAL physics at enroll. VERIFIED via the resolved manifest when one is on
 *  disk (a joiner's first byte is pinned); the raw m25_pull_range path survives ONLY as the
 *  measurement fallback — the slice feeds the probe and is never served. */
async function ensureProbeSlice(): Promise<void> {
  if (existsSync(join(MODEL_DIR, 'config.json'))) {
    log(`model dir: ${MODEL_DIR}`);
    return;
  }
  mkdirSync(MODEL_DIR, { recursive: true });
  log('model: pulling the probe slice (config + layer 30, ~2.4 GB) — first-join download');
  if (existsSync(MANIFEST_FILE)) {
    try {
      await pullRange(30, 31, false, false, {
        manifestRef: MANIFEST_REF, expectModelId: MODEL_REPO,
      });
      log('model: probe slice ready (verified)');
      return;
    } catch (e: any) {
      log(`model: verified probe-slice pull failed (${e.message}) — raw fallback (measurement-only)`);
    }
  }
  await pullProbeSliceRaw(30, 31);
  log('model: probe slice ready (UNVERIFIED raw pull — measurement-only, serving pulls stay pinned)');
}

const MANIFEST_STATE = join(SHARD_HOME, 'manifest-state.json');   // {ref, version} last adopted

function readJson(path: string): Record<string, any> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** Resolve the NETWORK's signed manifest for `ref` (P0-#1: kills the self-published throwaway-key
 *  manifest). Delivery = a static doc on the orchestrator origin (`/manifests/<name>.json`) —
 *  untrusted transport by design: the TS checks here (pin string-compare, monotonic version) are
 *  EARLY LOUD FAILURE only; the trust boundary stays `shard.fetch`, which re-verifies bytes==CID
 *  and the pinned ed25519 signature fail-closed on every pull. Offline-tolerant: a cached doc
 *  matching the pin is kept when the GET fails. Exported: serve() re-resolves when an assignment
 *  carries a ref the cache doesn't match. */
export async function resolveManifest(orchestratorUrl: string | undefined, ref = MANIFEST_REF): Promise<void> {
  if (MANIFEST_DEV_FILE) {
    if (!existsSync(MANIFEST_DEV_FILE)) throw new Error(`dev manifest ${MANIFEST_DEV_FILE} does not exist`);
    copyFileSync(MANIFEST_DEV_FILE, MANIFEST_FILE);
    log(`manifest: DEV HATCH — using local ${MANIFEST_DEV_FILE} (never a production path)`);
    return;
  }
  // a cached doc from a previous era (self-published, wrong publisher) must never linger where
  // the seeder/loader can pick it up — drop it and resolve fresh
  const cached = readJson(MANIFEST_FILE);
  if (cached && MANIFEST_PUBKEY && cached.publisher_pubkey !== MANIFEST_PUBKEY) {
    log('manifest: cached doc does not match the pinned network publisher — dropping it');
    rmSync(MANIFEST_FILE, { force: true });
  }
  if (!orchestratorUrl) {
    log(existsSync(MANIFEST_FILE)
      ? 'manifest: no orchestrator URL — keeping the cached doc'
      : 'manifest: no orchestrator URL and no cache — serving will refuse until one resolves');
    return;
  }
  const name = manifestRefName(ref);
  const url = `${orchestratorUrl.replace(/\/$/, '')}/manifests/${name}.json`;
  // Keep the RAW bytes: the manifest CID (in the ref) is over the exact file bytes, and the engine
  // re-hashes the file vs the CID on every pull. Re-serializing here (JSON.parse -> stringify)
  // changes the bytes and breaks that check — every pull fail-closes. Parse only a COPY for the
  // pin/version guards; write the bytes verbatim. (Caught on the real-ring preflight.)
  let raw: string; let doc: Record<string, any>;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.text();
    doc = JSON.parse(raw) as Record<string, any>;
  } catch (e: any) {
    log(existsSync(MANIFEST_FILE)
      ? `manifest: resolve failed (${e.message}) — keeping the cached doc`
      : `manifest: resolve failed (${e.message}) and no cache — serving will refuse until one resolves`);
    return;
  }
  if (MANIFEST_PUBKEY && doc.publisher_pubkey !== MANIFEST_PUBKEY) {
    log(`manifest: REFUSED ${url} — publisher_pubkey does not match the pinned network key`);
    return;
  }
  const state = readJson(MANIFEST_STATE) ?? {};
  const version = Number(doc.version ?? 1);
  if (typeof state.version === 'number' && version < state.version) {
    log(`manifest: REFUSED ${url} — version ${version} rolls back the adopted ${state.version}`);
    return;
  }
  const tmp = MANIFEST_FILE + '.part';
  writeFileSync(tmp, raw);                     // VERBATIM — the CID is over these exact bytes
  renameSync(tmp, MANIFEST_FILE);
  writeFileSync(MANIFEST_STATE, JSON.stringify({ ref, version }));
  log(`manifest: resolved ${name} v${version} from the network (${raw.length}B, verbatim; engine re-verifies on every pull)`);
}

const RELAYS_CACHE = join(SHARD_HOME, 'relays.json');

/** A relay entry must be a full /p2p multiaddr. Validation is LOAD-BEARING, not hygiene: the
 *  sidecar log.Fatalf's on a malformed -relays entry, so one bad list push would kill every
 *  daemon's sidecar at boot network-wide. Malformed entries are dropped loudly instead. */
const RELAY_RE = /^\/(ip4|ip6|dns4|dns6|dns)\/[^/\s]+\/(tcp|udp)\/\d{1,5}(\/quic-v1)?\/p2p\/[A-Za-z0-9]{20,}$/;

/** Pure merge+validate: network list + operator env (env first — an operator override outranks),
 *  deduped, malformed dropped. Exported for tests. */
export function mergeRelayLists(network: unknown, envCsv: string | undefined): string[] {
  const fromNet = Array.isArray((network as { relays?: unknown })?.relays)
    ? ((network as { relays: unknown[] }).relays).filter((r): r is string => typeof r === 'string')
    : [];
  const fromEnv = (envCsv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const r of [...fromEnv, ...fromNet]) {
    if (!RELAY_RE.test(r)) { log(`relays: DROPPED malformed entry ${JSON.stringify(r.slice(0, 80))}`); continue; }
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

/** P0-#3 relay auto-discovery: the network's public circuit relays from the orchestrator origin
 *  (static `/relays.json`, same untrusted-transport pattern as /manifests/). Relay addrs are NOT
 *  trust-bearing — a relay is rendezvous only (every link is e2e-encrypted libp2p and DCUtR
 *  upgrades to direct), so a poisoned list costs availability, never integrity. Offline-tolerant:
 *  the last good list is cached; no network + no cache -> env-only (or none: direct-only nodes
 *  work fine without relays). */
export async function resolveRelays(orchestratorUrl: string | undefined): Promise<string[]> {
  const env = process.env.C0MPUTE_SHARD_RELAYS;
  let doc: unknown = null;
  if (orchestratorUrl) {
    try {
      const res = await fetch(`${orchestratorUrl.replace(/\/$/, '')}/relays.json`,
        { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      doc = await res.json();
      writeFileSync(RELAYS_CACHE + '.part', JSON.stringify(doc));
      renameSync(RELAYS_CACHE + '.part', RELAYS_CACHE);
    } catch (e: any) {
      doc = readJson(RELAYS_CACHE);
      log(`relays: resolve failed (${e.message}) — ${doc ? 'using the cached list' : 'no cache, env-only'}`);
    }
  } else {
    doc = readJson(RELAYS_CACHE);
  }
  const relays = mergeRelayLists(doc, env);
  log(relays.length ? `relays: ${relays.length} public relay(s) armed` : 'relays: none (direct-only node)');
  return relays;
}

/** ENROLL step 0 — provision the box. Idempotent; a warm box runs through in seconds. */
export async function ensureShardSetup(opts: { orchestratorUrl?: string } = {}): Promise<void> {
  mkdirSync(join(SHARD_HOME, 'models'), { recursive: true });
  await ensureEngine();
  await ensureVenv();
  await ensureSidecar();
  await resolveManifest(opts.orchestratorUrl);      // before the probe slice: first byte verified
  await ensureProbeSlice();
  await ensureDrafter();                            // non-fatal: enroll never blocks on the g-lever
  log('provisioned: engine + venv + sidecar + manifest + probe slice + drafter');
}
