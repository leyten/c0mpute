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
  /** The probe-MEASURED capability vector (shard.probe --measure, server-driven at node-bind — the
   *  node_role row, never a trusted self-report). Absent fields fall back to the model profile in
   *  shard.plan, so a homogeneous pool plans exactly as before. These are what let a hetero pool
   *  (96 GB cutlass card next to a marlin card next to a 5090) be placed at each card's OWN physics. */
  layerVramMb?: number;        // measured per-layer footprint for THIS arch/backend (cutlass ~2330, marlin ~4060)
  capLayers?: number;          // probe-verdict layer ceiling for this card (wins over the density rule)
  totalVramMb?: number;        // device total; the planner density-scales the proven cap to the card size
  loadPeakExtraMb?: number;    // measured load/run transient above resident (the admit-then-OOM gate)
  layerMs?: number;            // measured decode ms/layer (graph-replayed); overrides the modeled base
}

/** A node in the admitted candidate pool, waiting to be placed into a swarm for `model`. */
export interface Candidate {
  nodeId: string;              // the socket / worker id
  cap: NodeCapabilities;
  model: string;               // the model this node loaded/can serve a shard of
  manifestRef: string;         // content-addressed manifest id it will pull its range from
  account: string;             // the c0mpute account to credit — bound at announce, frozen onto the stage
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
  /** this stage holds boundary (leaky) layers or an end role — only ever assigned to trusted nodes
   *  when the swarm runs privacy pinning */
  boundary?: boolean;
  /** the wire mode the ring must run — the node uses it, and settlement chain-checks iff true. Decided
   *  by the swarm (from the model profile), NOT inferred, so the trust check matches the actual wire. */
  losslessWire: boolean;
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
  account: string;             // frozen at form time so a node that served then dropped is still paid
  stageIndex: number;
  layerStart: number;
  layerEnd: number;
  layers: number;
  isHead: boolean;
  isTail: boolean;
  boundary: boolean;           // trust-critical stage (boundary layers / head / tail) under pinning
  ready: boolean;              // pulled its range, warmed, ring-connected
}

/** The shape `python3 -m shard.plan` returns (a subset — the fields the control plane consumes). */
export interface RingPlan {
  order: string[];
  head: string;
  stages: { id: string; index: number; lo: number; hi: number; head: boolean; tail: boolean; layers: number;
            boundary?: boolean }[];
  dropped: string[];
  roles?: Record<string, string>;
  step_ms: number;
  tok_s_per_g: number;
  k: number;
  request_ms?: number;
  prefill_ms?: number;
  /** present iff the plan request carried `privacy` — the boundary-pinned placement summary */
  privacy?: { boundary_in: number; boundary_out: number; boundary_stages: string[] };
}

/**
 * One in-flight layer-block spot-check (shard/challenge.py over the socket): the SUSPECT and a
 * TRUSTED VERIFIER both derive the same seeded activation, run the suspect's layer block, and
 * return a sketch; `python3 -m shard.challenge` judges the pair. Refusal/timeout counts as a fail
 * (a cheater must not be able to dodge by going quiet).
 */
export interface SpotCheck {
  checkId: string;
  swarmId: string;
  model: string;
  manifestRef: string;
  suspectNodeId: string;
  suspectPubkey: string;
  verifierNodeId: string;
  verifierPubkey: string;
  layerStart: number;
  layerEnd: number;
  seed: string;                // both sides derive the identical challenge input from this
  nTokens: number;
  hiddenSize: number;
  deadlineAt: number;
  sketches: { suspect?: BlockSketch; verifier?: BlockSketch };
}

/** shard.challenge sketch — a compact fingerprint of a block output (fixed-seed 256-dim projection). */
export interface BlockSketch { n: number; norm: number; proj: number[] }

/** The `swarm:challenge` payload a node receives (both suspect and verifier get the same one). */
export interface SpotCheckAssignment {
  checkId: string;
  model: string;
  manifestRef: string;
  layerStart: number;
  layerEnd: number;
  seed: string;
  nTokens: number;
  hiddenSize: number;
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
  account: string;             // the c0mpute account to credit (frozen at form time; survives disconnect)
  layerStart: number;
  layerEnd: number;
  layers: number;
  tokens: number;              // this stage's share of the job's tokens
}
