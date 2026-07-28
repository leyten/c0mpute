// Subprocess seams for shard mode — every place the daemon shells out: the Go sidecar
// (libp2p identity + tunnels), the shard engine (`python -m shard.*`), and nvidia-smi.
// The daemon supervises; the engine does the physics. Stage processes speak the stdout
// contract shipped with `python -m shard.stage` (shard PR #104): SHARD_STAGE_READY /
// SHARD_STAGE_FATAL lines a supervisor can wait on.

import { spawn, spawnSync, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { connect as netConnect } from 'net';
import { homedir } from 'os';
import { join } from 'path';

// C0MPUTE_SHARD_HOME / C0MPUTE_SHARD_PORT_BASE let several daemons share one box (the
// multi-node local ring test); a real install never sets them.
export const SHARD_HOME = process.env.C0MPUTE_SHARD_HOME || join(homedir(), '.c0mpute');
export const NODE_KEY_FILE = join(SHARD_HOME, 'node.key');        // libp2p identity (sidecar-minted, 0600)
export const RECEIPT_KEY_FILE = join(SHARD_HOME, 'receipt.key');  // engine receipt-signing key (python-minted)
// TODO(leg7): NODE_DAEMON.md §1 wants ONE key for libp2p + announce + receipts; today the sidecar
// (libp2p protobuf) and the engine (raw ed25519) use different on-disk formats, so the daemon
// manages both files under ~/.c0mpute until the formats converge.

// Port layout mirrors phase0/m25_scatter_pipe.py: the engine binds loopback (the local sidecar
// is the only legitimate dialer); the sidecar owns the public listener + the ring tunnels.
const PORT_BASE = Number(process.env.C0MPUTE_SHARD_PORT_BASE || 29600);
export const LIBP2P_PORT = PORT_BASE;
export const ENGINE_PORT = PORT_BASE + 10;
export const FORWARD_PORT = PORT_BASE + 11;
// The head's local end of the tail->coordinator RETURN tunnel (leg 8): the head sidecar
// -forwards this port to the TAIL's sidecar, and the coordinator process dials it loopback
// exactly like the gateway dials a local tail (hello_return rides the tunnel).
export const RETURN_PORT = PORT_BASE + 12;
// The stage's loopback-only challenge door (P0-#1 spot-checks): the engine binds it iff the
// daemon mints SHARD_PROBE_TOKEN at stage spawn. Never tunneled — daemon-local by construction.
export const PROBE_PORT = PORT_BASE + 13;
// The admission NETWORK probe (`shard.probe --peers`): the local port its dial-back listener binds,
// and the port a peer must actually reach if this box maps ports (docker/vast/home router). Bind
// and advertise are the same on a directly-reachable box, which is why the override is opt-in.
export const NETPROBE_PORT = Number(process.env.C0MPUTE_SHARD_NETPROBE_PORT || PORT_BASE + 14);
export const NETPROBE_ADVERTISE = Number(process.env.C0MPUTE_SHARD_NETPROBE_ADVERTISE || 0);
// Where the network's `shard.probe --serve` receivers listen (shard/probe.py's own default port).
export const NETPROBE_SERVE_PORT = Number(process.env.C0MPUTE_SHARD_NETPROBE_SERVE_PORT || 29655);

export const SIDECAR_BIN = process.env.C0MPUTE_SIDECAR_BIN || join(SHARD_HOME, 'bin', 'sidecar');
// A shard checkout (or the flat runtime-artifact layout) to run `python -m shard.*` from.
export const SHARD_REPO = process.env.C0MPUTE_SHARD_REPO || join(SHARD_HOME, 'shard');
export const MODEL_DIR = process.env.C0MPUTE_SHARD_MODEL_DIR || join(SHARD_HOME, 'models', 'minimax-m2.5');
export const MANIFEST_FILE = join(SHARD_HOME, 'manifest.json');   // signed content-addressed weight manifest
// The HF repo the probe slice + weights come from, and the model NAME the network places by.
export const MODEL_REPO = process.env.C0MPUTE_SHARD_REPO_HF || 'nvidia/MiniMax-M2.5-NVFP4';

// ── the network manifest trust anchors (P0-#1 manifest resolution) ──────────────────────
// The default manifest ref this daemon resolves at enroll. At launch the default flips to the
// full `mf1:<name>@<cid>` form minted by the operator's one-time publish (docs: shard
// INTEGRATION.md §4); the CID part is what `shard.fetch --manifest-cid` pins bytes against.
export const MANIFEST_REF = process.env.C0MPUTE_SHARD_MANIFEST || 'mf:m25-nvfp4-v1';
// The NETWORK publisher pubkey pin (base64 raw ed25519) — baked into the daemon distribution
// exactly like SIDECAR_SHA256, never taken from the channel that delivers the manifest. Filled
// by the launch publish runbook (`publish_manifest.py` prints it); the env override exists for
// harnesses, which must bring their own pin. Empty = no pin in this build: pullRange refuses
// to pull unless the dev manifest hatch (C0MPUTE_SHARD_MANIFEST_FILE) is explicitly in force.
export const MANIFEST_PUBKEY = process.env.C0MPUTE_SHARD_MANIFEST_PUBKEY || '';
// Local-manifest DEV HATCH: a path to a manifest file used INSTEAD of network resolution.
// Local env only, never remotely settable; serve() refuses it whenever the assignment carries
// a real mf1: ref, so it is inert against the production network even if the env leaks.
export const MANIFEST_DEV_FILE = process.env.C0MPUTE_SHARD_MANIFEST_FILE || '';

/** `mf1:<name>@<cid>` / legacy `mf:<name>` -> the advisory name (the /manifests/<name>.json key). */
export function manifestRefName(ref: string): string {
  return ref.replace(/^mf1?:/, '').split('@')[0];
}

/** Resolved LAZILY — the self-provision step (shard-setup.ts) creates the venv after this
 *  module loads, so a const would freeze the pre-provision answer. */
export function pythonBin(): string {
  if (process.env.C0MPUTE_SHARD_PYTHON) return process.env.C0MPUTE_SHARD_PYTHON;
  const venvPy = join(SHARD_HOME, 'venv', 'bin', 'python');
  return existsSync(venvPy) ? venvPy : 'python3';
}

export function ensureShardHome(): void {
  mkdirSync(join(SHARD_HOME, 'models'), { recursive: true });
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [shard-runner] ${msg}`);
}

/** Mint/load the libp2p node key and sign the server's bind nonce with it.
 *  `sidecar -key <file> -prove <nonce>` prints "PEERID <id>\nSIG <b64>". */
export function proveIdentity(nonce: string): { peerId: string; sig: string } {
  const r = spawnSync(SIDECAR_BIN, ['-key', NODE_KEY_FILE, '-prove', nonce], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new Error(`sidecar -prove failed (${SIDECAR_BIN}): ${r.error?.message || r.stderr || r.stdout}`);
  }
  const peerId = /PEERID (\S+)/.exec(r.stdout)?.[1];
  const sig = /SIG (\S+)/.exec(r.stdout)?.[1];
  if (!peerId || !sig) throw new Error(`sidecar -prove: unparseable output: ${r.stdout}`);
  return { peerId, sig };
}

/** The engine's receipt-signing pubkey (base64) — settlement attributes earnings to it, so the
 *  announce cap must carry exactly this key. Mints the key file on first run (0600). */
export function receiptPubkey(): string {
  const py = 'import base64, sys\n'
    + 'from cryptography.hazmat.primitives import serialization\n'
    + 'from shard.receipt import load_or_make_node_key\n'
    + 'k = load_or_make_node_key(sys.argv[1]).public_key().public_bytes(\n'
    + '    serialization.Encoding.Raw, serialization.PublicFormat.Raw)\n'
    + 'print(base64.b64encode(k).decode())';
  const r = spawnSync(pythonBin(), ['-c', py, RECEIPT_KEY_FILE], { encoding: 'utf8', cwd: shardCwd() });
  if (r.error || r.status !== 0) {
    throw new Error(`receipt-key mint failed: ${r.error?.message || r.stderr}`);
  }
  return r.stdout.trim();
}

export function detectGpuName(): string {
  try {
    const r = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split('\n')[0];
  } catch { /* no nvidia-smi (Apple silicon etc.) */ }
  return 'unknown';
}

/** Free VRAM MB (admission floor input); falls back to total, then 0 (no nvidia-smi). */
export function detectFreeVramMB(): number {
  for (const field of ['memory.free', 'memory.total']) {
    try {
      const r = spawnSync('nvidia-smi', [`--query-gpu=${field}`, '--format=csv,noheader,nounits'],
        { encoding: 'utf8' });
      if (r.status !== 0) continue;
      const mbs = r.stdout.trim().split('\n').map((l) => parseInt(l, 10)).filter((n) => !isNaN(n));
      if (mbs.length) return Math.max(...mbs);
    } catch { /* try the next field / give up */ }
  }
  return 0;
}

function shardCwd(): string | undefined {
  return existsSync(SHARD_REPO) ? SHARD_REPO : undefined;
}

/** The `--serve` probe endpoints this node measures its NETWORK vector against — the receivers
 *  that time our upload and dial us back. Control-plane-chosen by construction (a candidate that
 *  picks its own receiver can pick a colluding fast one), which is why the default is the
 *  orchestrator's own origin. `C0MPUTE_SHARD_PROBE_PEERS=''` opts out explicitly. */
export function probePeers(orchestratorUrl: string): string[] {
  const env = process.env.C0MPUTE_SHARD_PROBE_PEERS;
  if (env !== undefined) return env.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const host = new URL(orchestratorUrl).hostname;
    return host ? [`${host}:${NETPROBE_SERVE_PORT}`] : [];
  } catch { return []; }
}

/** `python -m shard.probe --measure [--peers …]` — the measured capability vector. `--measure`
 *  alone is the GPU half only (footprint, transient, layer_ms, fast-kernel); `--peers` adds the
 *  NETWORK half in the SAME subprocess and the same JSON object (probe.py merges both dicts).
 *
 *  Without the network half the vector has no `uplink_mbps`, no `rtt_to_pool_ms` and no
 *  `nat_dialable`, and derive_role fails THREE gates on every healthy card — `uplink` (0 < 200),
 *  `nat_dialable` (absent is not true) and `hops_vs_rtt` (an absent pool RTT defaults to 9000ms).
 *  Every 5090 on the 2026-07-28 stranger ring was therefore admitted as `verifier` (receipt
 *  stranger-serve-20260728, bug S3).
 *
 *  What that costs TODAY is smaller than the receipt says, and worth being precise about: the
 *  verdict is stored by setNodeRole and nothing reads it back — getNodeRole has no callers, admit()
 *  is a coarse VRAM/subnet floor, and formSwarm's role() filter is the REPUTATION oracle, not this.
 *  So the roles are currently write-only and a pool of verifiers still forms a ring. The cost is
 *  that the one measurement the network makes about a stranger is garbage for everyone who wants to
 *  use it — placement (up_mbps null on every candidate), pricing, and the moment admission is
 *  actually enforced.
 *
 *  Needs the probe slice on disk; null = announce falls back to basics. */
export function probeMeasure(peers: string[] = []): Record<string, unknown> | null {
  const args = ['-m', 'shard.probe', '--measure', '--dir', MODEL_DIR, '--backend', 'auto'];
  if (peers.length) {
    args.push('--peers', peers.join(','), '--port', String(NETPROBE_PORT));
    // Behind a port-mapping NAT (docker, vast, a home router) the port a peer must dial back is
    // not the port we bind; without this every honest node reads nat_dialable:false.
    if (NETPROBE_ADVERTISE) args.push('--dialback-advertise', String(NETPROBE_ADVERTISE));
  }
  const r = spawnSync(pythonBin(), args, { encoding: 'utf8', cwd: shardCwd(), timeout: 15 * 60_000 });
  if (r.error || r.status !== 0) {
    log(`probe --measure unavailable (${(r.stderr || r.error?.message || '').toString().trim().slice(-200)})`);
    return null;
  }
  try {
    // vLLM's logger writes INFO lines to stdout before the JSON — parse from the first '{'
    // (the same defense the proven operator harness uses)
    const i = r.stdout.indexOf('{');
    return JSON.parse(i >= 0 ? r.stdout.slice(i) : r.stdout);
  } catch {
    log(`probe --measure: unparseable output`);
    return null;
  }
}

function spawnPull(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // the abort signal kills the pull when the assignment dissolves mid-download —
    // a 30 GB fetch must never outlive the swarm that asked for it
    const p = spawn(pythonBin(), args, { cwd: shardCwd(), stdio: ['ignore', 'pipe', 'pipe'], signal });
    p.stdout.on('data', (d: Buffer) => process.stdout.write(`[pull] ${d}`));
    p.stderr.on('data', (d: Buffer) => process.stderr.write(`[pull] ${d}`));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pull exited ${code}`))));
  });
}

