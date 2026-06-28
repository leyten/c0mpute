/**
 * Shard ring assembly — turn a scheduler plan + the chosen workers into the per-stage
 * RingAssignment messages the orchestrator sends to each shard worker.
 *
 * This is the socket.io equivalent of phase0/launch_libp2p.py's hand-wiring: it decides,
 * for each stage, which successor it dials (nextMultiaddr/nextPeerId) and which stage is
 * the coordinator (head) that also drives generation and holds the tail's direct-return
 * channel. Pure data transform — no socket, no db, no engine — so it's $0 unit-testable.
 *
 * The wire topology mirrors launch_libp2p.py exactly:
 *   - stage k (k < N-1) forwards its --next to stage k+1's libp2p addr
 *   - the tail (stage N-1) only receives; its nextMultiaddr is ''
 *   - the head (stage 0) is the coordinator: it ALSO holds the tail's addr so the
 *     coordinator's direct-return channel reaches the tail (the --tail forward)
 */
import type { RingAssignment, ChatMessage } from './types';

/** One worker placed at a ring stage, with the transport identity its neighbours need. */
export interface RingStageWorker {
  socketId: string;
  workerId: string;
  privyUserId?: string;
  peerId: string;       // libp2p PeerId (sidecar -prove)
  multiaddr: string;    // dialable /ip4/.../tcp/PORT/p2p/PEERID
  lo: number;           // assigned layer block start (inclusive)
  hi: number;           // assigned layer block end (exclusive)
}

export interface RingGenParams {
  messages: ChatMessage[];
  maxNew?: number;
  K?: number;
  depth?: number;
}

/**
 * Build the ordered per-stage assignments for a ring.
 *
 * @param jobId    the job being served
 * @param model    model path/name every stage loads
 * @param ring     workers in RING ORDER (index 0 = head/coordinator), each carrying its
 *                 assigned [lo,hi). MUST tile [0:totalLayers] contiguously — caller gets
 *                 this from the scheduler plan; we re-validate to fail fast on a bad plan.
 * @param gen      generation params for the coordinator (head) to drive with
 * @param totalLayers  model layer count, to assert full coverage
 * @returns one RingAssignment per stage, in stage order. Throws on a malformed ring
 *          (gap/overlap, missing transport identity, empty).
 */
export function buildRingAssignments(
  jobId: string,
  model: string,
  ring: RingStageWorker[],
  gen: RingGenParams,
  totalLayers: number,
): RingAssignment[] {
  if (!ring || ring.length === 0) {
    throw new Error('buildRingAssignments: empty ring');
  }
  const n = ring.length;

  // Validate transport identity + contiguous full coverage before wiring anything —
  // a half-built ring that loses a stage mid-request is far costlier than a fast reject.
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const w = ring[i];
    if (!w.peerId || !w.multiaddr) {
      throw new Error(`buildRingAssignments: stage ${i} (${w.workerId}) missing peerId/multiaddr`);
    }
    if (w.lo !== cursor) {
      throw new Error(`buildRingAssignments: layer gap/overlap at stage ${i}: lo=${w.lo} expected ${cursor}`);
    }
    if (w.hi <= w.lo) {
      throw new Error(`buildRingAssignments: stage ${i} empty block [${w.lo}:${w.hi}]`);
    }
    cursor = w.hi;
  }
  if (cursor !== totalLayers) {
    throw new Error(`buildRingAssignments: coverage ends at ${cursor}, expected ${totalLayers}`);
  }

  const head = ring[0];
  const tail = ring[n - 1];

  return ring.map((w, i) => {
    const isHead = i === 0;
    const next = i < n - 1 ? ring[i + 1] : null;   // tail has no successor
    const a: RingAssignment = {
      jobId,
      model,
      stage: i,
      nstages: n,
      lo: w.lo,
      hi: w.hi,
      nextMultiaddr: next ? next.multiaddr : '',
      nextPeerId: next ? next.peerId : '',
      isCoordinator: isHead,
      // coordinator's direct-return channel targets the tail; non-head stages don't use it.
      // (when n === 1 the head IS the tail — degenerate ring, no separate return hop.)
      tailMultiaddr: isHead && n > 1 ? tail.multiaddr : '',
      tailPeerId: isHead && n > 1 ? tail.peerId : '',
    };
    if (isHead) {
      a.messages = gen.messages;
      a.maxNew = gen.maxNew;
      a.K = gen.K;
      a.depth = gen.depth;
    }
    return a;
  });
}
