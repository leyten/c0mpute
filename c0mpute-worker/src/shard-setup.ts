// Self-provisioning enroll for shard mode (NODE_DAEMON.md §2-A / §3-interim): a stranger's box
// gets EVERYTHING the daemon drives — the shard engine checkout, a pinned python venv, the
// libp2p sidecar binary, and the probe slice — with zero env vars and zero hand-patching.
// The pip step is the known interim cost the signed runtime ARTIFACT (§3) later kills; the
// pins here are the fleet's proven env (phase0/requirements_vmoe.txt lineage), not latest.
//
// Every step is idempotent (re-runs are no-ops), logged, and fails LOUD with the fix named.

import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MODEL_DIR, SHARD_HOME, SHARD_REPO, SIDECAR_BIN, pythonBin } from './shard-runner.js';

const ENGINE_GIT_URL = process.env.C0MPUTE_SHARD_GIT || 'https://github.com/leyten/shard';
const VENV_DIR = join(SHARD_HOME, 'venv');
const DEPS_MARKER = join(VENV_DIR, '.deps-ok-v1');

// The serving stage's proven env (vllm pulls the torch/CUDA wheel chain itself).
const ENGINE_DEPS = process.env.C0MPUTE_SHARD_DEPS
  || 'vllm==0.23.0 torch==2.11.0 transformers==5.12.1 safetensors cryptography numpy huggingface_hub hf_transfer';

// Prebuilt sidecar (linux-amd64, CGO_ENABLED=0) — verified against this sha256 before first
// use. Publishing the release is the operator's call (shard .github/workflows/sidecar-release.yml,
// workflow_dispatch); until it exists the go-build fallback covers boxes with a Go toolchain.
// An overridden URL must bring its own checksum — integrity is never optional.
const SIDECAR_URL = process.env.C0MPUTE_SIDECAR_URL
  || 'https://github.com/leyten/shard/releases/download/sidecar-v0.1.0/sidecar-linux-amd64';
const SIDECAR_SHA256 = process.env.C0MPUTE_SIDECAR_URL
  ? (process.env.C0MPUTE_SIDECAR_SHA256 ?? '')
  : '843fd1c67de8fe95e4658f18d67b7da240381dd70ec92f67aefbf13d674e53e0';

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

/** The probe slice (config + index + the probe layer's shards, ~2.4 GB) so `shard.probe
 *  --measure` runs REAL physics at enroll. Public repo: anonymous HF works (slower). */
async function ensureProbeSlice(): Promise<void> {
  if (existsSync(join(MODEL_DIR, 'config.json'))) {
    log(`model dir: ${MODEL_DIR}`);
    return;
  }
  mkdirSync(MODEL_DIR, { recursive: true });
  log('model: pulling the probe slice (config + layer 30, ~2.4 GB) — first-join download');
  await run(pythonBin(), [join(SHARD_REPO, 'phase0', 'm25_pull_range.py'),
    '--lo', '30', '--hi', '31', '--dir', MODEL_DIR],
  { cwd: SHARD_REPO, label: 'probe-slice pull', streamTag: 'pull' });
  log('model: probe slice ready');
}

/** ENROLL step 0 — provision the box. Idempotent; a warm box runs through in seconds. */
export async function ensureShardSetup(): Promise<void> {
  mkdirSync(join(SHARD_HOME, 'models'), { recursive: true });
  await ensureEngine();
  await ensureVenv();
  await ensureSidecar();
  await ensureProbeSlice();
  log('provisioned: engine + venv + sidecar + probe slice');
}