/** Pull layer range [lo, hi) into MODEL_DIR — VERIFIED, always: `python -m shard.fetch` against
 *  the resolved signed manifest, PEERS-FIRST (bootstrap = ringmate + standby-seeder sidecar
 *  multiaddrs) then the HF mirror, re-hashing every byte. The engine additionally pins the
 *  manifest itself: bytes==CID when the assignment ref carries one, publisher==the baked pin,
 *  and the model_id/layer_count cross-checks. There is NO unverified fallback here — a missing
 *  manifest or pin fails the serve loudly instead of quietly serving unpinned weights. */
export function pullRange(lo: number, hi: number, head: boolean, tail: boolean,
  opts: {
    bootstrap?: string[]; role?: 'stage' | 'coordinator';
    manifestRef?: string; expectModelId?: string; expectLayerCount?: number;
  } = {}, signal?: AbortSignal): Promise<void> {
  if (!existsSync(MANIFEST_FILE)) {
    return Promise.reject(new Error(
      'no signed manifest on disk (network resolution failed?) — refusing an unverified pull'));
  }
  if (!MANIFEST_PUBKEY && !MANIFEST_DEV_FILE) {
    return Promise.reject(new Error(
      'no publisher pin in this build (MANIFEST_PUBKEY empty) and no dev manifest hatch — refusing'));
  }
  const args = ['-m', 'shard.fetch', '--manifest', MANIFEST_FILE, '--dir', MODEL_DIR,
    '--lo', String(lo), '--hi', String(hi), '--role', opts.role ?? 'stage',
    '--sidecar', SIDECAR_BIN, '--key', NODE_KEY_FILE];
  if (MANIFEST_PUBKEY) args.push('--pubkey', MANIFEST_PUBKEY);
  if (opts.manifestRef?.startsWith('mf1:')) args.push('--manifest-cid', opts.manifestRef);
  if (opts.expectModelId) args.push('--expect-model-id', opts.expectModelId);
  if (opts.expectLayerCount != null) args.push('--expect-layer-count', String(opts.expectLayerCount));
  if (head) args.push('--head');
  if (tail) args.push('--tail');
  if (opts.bootstrap?.length) args.push('--bootstrap', opts.bootstrap.join(','));
  return spawnPull(args, signal);
}

