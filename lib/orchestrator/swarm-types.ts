/**
 * Sharded-swarm control plane — the types for the permissionless loop.
 *
 * The existing orchestrator (orchestrator.ts / types.ts) drives ONE whole model per worker: a job
 * goes to a single box that holds the entire model. A 200B+ model doesn't fit one consumer card, so
 * this adds the other mode ALONGSIDE it (nothing here touches WorkerInfo/Job): a node announces its
 * hardware, c0mpute PLACES it into a pipeline of shards (each holding a layer range), the nodes PULL
 * their range (verified) and AUTO-FORM a ring that serves one model copy, and pay fans out PER SHARD.
 *
 * The placement + settlement decisions are shard's (the adversarially-tested planner + receipt crypto),
 * called over a stdio seam (`python3 -m shard.plan` / `shard.verify`) — deps point one way, c0mpute →
 * shard. This file is the c0mpute-side data model those seams read and write.
 */

/**
 * What a node advertises when it announces (§2a of NETWORK_ARCHITECTURE.md). Unlike WorkerCapabilities
 * (product feature flags: search/vision/tools), placement needs HARDWARE — because select_ring fits
 * layers to VRAM, balances stage times by measured compute, and clusters by latency + uplink.
 */
export interface NodeCapabilities {
  /** ed25519 public key (base64) — the node's libp2p identity, and the key its receipts are signed
   *  with. pubkey → account is how earnings are attributed; never self-reported earnings. */
  pubkey: string;
  gpu: string;                 // e.g. 'RTX 5090' (label; the real constraint is vramMb)
  freeVramMb: number;          // free VRAM the node offers to a shard
  subnet: string;              // /24 or datacenter key — two ring stages may NEVER share one (anti-colo)
  /** ≥1. Launch-bound decode slowdown vs an idle fast-CPU box (pyloop/0.10 + load); a throttled or
   *  oversubscribed box reports a higher factor and the planner gives it fewer layers or drops it. */
  cpuFactor?: number;
  upMbps?: number;             // measured uplink; when EVERY candidate reports it, placement is upload-aware
  geo?: string;                // region hint (display / coarse clustering)
}

/** A node in the admitted candidate pool, waiting to be placed into a swarm for `model`. */
export interface Candidate {
  nodeId: string;              // the socket / worker id
  cap: NodeCapabilities;
  model: string;               // the model this node loaded/can serve a shard of
  manifestRef: string;         // content-addressed manifest id it will pull its range from
  announcedAt: number;
}

/**
 * The assignment emitted to one node (`swarm:assign`), mirroring INTEGRATION.md §7. The node pulls
 * `[layerStart, layerEnd)` of `manifestRef` (verified — shard.fetch), warms, connects to `peers`, and
 * signals ready. role: 'coordinator' runs the head + spec-decode coordinator; 'stage' is a pipeline body.
 */
export interface StageAssignment {
  swarmId: string;
  model: string;
  manifestRef: string;
  stageIndex: number;          // position in the ring; 0 == head
  layerStart: number;
  layerEnd: number;
  role: 'coordinator' | 'stage';
  isHead: boolean;
  isTail: boolean;
  /** the per-job freshness nonce lives on the job, not here; this is the static ring shape */
  peers: { nodeId: string; pubkey: string; stageIndex: number; layerStart: number; layerEnd: number }[];
  coordinatorNodeId: string;
}

export type SwarmStatus = 'forming' | 'pulling' | 'ready' | 'serving' | 'degraded' | 'failed';

/** One live swarm = a pipeline of shards that end-to-end form one full model copy. */
export interface SwarmInfo {
  id: string;
  model: string;
  manifestRef: string;
  layerCount: number;
  status: SwarmStatus;
  order: string[];             // node ids, head-first (order[0] is the coordinator)
  coordinatorNodeId: string;
  stages: SwarmStage[];
  createdAt: number;
  /** whether the lossless wire was used this ring (drives receipt chain-checking at settlement) */
  losslessWire: boolean;
}

export interface SwarmStage {
  nodeId: string;
  pubkey: string;
  stageIndex: number;
  layerStart: number;
  layerEnd: number;
  layers: number;
  isHead: boolean;
  isTail: boolean;
  ready: boolean;              // pulled its range, warmed, ring-connected
}

/** The shape `python3 -m shard.plan` returns (a subset — the fields the control plane consumes). */
export interface RingPlan {
  order: string[];
  head: string;
  stages: { id: string; index: number; lo: number; hi: number; head: boolean; tail: boolean; layers: number }[];
  dropped: string[];
  roles?: Record<string, string>;
  step_ms: number;
  tok_s_per_g: number;
  k: number;
  request_ms?: number;
  prefill_ms?: number;
}

/** The shape `python3 -m shard.verify` returns. */
export interface SettleResult {
  ok: boolean;
  error?: string;
  layer_count?: number;
  stages?: { pubkey: string; lo: number; hi: number; layers: number }[];
}

/** One node's slice of a settled job — what the metering fan-out credits (the existing recordEarning). */
export interface StageEarning {
  nodeId: string;
  pubkey: string;
  layerStart: number;
  layerEnd: number;
  layers: number;
  tokens: number;              // this stage's share of the job's tokens
}
