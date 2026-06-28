/**
 * Shard worker mode — a c0mpute worker that serves ONE pipeline stage of a big model
 * split across a ring of GPUs (not a whole model on one card like the Ollama path).
 *
 * On a `job:ring_assign` the worker:
 *   1. launches its libp2p sidecar (TCP<->libp2p tunnel) wired to its ring neighbour(s)
 *   2. launches a specpipe.py stage holding layers [lo,hi)
 *   3. (coordinator/head only) drives generation, streams tokens, forwards receipts
 *
 * This mirrors phase0/launch_libp2p.py — but driven by orchestrator messages over the
 * socket instead of a human over SSH. The COMMAND BUILDERS are pure + unit-tested; the
 * spawn/lifecycle is the integration layer (proven on the fleet smoke).
 *
 * Port scheme (matches launch_libp2p.py):
 *   29600 libp2p listen (the dialable public port)
 *   29610 engine listen  (sidecar -inbound delivers inbound libp2p streams here)
 *   29611 engine --next  (sidecar -forward carries it to the successor over libp2p)
 *   29612 coordinator ret (head sidecar -forward carries it to the tail, direct-return)
 */
import type { ChatMessage } from './inference.js';

// Ring assignment shape — mirrors lib/orchestrator/types.ts RingAssignment. Duplicated
// here (not imported) because the worker is a standalone npm package with its own rootDir,
// the same way it already redefines ChatMessage/ToolCall rather than importing the web lib.
export interface RingAssignment {
  jobId: string;
  model: string;
  stage: number;
  nstages: number;
  lo: number;
  hi: number;
  nextMultiaddr: string;
  nextPeerId: string;
  isCoordinator: boolean;
  tailMultiaddr: string;
  tailPeerId: string;
  messages?: ChatMessage[];
  maxNew?: number;
  K?: number;
  depth?: number;
}

export const SHARD_PORTS = {
  LIBP2P: 29600,
  ENG_IN: 29610,
  FWD_RING: 29611,
  FWD_RET: 29612,
} as const;

export interface ShardPaths {
  sidecar: string;     // path to the sidecar binary (e.g. /opt/shard/sidecar)
  specpipe: string;    // path to phase0/specpipe.py
  python: string;      // python3
  nodeKey: string;     // persisted libp2p node key (stable PeerId)
  workdir: string;     // cwd for the engine (where the model lives)
}

/**
 * Build the sidecar argv for a stage. Mirrors launch_libp2p.py launch_sidecar():
 *   - every non-head stage takes `-inbound 127.0.0.1:ENG_IN` (receive from predecessor)
 *   - every non-tail stage takes `-forward FWD_RING=<successor multiaddr>` (send onward)
 *   - the head ALSO takes `-forward FWD_RET=<tail multiaddr>` (direct-return channel)
 *
 * announce = the node's own public multiaddr minus the /p2p suffix (so reservations and
 * circuit addrs others receive are dialable through Vast's port mapping).
 */
export function buildSidecarArgs(a: RingAssignment, paths: ShardPaths, announce: string): string[] {
  const args = ['-key', paths.nodeKey, '-listen', `/ip4/0.0.0.0/tcp/${SHARD_PORTS.LIBP2P}`,
                '-announce', announce, '-quic'];
  // non-head stages receive inbound libp2p streams into the local engine
  if (!a.isCoordinator) {
    args.push('-inbound', `127.0.0.1:${SHARD_PORTS.ENG_IN}`);
  }
  // non-tail stages forward their --next to the successor
  if (a.stage < a.nstages - 1 && a.nextMultiaddr) {
    args.push('-forward', `127.0.0.1:${SHARD_PORTS.FWD_RING}=${a.nextMultiaddr}`);
  }
  // head forwards the coordinator return channel to the tail (when the ring has >1 stage)
  if (a.isCoordinator && a.nstages > 1 && a.tailMultiaddr) {
    args.push('-forward', `127.0.0.1:${SHARD_PORTS.FWD_RET}=${a.tailMultiaddr}`);
  }
  return args;
}

/**
 * Build the specpipe.py argv for a stage. Mirrors launch_libp2p.py launch_engine():
 * each stage serves layers [lo,hi); non-tail stages set --next to the LOCAL sidecar
 * forward port (the sidecar carries it to the successor over libp2p). --served-head on
 * stage 0 (embeds token ids). --fast --direct-return as in the proven path.
 */
export function buildStageArgs(a: RingAssignment, paths: ShardPaths, maxCtx = 16384, timeout = 1200): string[] {
  const args = [paths.specpipe, '--stage', String(a.stage), '--nstages', String(a.nstages),
                '--model', a.model, '--listen-port', String(SHARD_PORTS.ENG_IN),
                '--lo', String(a.lo), '--hi', String(a.hi),
                '--fast', '--direct-return', '--max-ctx', String(maxCtx), '--timeout', String(timeout)];
  // non-tail stages dial their successor via the local sidecar forward port
  if (a.stage < a.nstages - 1) {
    args.push('--next', `127.0.0.1:${SHARD_PORTS.FWD_RING}`);
  }
  if (a.stage === 0) {
    args.push('--served-head');
  }
  return args;
}

/**
 * Build the coordinator specpipe.py argv (head only). Drives generation with the n-gram
 * drafter over the pipelined path. --next is the LOCAL head engine; --tail is the local
 * sidecar return-forward (carried to the real tail over libp2p). SHARD_RECEIPTS=1 so each
 * stage signs its block and the coordinator sweeps + verifies coverage after gen.
 */
export function buildCoordinatorArgs(a: RingAssignment, paths: ShardPaths, maxCtx = 16384, timeout = 1200): string[] {
  const args = [paths.specpipe, '--coordinator', '--nstages', String(a.nstages),
                '--model', a.model, '--ngram-draft', '--ngram-n', '3', '--pipe',
                '--depth', String(a.depth ?? 2), '--K', String(a.K ?? 4),
                '--next', `127.0.0.1:${SHARD_PORTS.ENG_IN}`, '--direct-return',
                '--max-ctx', String(maxCtx), '--max-new', String(a.maxNew ?? 64),
                '--timeout', String(timeout)];
  if (a.nstages > 1) {
    args.push('--tail', `127.0.0.1:${SHARD_PORTS.FWD_RET}`);
  }
  return args;
}

/** Env for engine + coordinator: libp2p transport, receipts on. */
export function shardEngineEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, SHARD_TRANSPORT: 'libp2p', SHARD_RECEIPTS: '1' };
}