/** The UNVERIFIED probe-slice pull (m25_pull_range) — measurement-only: the slice feeds
 *  `shard.probe --measure` and is never served. Serving pulls go through pullRange, always. */
export function pullProbeSliceRaw(lo: number, hi: number, signal?: AbortSignal): Promise<void> {
  return spawnPull([join('phase0', 'm25_pull_range.py'), '--lo', String(lo), '--hi', String(hi),
    '--dir', MODEL_DIR], signal);
}

export interface SidecarHandle {
  proc: ChildProcess;
  /** the dialable multiaddrs the sidecar prints as ADDR lines at boot (each /p2p/<PeerId>-
   *  suffixed); resolves once the tunnel is up. These ride in the announce so ring peers
   *  can dial this node's forward legs. */
  addrs: Promise<string[]>;
}

/** The local sidecar: public libp2p listener + inbound tunnel to the loopback engine port.
 *  `forwards` = "127.0.0.1:PORT=<peer maddr>" ring legs (a serving non-tail stage dials its
 *  successor through one); `allow` = PeerIds permitted to open inbound streams (the C2
 *  cryptographic neighbour pin — empty keeps it open, standby/legacy behavior); `seed` =
 *  "manifest.json=modelDir" — announce + serve the complete manifest shards on disk over the
 *  shard DHT/blockx (harmless with zero complete shards: the Go seeder no-ops, tunnel unaffected). */
