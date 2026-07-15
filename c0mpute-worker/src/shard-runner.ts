// Subprocess seams for shard mode — every place the daemon shells out: the Go sidecar
// (libp2p identity + tunnels), the shard engine (`python -m shard.*`), and nvidia-smi.
// The daemon supervises; the engine does the physics. Stage processes speak the stdout
// contract shipped with `python -m shard.stage` (shard PR #104): SHARD_STAGE_READY /
// SHARD_STAGE_FATAL lines a supervisor can wait on.

import { spawn, spawnSync, ChildProcess } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const SHARD_HOME = join(homedir(), '.c0mpute');
export const NODE_KEY_FILE = join(SHARD_HOME, 'node.key');        // libp2p identity (sidecar-minted, 0600)
export const RECEIPT_KEY_FILE = join(SHARD_HOME, 'receipt.key');  // engine receipt-signing key (python-minted)
// TODO(leg7): NODE_DAEMON.md §1 wants ONE key for libp2p + announce + receipts; today the sidecar
// (libp2p protobuf) and the engine (raw ed25519) use different on-disk formats, so the daemon
// manages both files under ~/.c0mpute until the formats converge.

// Port layout mirrors phase0/m25_scatter_pipe.py: the engine binds loopback (the local sidecar
// is the only legitimate dialer); the sidecar owns the public listener + the ring tunnels.
export const LIBP2P_PORT = 29600;
export const ENGINE_PORT = 29610;
export const FORWARD_PORT = 29611;

const PYTHON = process.env.C0MPUTE_SHARD_PYTHON || 'python3';
const SIDECAR_BIN = process.env.C0MPUTE_SIDECAR_BIN || join(SHARD_HOME, 'bin', 'sidecar');
// A shard checkout (or the flat runtime-artifact layout) to run `python -m shard.*` from.
export const SHARD_REPO = process.env.C0MPUTE_SHARD_REPO || join(SHARD_HOME, 'shard');
export const MODEL_DIR = process.env.C0MPUTE_SHARD_MODEL_DIR || join(SHARD_HOME, 'models', 'minimax-m2.5');

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
  const r = spawnSync(PYTHON, ['-c', py, RECEIPT_KEY_FILE], { encoding: 'utf8', cwd: shardCwd() });
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

/** `python -m shard.probe --measure` — the measured capability vector (footprint, transient,
 *  layer_ms, fast-kernel). Needs the probe slice on disk; null = announce falls back to basics. */
export function probeMeasure(): Record<string, unknown> | null {
  const r = spawnSync(PYTHON, ['-m', 'shard.probe', '--measure', '--dir', MODEL_DIR, '--backend', 'auto'],
    { encoding: 'utf8', cwd: shardCwd(), timeout: 15 * 60_000 });
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

/** Pull layer range [lo, hi) into MODEL_DIR.
 *  TODO(leg7): peers-first verified fetch (shard.fetch.fetch_block_range + ChainProvider — the
 *  live-proven torrent path) once it grows a CLI; until then the HF mirror pull, which is the
 *  same bytes minus the peer sourcing. */
export function pullRange(lo: number, hi: number, head: boolean, tail: boolean,
  signal?: AbortSignal): Promise<void> {
  const args = [join('phase0', 'm25_pull_range.py'), '--lo', String(lo), '--hi', String(hi),
    '--dir', MODEL_DIR];
  if (head) args.push('--head');
  if (tail) args.push('--tail');
  return new Promise((resolve, reject) => {
    // the abort signal kills the pull when the assignment dissolves mid-download —
    // a 30 GB fetch must never outlive the swarm that asked for it
    const p = spawn(PYTHON, args, { cwd: shardCwd(), stdio: ['ignore', 'pipe', 'pipe'], signal });
    p.stdout.on('data', (d: Buffer) => process.stdout.write(`[pull] ${d}`));
    p.stderr.on('data', (d: Buffer) => process.stderr.write(`[pull] ${d}`));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pull exited ${code}`))));
  });
}

/** The local sidecar: public libp2p listener + inbound tunnel to the loopback engine port.
 *  TODO(leg7): forward legs to ring peers — `swarm:assign` carries no multiaddrs (the
 *  NODE_DAEMON.md peer-addressing gap), so non-tail stages can't dial their successor yet. */
export function startSidecar(): ChildProcess {
  const args = ['-key', NODE_KEY_FILE, '-listen', `/ip4/0.0.0.0/tcp/${LIBP2P_PORT}`, '-quic',
    '-inbound', `127.0.0.1:${ENGINE_PORT}`];
  const relays = process.env.C0MPUTE_SHARD_RELAYS;  // NAT'd home nodes reserve on public relays
  if (relays) args.push('-relays', relays);
  const p = spawn(SIDECAR_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d: Buffer) => process.stdout.write(`[sidecar] ${d}`));
  p.stderr.on('data', (d: Buffer) => process.stderr.write(`[sidecar] ${d}`));
  return p;
}

export interface StageSpec {
  stageIndex: number;
  nstages: number;
  lo: number;
  hi: number;
  isTail: boolean;
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

  start(spec: StageSpec): void {
    const args = ['-m', 'shard.stage',
      '--stage', String(spec.stageIndex), '--nstages', String(spec.nstages),
      '--lo', String(spec.lo), '--hi', String(spec.hi),
      '--port', String(ENGINE_PORT), '--dir', MODEL_DIR, '--receipts'];
    if (!spec.isTail) args.push('--next', `127.0.0.1:${FORWARD_PORT}`);
    this.proc = spawn(PYTHON, args, {
      cwd: shardCwd(),
      // receipts must be signed by the SAME key the announce advertised (settlement pins it)
      env: { ...process.env, SHARD_NODE_KEY: RECEIPT_KEY_FILE },
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