export function startSidecar(opts: { forwards?: string[]; allow?: string[]; seed?: string;
  relays?: string[]; announce?: string[] } = {}): SidecarHandle {
  const args = ['-key', NODE_KEY_FILE, '-listen', `/ip4/0.0.0.0/tcp/${LIBP2P_PORT}`, '-quic',
    '-inbound', `127.0.0.1:${ENGINE_PORT}`];
  for (const f of opts.forwards ?? []) args.push('-forward', f);
  for (const a of opts.allow ?? []) args.push('-allow', a);
  if (opts.seed) args.push('-seed', opts.seed);
  // Advertise the DIRECT public addr(s). Inside docker/NAT the sidecar only sees its container-
  // internal addr (172.17.x.x) and would announce THAT — ringmates then dial an unroutable private
  // IP and the ring silently never forms (a real bug on any port-mapped / home box, not just vast).
  // -announce prepends the reachable addr so peers get a dialable one; falls back to relay/DCUtR if
  // the direct dial still fails. Empty = old behavior (announce whatever libp2p observed).
  for (const a of opts.announce ?? []) args.push('-announce', a);
  // NAT'd home nodes reserve on public relays (rendezvous only — DCUtR upgrades to direct, so a
  // relay never carries the data path). List = network-resolved (P0-#3) + the operator env.
  if (opts.relays?.length) args.push('-relays', opts.relays.join(','));
  const proc = spawn(SIDECAR_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const addrs: string[] = [];
  let resolveAddrs!: (a: string[]) => void;
  const addrsP = new Promise<string[]>((res) => { resolveAddrs = res; });
  let buf = '';
  let grace: ReturnType<typeof setTimeout> | null = null;
  const scan = (d: Buffer) => {
    buf = (buf + d.toString()).slice(-32768);
    for (const line of buf.split('\n')) {
      const m = /(?:^|\s)ADDR (\S+)/.exec(line);
      if (m && !addrs.includes(m[1])) addrs.push(m[1]);
      // ADDR lines print AFTER "tunnel up" — resolve on a short grace so they're all in
      if (/tunnel up/.test(line) && !grace) {
        grace = setTimeout(() => resolveAddrs([...addrs]), 1500);
        grace.unref();
      }
    }
  };
  proc.stdout!.on('data', (d: Buffer) => { process.stdout.write(`[sidecar] ${d}`); scan(d); });
  proc.stderr!.on('data', (d: Buffer) => { process.stderr.write(`[sidecar] ${d}`); scan(d); });
  // belt-and-braces: never leave the addrs promise hanging (a dead sidecar resolves empty and
  // the caller's exit watcher handles the death)
  const t = setTimeout(() => resolveAddrs([...addrs]), 20_000);
  t.unref();
  proc.on('exit', () => resolveAddrs([...addrs]));
  return { proc, addrs: addrsP };
}

/** Order a peer's announced multiaddrs by dialability: public direct first, relay circuit
 *  next, private/loopback last (still tried — two nodes behind one NAT may share a LAN). */
export function pickDialAddrs(addrs: string[]): string[] {
  const rank = (a: string) => {
    if (a.includes('/p2p-circuit')) return 1;
    const ip = /\/ip4\/(\d+\.\d+\.\d+\.\d+)\//.exec(a)?.[1];
    if (!ip) return 3;
    const priv = ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')
      || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
    return priv ? 2 : 0;
  };
  return [...addrs].sort((a, b) => rank(a) - rank(b));
}

/**
 * TCP-connect RTT to a set of peers' announced sidecar multiaddrs — the input to latency-aware
 * placement (the orchestrator used to plan every ring on a constant 30 ms matrix, so ring order,
 * head election and the candidate trim were all decided by announce arrival order).
 *
 * A connect handshake against the sidecar's OWN listener, which is already up: no probe endpoint to
 * run, no port to open, nothing to install. It is also exactly how the one full N×N mesh we have
 * ever measured was taken (min-of-N TCP connect), so the numbers are comparable to the calibration.
 * `shard.probe --net-only` measures more (receiver-timed uplink, nonce dial-back) but needs every
 * peer to be running `--serve`, which strangers' daemons are not.
 *
 * Only DIRECT tcp addrs are dialed: a `/p2p-circuit` addr has no host to connect to, and timing a
 * relay hop would measure the relay, not the peer. A peer we can't time is simply omitted — the
 * orchestrator fills unmeasured pairs itself, and reporting a guess would be worse than silence.
 */
export async function measureRttMs(peers: { nodeId: string; addrs: string[] }[],
  opts: { limit?: number; attempts?: number; timeoutMs?: number; concurrency?: number } = {}):
  Promise<Record<string, number>> {
  const { limit = 16, attempts = 3, timeoutMs = 1500, concurrency = 4 } = opts;
  const targets = peers.slice(0, limit)
    .map((p) => ({ nodeId: p.nodeId, hp: tcpHostPort(p.addrs) }))
    .filter((t): t is { nodeId: string; hp: { host: string; port: number } } => t.hp !== null);
  const out: Record<string, number> = {};
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < targets.length; i = next++) {
      const { nodeId, hp } = targets[i];
      let best: number | null = null;
      for (let a = 0; a < attempts; a += 1) {
        const ms = await connectMs(hp.host, hp.port, timeoutMs);
        if (ms !== null && (best === null || ms < best)) best = ms;   // min-of-N: the unqueued path
      }
      if (best !== null) out[nodeId] = Math.round(best * 100) / 100;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return out;
}

/** host:port of the first DIRECT tcp multiaddr (loopback and relay circuits are not timeable peers).
 *  The port is range-checked because these addrs are UNVERIFIED announce data: `net.connect` throws
 *  SYNCHRONOUSLY on a port above 65535, which would take the whole round down instead of one peer. */
function tcpHostPort(addrs: string[]): { host: string; port: number } | null {
  for (const a of addrs) {
    if (a.includes('/p2p-circuit')) continue;
    const m = /^\/ip4\/(\d+\.\d+\.\d+\.\d+)\/tcp\/(\d+)/.exec(a);
    if (!m || m[1].startsWith('127.')) continue;
    const port = Number(m[2]);
    if (port > 0 && port <= 65535) return { host: m[1], port };
  }
  return null;
}

/** One connect handshake, in ms; null if it timed out, was refused, or could not be attempted. */
function connectMs(host: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;
    let sock: ReturnType<typeof netConnect> | null = null;
    const finish = (v: number | null) => { if (!settled) { settled = true; sock?.destroy(); resolve(v); } };
    try {
      sock = netConnect({ host, port });
    } catch { return resolve(null); }     // never leave the round's promise unresolved
    sock.setTimeout(timeoutMs, () => finish(null));
    sock.on('connect', () => finish(performance.now() - t0));
    sock.on('error', () => finish(null));
  });
}

/** The graph-aux perf trio, defaulted ON for every engine process (stage + coordinator) unless
 *  the operator already set it. CUDA-graph + static-KV + SDPA are bit-exact and need no extra
 *  weights — a ~2× speedup over the eager path. WITHOUT this a stranger's `--mode shard` (no env)
 *  serves at the no-graph floor, so real rings would be ~2× slower than they should be. EAGLE is
 *  NOT defaulted here (it needs the drafter head; enable it explicitly once provisioned). */
function perfDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries({ M25_CUDA_GRAPH: '1', M25_STATIC_KV: '1', M25_SDPA: '1' })) {
    if (process.env[k] === undefined) out[k] = v;   // operator env always wins
  }
  return out;
}

export interface StageSpec {
  stageIndex: number;
  nstages: number;
  lo: number;
  hi: number;
  isTail: boolean;
  /** the per-swarm C2 engine-auth token (orchestrator-minted, shared ring-wide) — armed as
   *  SHARD_SWARM_TOKEN so every engine hop requires an identity-bound greeting carrying it. This
   *  closes the head allow-all hole: the head's sidecar accepts any dialer, but the engine rejects
   *  any greeting without the token, so a stranger who learns the head's addr cannot inject frames. */
  swarmToken?: string;
}

export interface StageReady {
  stage: number;
  nstages: number;
  lo: number;
  hi: number;
  port: number;
  pid: number;
  tail: boolean;
}

/** One supervised `python -m shard.stage` process. Parses the stdout contract; the caller
 *  owns restart policy (self-heal lives in the worker, not here). */
export class StageProcess {
  private proc: ChildProcess | null = null;
  private buf = '';
  private exited = false;
  ready: StageReady | null = null;
  onReady?: (info: StageReady) => void;
  onExit?: (code: number | null, fatal: string | null) => void;
  private fatal: string | null = null;
  /** the per-launch probe-door secret (challenge spot-checks) — daemon-local, deliberately
   *  distinct from the ring-wide swarm token; the engine binds its loopback door iff set. */
  probeToken = '';

  start(spec: StageSpec): void {
    this.probeToken = randomBytes(16).toString('hex');
    const args = ['-m', 'shard.stage',
      '--stage', String(spec.stageIndex), '--nstages', String(spec.nstages),
      '--lo', String(spec.lo), '--hi', String(spec.hi),
      '--port', String(ENGINE_PORT), '--dir', MODEL_DIR, '--receipts'];
    if (!spec.isTail) args.push('--next', `127.0.0.1:${FORWARD_PORT}`);
    this.proc = spawn(pythonBin(), args, {
      cwd: shardCwd(),
      // receipts must be signed by the SAME key the announce advertised (settlement pins it);
      // the probe token/port arm the engine's loopback challenge door (env-only — never argv);
      // SHARD_SWARM_TOKEN arms the ring-wide C2 engine-auth gate (never argv: argv is world-readable)
      env: { ...process.env, ...perfDefaults(), SHARD_NODE_KEY: RECEIPT_KEY_FILE,
             SHARD_PROBE_TOKEN: this.probeToken, SHARD_PROBE_PORT: String(PROBE_PORT),
             ...(spec.swarmToken ? { SHARD_SWARM_TOKEN: spec.swarmToken } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc.stdout!.on('data', (d: Buffer) => this.onStdout(d));
    this.proc.stderr!.on('data', (d: Buffer) => process.stderr.write(`[stage] ${d}`));
    // spawn failure (ENOENT, moved venv) fires 'error' WITHOUT 'exit' — both must land in
    // the same one-shot exit path or the unhandled 'error' event kills the whole daemon
    this.proc.on('error', (e) => { this.fatal = this.fatal || `spawn failed: ${e.message}`; this.fireExit(null); });
    this.proc.on('exit', (code) => this.fireExit(code));
  }

  private fireExit(code: number | null): void {
    if (this.exited) return;
    this.exited = true;
    this.onExit?.(code, this.fatal);
  }

  private onStdout(d: Buffer): void {
    process.stdout.write(`[stage] ${d}`);
    this.buf = (this.buf + d.toString()).slice(-65536);
    for (const line of this.buf.split('\n')) {
      if (!this.ready && line.startsWith('SHARD_STAGE_READY ')) {
        try {
          this.ready = JSON.parse(line.slice('SHARD_STAGE_READY '.length)) as StageReady;
          this.onReady?.(this.ready);
        } catch { /* torn line still in the buffer — the next chunk completes it */ }
      } else if (line.startsWith('SHARD_STAGE_FATAL ')) {
        this.fatal = line.slice('SHARD_STAGE_FATAL '.length).trim();
      }
    }
  }

  stop(): void {
    const p = this.proc;
    if (p && p.exitCode === null) {
      this.onExit = undefined;              // an operator stop is not a crash — no self-heal
      p.kill('SIGTERM');
      // a stage wedged in a CUDA sync ignores SIGTERM and squats the engine port — escalate
      const t = setTimeout(() => { if (p.exitCode === null) p.kill('SIGKILL'); }, 10_000);
      t.unref();
      p.on('exit', () => clearTimeout(t));
    }
    this.proc = null;
  }
}

// ── the challenge probe client (P0-#1 spot-checks) ──────────────────────────────────────
// Speaks the engine's tensor-free frame codec on the stage's loopback probe door:
// [8B BE body length][4B BE header length][JSON header]. Tensor-free messages pass through
// shard/transport.py's encode() unchanged, so plain JSON is the whole wire.

export interface ProbeReply {
  ok?: number;
  sketch?: { n: number; norm: number; proj: number[]; seed?: string };
  error?: string;
  lo?: number;
  hi?: number;
  t_ms?: number;
}

function frame(obj: unknown): Buffer {
  const head = Buffer.from(JSON.stringify(obj), 'utf8');
  const body = Buffer.alloc(12 + head.length);
  body.writeBigUInt64BE(BigInt(4 + head.length), 0);
  body.writeUInt32BE(head.length, 8);
  head.copy(body, 12);
  return body;
}

/** One challenge request against the local stage's probe door; resolves the engine's reply
 *  (ok+sketch or a structured error), rejects on transport/timeout trouble. */
export function probeStage(req: Record<string, unknown>, opts: { port?: number; timeoutMs?: number } = {}):
  Promise<ProbeReply> {
  const port = opts.port ?? PROBE_PORT;
  return new Promise((resolve, reject) => {
    const sock = netConnect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; sock.destroy(); fn(); } };
    sock.setTimeout(opts.timeoutMs ?? 15_000, () => finish(() => reject(new Error('probe timeout'))));
    sock.on('error', (e) => finish(() => reject(e)));
    sock.on('connect', () => sock.write(frame({ op: 'challenge', ...req })));
    sock.on('data', (d) => {
      chunks.push(d);
      const buf = Buffer.concat(chunks);
      if (buf.length < 8) return;
      const n = Number(buf.readBigUInt64BE(0));
      if (buf.length < 8 + n) return;
      try {
        const hlen = buf.readUInt32BE(8);
        resolve(JSON.parse(buf.subarray(12, 12 + hlen).toString('utf8')) as ProbeReply);
      } catch (e) {
        reject(e as Error);
      }
      finish(() => {});
    });
    sock.on('close', () => finish(() => reject(new Error('probe door closed before replying'))));
  });
}

/** Answer one spot-check: probe the local stage, retrying `busy` (a mid-job probe is refused by
 *  design — the door re-opens between jobs) until `deadlineAt`. Returns the sketch, or the last
 *  structured error ('busy' included) for the daemon to report — an honest node ALWAYS reports
 *  rather than going silent, because a silent suspect is scored as a cheat server-side. */
export async function answerChallenge(
  req: { token: string; proj_seed: string; n_tokens: number; lo: number; hi: number;
         seed?: string; x?: number[][] },
  deadlineAt: number, opts: { port?: number; retryMs?: number } = {},
): Promise<ProbeReply> {
  const retryMs = opts.retryMs ?? 5_000;
  let last: ProbeReply = { error: 'probe unreachable' };
  for (;;) {
    try {
      last = await probeStage(req, { port: opts.port });
      if (last.error !== 'busy') return last;
    } catch (e: any) {
      last = { error: `probe transport: ${e.message}` };
    }
    if (Date.now() + retryMs >= deadlineAt) return last;
    await new Promise((r) => setTimeout(r, retryMs));
  }
}

// ── the coordinator seam (leg 8, node half) ─────────────────────────────────────────────

export interface CoordJob {
  jobId: string;
  swarmId: string;
  nonce: string;
  messages: unknown[];
  maxNew?: number;
  reasoning?: boolean;
  tools?: unknown[];
}

export interface CoordJobDone {
  jobId: string;
  ok: boolean;
  response: string;
  tokensGenerated: number;
  receipts: unknown[];
  error?: string;
}

/** One supervised `python -m shard.coordinate` process on the HEAD node — the serving half
 *  of leg 8. Long-lived (drafter weights load once): jobs go in as NDJSON lines on stdin,
 *  results come back on the stdout contract mirroring shard.stage's:
 *    SHARD_COORD_READY <json>          — pipe + return sockets up, jobs accepted
 *    SHARD_JOB_TOKEN {jobId, delta}    — one committed decode delta (relay to swarm:job_token)
 *    SHARD_JOB_DONE  <CoordJobDone>    — job finished (relay to swarm:job_complete + settle)
 *    SHARD_JOB_FATAL {jobId?, error}   — job (or boot) failed; process may exit
 *  One job at a time (the engine coordinator is single-job); the caller serializes. */
export class CoordinatorProcess {
  private proc: ChildProcess | null = null;
  private buf = '';
  private exited = false;
  private fatal: string | null = null;
  ready = false;

  /** Is there a LIVE process behind this object? Between a death and the next relaunch the object
   *  outlives its process, so a caller testing `coord != null` mistakes a corpse for a coordinator. */
  get running(): boolean {
    return this.proc !== null && !this.exited && this.proc.exitCode === null;
  }

  onReady?: () => void;
  onToken?: (jobId: string, delta: string) => void;
  onDone?: (done: CoordJobDone) => void;
  onJobError?: (jobId: string | null, error: string) => void;
  onExit?: (code: number | null, fatal: string | null) => void;

  /** `degraded`: restart with the speculative-decode levers OFF (M25_EAGLE/M25_TREE=0) — the
   *  proven plain ring on the wire. The daemon flips this on after a stall-kill (an
   *  EAGLE-implicated wedge, P0-#5 L3) so the re-launched coordinator serves reliably instead of
   *  walking back into the same wedge; speed is traded for a swarm that actually serves. */
  start(opts: { degraded?: boolean; swarmToken?: string } = {}): void {
    // gateway-parity endpoints (phase0/m25_scatter_pipe.py layout): pipe = the LOCAL head
    // engine; tail = the head sidecar's return -forward that tunnels to the tail's engine.
    const args = ['-m', 'shard.coordinate',
      '--head', `127.0.0.1:${ENGINE_PORT}`, '--tail', `127.0.0.1:${RETURN_PORT}`,
      '--dir', MODEL_DIR, '--receipts'];
    this.proc = spawn(pythonBin(), args, {
      cwd: shardCwd(),
      env: {
        ...process.env, ...perfDefaults(), SHARD_NODE_KEY: RECEIPT_KEY_FILE,
        // the coordinator dials the head engine + the tail return — it must greet with the same
        // ring-wide token, or the token-armed engine rejects it (C2 auth)
        ...(opts.swarmToken ? { SHARD_SWARM_TOKEN: opts.swarmToken } : {}),
        ...(opts.degraded ? { M25_EAGLE: '0', M25_TREE: '0' } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout!.on('data', (d: Buffer) => this.onStdout(d));
    this.proc.stderr!.on('data', (d: Buffer) => process.stderr.write(`[coord] ${d}`));
    this.proc.on('error', (e) => { this.fatal = this.fatal || `spawn failed: ${e.message}`; this.fireExit(null); });
    this.proc.on('exit', (code) => this.fireExit(code));
  }

  /** Queue one job (NDJSON on stdin; the python side reads jobs serially). */
  submit(job: CoordJob): void {
    if (!this.proc || this.proc.exitCode !== null) throw new Error('coordinator not running');
    this.proc.stdin!.write(JSON.stringify(job) + '\n');
  }

  private fireExit(code: number | null): void {
    if (this.exited) return;
    this.exited = true;
    this.onExit?.(code, this.fatal);
  }

  private onStdout(d: Buffer): void {
    process.stdout.write(`[coord] ${d}`);
    this.buf += d.toString();
    // consume COMPLETE lines only (token deltas are payload — a torn JSON line must wait
    // for its tail, and the SHARD_STAGE-style lastIndexOf-rescan would double-fire tokens)
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      try {
        if (line.startsWith('SHARD_COORD_READY')) {
          this.ready = true;
          this.onReady?.();
        } else if (line.startsWith('SHARD_JOB_TOKEN ')) {
          const t = JSON.parse(line.slice('SHARD_JOB_TOKEN '.length)) as { jobId: string; delta: string };
          this.onToken?.(t.jobId, t.delta);
        } else if (line.startsWith('SHARD_JOB_DONE ')) {
          this.onDone?.(JSON.parse(line.slice('SHARD_JOB_DONE '.length)) as CoordJobDone);
        } else if (line.startsWith('SHARD_JOB_FATAL ')) {
          const f = JSON.parse(line.slice('SHARD_JOB_FATAL '.length)) as { jobId?: string; error?: string };
          this.fatal = this.fatal || f.error || 'coordinator fatal';
          this.onJobError?.(f.jobId ?? null, f.error ?? 'coordinator fatal');
        }
      } catch (e: any) {
        log(`coordinator: unparseable contract line (${e.message}): ${line.slice(0, 200)}`);
      }
    }
  }

  stop(): void {
    const p = this.proc;
    if (p && p.exitCode === null) {
      this.onExit = undefined;
      p.kill('SIGTERM');
      const t = setTimeout(() => { if (p.exitCode === null) p.kill('SIGKILL'); }, 10_000);
      t.unref();
      p.on('exit', () => clearTimeout(t));
    }
    this.proc = null;
  }
}
