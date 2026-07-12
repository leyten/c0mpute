/**
 * SwarmManager — the permissionless loop, c0mpute side.
 *
 *   announce → admit → place → assign → (nodes pull + form + serve) → settle → pay per shard
 *
 * The placement and settlement decisions belong to shard (the adversarially-tested `select_ring`
 * planner and the receipt crypto), reached over a stdio seam (`python3 -m shard.plan` / `shard.verify`).
 * This manager owns the c0mpute-side control flow around them: the admitted candidate pool, forming a
 * swarm when a model has enough capable nodes, emitting per-stage assignments, tracking readiness, and
 * — on job complete — verifying the coordinator's receipt set and fanning earnings out PER SHARD.
 *
 * It is orchestrator-agnostic: the socket transport, the earnings sink (the existing recordEarning),
 * and the seam runner are injected, so it runs headless in a test/sim and wires into orchestrator.ts
 * unchanged. Nothing here touches the whole-model WorkerInfo/Job path.
 *
 * TWO decisions here are leyten's (economics/policy), isolated as `SwarmConfig` so a redirect is one
 * line, not a refactor:
 *   • admission.mode  — 'curated' (allowlisted pubkeys; the betanet-first default) vs 'open'
 *                       (any node clearing a proven hardware floor). §10.3.
 *   • paySplit        — how a job's tokens divide across stages: 'layers' (proportional to work done;
 *                       the default) vs 'equal'. §6. A boundary-role premium would slot in here.
 *
 * Settlement is defended as an untrusted path (the coordinator is a volunteer node in the open case):
 * only the coordinator may settle a job, each (swarm, job) settles AT MOST ONCE, and the token count is
 * bounded. The DEEPER gap — the receipt set does not attest the token COUNT, so a coordinator's number
 * is trusted up to the cap — is the "coordinator-untrusted output attribution" item (INTEGRATION.md §6 /
 * PERMISSIONLESS_LOOP.md): a client/server-side token count must bind pay before real payout. Bounded here.
 */
import type {
  BlockSketch, Candidate, NodeCapabilities, RingPlan, SettleResult, SpotCheck,
  SpotCheckAssignment, StageAssignment, StageEarning, SwarmInfo, SwarmStage,
} from './swarm-types';
import type { ReputationEventKind, SwarmRole } from './reputation';

/** Engine memory/compute profile for a model — passed to the planner seam (shard/plan.py M25_PROFILE). */
export interface ModelProfile {
  layerCount: number;
  layer_vram_mb?: number;
  kv_mb_per_layer?: number;
  layer_ms_base?: number;
  reserve_mb?: number;
  head_reserve_mb?: number;
  cap_layers?: number;
  // upload-aware terms (optional): activation bytes so the planner can weigh residential uplinks
  prefill_bytes?: number;
  decode_bytes?: number;
  decode_steps?: number;
  /** wire mode the ring runs. Lossless (default) => settlement chain-checks the receipts (catches a
   *  spliced/fabricated activation root); fp8 wire is lossy so the chain can't hold and is not checked. */
  losslessWire?: boolean;
}

/** The stdio seam into shard. Injected so tests use a fake and prod spawns python. */
export interface Seam {
  plan(req: unknown): Promise<RingPlan | null>;
  verify(req: unknown): Promise<SettleResult>;
  /** judge a spot-check sketch pair (`python3 -m shard.challenge`) — torch-free on the control plane */
  challenge(req: { a: BlockSketch; b: BlockSketch; cos_thresh?: number }):
    Promise<{ cosine: number; rel_norm: number; passed: boolean; error?: string }>;
}

/** The trust oracle placement + admission consult — GradedReputation implements this shape. */
export interface TrustOracle {
  roleFor(pubkey: string): SwarmRole;
  record(pubkey: string, kind: ReputationEventKind): number;
}

export interface SwarmConfig {
  admission:
    | { mode: 'curated'; allowlist: Set<string> }   // pubkeys we run / vetted — betanet-first
    | { mode: 'open'; minFreeVramMb: number };       // permissionless: any node past a proven floor
  paySplit: 'layers' | 'equal';
  /** minimum candidates before a swarm is formed (must be able to hold the model; k is decided by the
   *  planner, this is just "don't try with too few"). */
  minCandidates: number;
  /** BOUNDARY-LAYER PINNING — the opt-in privacy tier. Keeps the first boundaryIn / last boundaryOut
   *  layers + the head/tail roles on TRUSTED (staked) nodes; strangers hold only deep-middle. This
   *  buys prompt privacy at the cost of needing trusted nodes IN every ring (~2 of ~5 stages), which
   *  taxes open supply — so it is NOT the PoC default (leyten, 2026-07-08: prompt privacy is deferred,
   *  the PoC runs fully open). null = OFF: any machine may hold any slice. The mechanism is built +
   *  adversarially proven and set per-request/per-swarm for a future private tier (PERMISSIONLESS_LOOP.md §7). */
  privacy: { boundaryIn: number; boundaryOut: number } | null;
  /** how long a challenged node has to return its spot-check sketch (the verifier may need to pull
   *  the suspect's layer range first); past the deadline the SUSPECT fails — refusal is not free. */
  spotCheckTimeoutMs: number;
}

// DECIDED (leyten):
//   • Admission — OPEN from the start (2026-07-07): open supply is the endgame; curated risks a bottleneck.
//   • Pay — by layers (paid for the work done; simplest + ungameable).
//   • Privacy — DEFERRED for the PoC (2026-07-08): let ANY machine join ANY swarm. Mandatory boundary
//     pinning would need trusted nodes in every ring (~40% of supply) and re-introduce the very
//     bottleneck open admission avoids. Prompt privacy is a KNOWN, ACCEPTED limitation of the PoC — a
//     node in the ring can observe the activations it processes. What we DO run on the open network is
//     CHEAT detection, which needs no trusted stage in the ring:
//        - receipts: signed per-stage, chained (out_root[i]==in_root[i+1]) — skip/fabricate/replay ⇒ pay
//          nobody. Structural fraud caught for free on every job.
//        - spot-check: a we-run staked AUDITOR (off to the side, occasional — NOT a per-swarm stage, so
//          no supply tax) re-derives a seeded block and compares, catching lazy/fake compute.
//        - graded reputation: pass/fail history gates roles + kicks repeat cheaters at admission.
//     Boundary pinning stays built + tested as the OPT-IN private tier (set `privacy` per swarm) for later.
export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  admission: { mode: 'open', minFreeVramMb: 8 * 1024 },   // proven floor; placement decides the role
  paySplit: 'layers',
  minCandidates: 2,
  privacy: null,                                          // PoC: fully open, any machine any slice (see above)
  spotCheckTimeoutMs: 300_000,
};

/** A job cannot pay for more than this many tokens (matches the whole-model MAX_OUTPUT_TOKENS). Bounds
 *  the damage from a coordinator that over-reports until receipt-attested token counting lands. */
export const MAX_SWARM_JOB_TOKENS = 4096;

/** Injected side-effects — the orchestrator provides sockets + the earnings sink; a test provides fakes. */
export interface SwarmDeps {
  seam: Seam;
  /** send an event to one node (orchestrator: io.to(socketId).emit) */
  emit: (nodeId: string, event: string, data: unknown) => void;
  /** credit one stage for the tokens its shard produced — the existing recordEarning path */
  recordStageEarning: (e: StageEarning & { swarmId: string; jobId: string; model: string }) => void;
  /** the graded reputation + stake gate (GradedReputation). REQUIRED when cfg.privacy is set: trust
   *  assignment is the control plane's, never self-reported — without an oracle nobody is trusted
   *  and pinned placement fails CLOSED rather than forming a leaky ring. */
  trust?: TrustOracle;
  /** trusted spot-check AUDITORS we run — nodes that can recompute any block to check a suspect. They
   *  are kept OUT of swarm placement (never a serving stage) and are not part of open supply, so they
   *  add integrity without taxing it (the sharded analogue of the whole-model canary infra). A node id
   *  in this set is the ground truth the spot-check compares a stranger against; empty => spot-checks
   *  are skipped and cheat detection leans on receipts alone (still catches structural fraud). */
  auditors?: () => { nodeId: string; pubkey: string }[];
  log?: (msg: string) => void;
  now?: () => number;
  newId?: (prefix: string) => string;
}

export class SwarmManager {
  private candidates = new Map<string, Candidate[]>();      // model → admitted candidates
  private swarms = new Map<string, SwarmInfo>();            // swarmId → swarm
  private nodeToSwarm = new Map<string, string>();          // nodeId → swarmId (a node is in one swarm)
  private settled = new Set<string>();                     // `${swarmId}:${jobId}` already paid (idempotency)
  private cfg: SwarmConfig;
  private d: SwarmDeps;

  constructor(deps: SwarmDeps, cfg: SwarmConfig = DEFAULT_SWARM_CONFIG) {
    this.d = deps;
    this.cfg = cfg;
  }

  private log(m: string) { this.d.log?.(`[swarm] ${m}`); }
  private now() { return (this.d.now ?? Date.now)(); }
  private id(p: string) { return (this.d.newId ?? ((x: string) => `${x}-${Math.round(this.now())}`))(p); }

  /** ADMIT — apply the admission policy to an announcing node. Returns the reason on refusal. */
  admit(cap: NodeCapabilities): { ok: true } | { ok: false; reason: string } {
    const a = this.cfg.admission;
    if (!cap.pubkey) return { ok: false, reason: 'no node identity key' };
    // proven dishonesty dominates every admission mode (failed spot-checks / rock-bottom score)
    if (this.d.trust?.roleFor(cap.pubkey) === 'rejected') {
      return { ok: false, reason: 'reputation: rejected (failed verification history)' };
    }
    if (a.mode === 'curated') {
      // NOTE: the pubkey is self-reported at announce (only the socket's account is authenticated). A
      // non-allowlisted node can CLAIM an allowlisted pubkey and be admitted, but it cannot be PAID
      // (settlement needs a receipt signed by that pubkey's private key). Griefing-safe requires an
      // announce-time challenge/response over the pubkey — see PERMISSIONLESS_LOOP.md (pubkey↔account).
      if (!a.allowlist.has(cap.pubkey)) return { ok: false, reason: 'not on the curated allowlist' };
      return { ok: true };
    }
    // open: a coarse PROVEN floor (placement decides per-role capability; this is the velvet-rope minimum)
    if (!(cap.freeVramMb >= a.minFreeVramMb)) {
      return { ok: false, reason: `free VRAM ${cap.freeVramMb}MB below floor ${a.minFreeVramMb}MB` };
    }
    if (!cap.subnet) return { ok: false, reason: 'no subnet (can’t enforce anti-colocation)' };
    return { ok: true };
  }

  /** ANNOUNCE — a node advertises a shard capability for `model`. Admitted nodes join the candidate pool.
   *  `account` is the authenticated c0mpute account (the orchestrator binds it from the socket). */
  announce(nodeId: string, cap: NodeCapabilities, model: string, manifestRef: string, account: string):
    { ok: true } | { ok: false; reason: string } {
    const verdict = this.admit(cap);
    if (!verdict.ok) { this.log(`refused ${nodeId} for ${model}: ${verdict.reason}`); return verdict; }
    const pool = this.candidates.get(model) ?? [];
    // idempotent re-announce: drop any prior entry for this SOCKET *or* this PUBKEY. Deduping by pubkey
    // too keeps one identity to one ring slot — otherwise a node reconnecting on a new socket (or a
    // griefer) plants two candidates with one key, which breaks the per-shard split + bricks settlement.
    const next = pool.filter((c) => c.nodeId !== nodeId && c.cap.pubkey !== cap.pubkey);
    next.push({ nodeId, cap, model, manifestRef, account, announcedAt: this.now() });
    this.candidates.set(model, next);
    this.log(`admitted ${nodeId} (${cap.gpu}, ${(cap.freeVramMb / 1024).toFixed(0)}GB) for ${model} `
      + `→ pool ${next.length}`);
    return { ok: true };
  }

  candidateCount(model: string) { return (this.candidates.get(model) ?? []).length; }
  getSwarm(id: string) { return this.swarms.get(id); }
  swarmForModel(model: string) {
    return [...this.swarms.values()].find((s) => s.model === model && s.status === 'ready');
  }

  /**
   * PLACE + ASSIGN — form a swarm for `model` from the admitted pool. `rtt[i][j]` is the measured
   * one-way ms matrix aligned to the CURRENT candidate pool for `model` (`this.candidates.get(model)`
   * order). Nodes already in a swarm are dropped from the pool AND the matrix is sliced to match, so the
   * indices the planner sees stay aligned. Calls the planner seam, builds the swarm, and emits
   * swarm:assign to each stage. Returns the swarm, or null if the pool can't hold the model.
   */
  async formSwarm(model: string, manifestRef: string, profile: ModelProfile, rtt: number[][]):
    Promise<SwarmInfo | null> {
    const privacy = this.cfg.privacy;
    if (privacy && !this.d.trust) {
      // fail CLOSED: pinning demands control-plane-assigned trust; forming an unpinned ring
      // "because the oracle was missing" is exactly the silent hole the rail exists to close.
      this.log(`not forming ${model}: privacy pinning is on but no trust oracle is wired`);
      return null;
    }
    const role = (pubkey: string): SwarmRole => this.d.trust?.roleFor(pubkey) ?? 'middle';
    const auditorIds = new Set((this.d.auditors?.() ?? []).map((a) => a.nodeId));
    const full = this.candidates.get(model) ?? [];
    // keep un-placed candidates AND the original indices, so we slice `rtt` to exactly this sub-pool.
    // Reputation gate: 'relegated'/'rejected' nodes never enter the STAGE pool (they stay candidates
    // for off-ring roles — seeder / spot-check-verifier — which the planner never assigns a block).
    // Auditors are also excluded — they exist to VERIFY stages, never to be one (keeps them available).
    const kept = full.map((c, i) => ({ c, i })).filter(({ c }) => !this.nodeToSwarm.has(c.nodeId)
      && !auditorIds.has(c.nodeId)
      && role(c.cap.pubkey) !== 'relegated' && role(c.cap.pubkey) !== 'rejected');
    const pool = kept.map((k) => k.c);
    if (pool.length < this.cfg.minCandidates) {
      this.log(`not forming ${model}: ${pool.length} candidates < min ${this.cfg.minCandidates}`);
      return null;
    }
    if (rtt.length !== full.length) {
      this.log(`not forming ${model}: rtt is ${rtt.length}x, expected ${full.length} (pool-aligned)`);
      return null;
    }
    const idx = kept.map((k) => k.i);
    const subRtt = idx.map((i) => idx.map((j) => rtt[i][j]));   // aligned to `pool`, not the full set

    const upAll = pool.every((c) => c.cap.upMbps != null);
    const req = {
      nodes: pool.map((c) => ({
        id: c.nodeId,
        free_vram_mb: c.cap.freeVramMb,
        subnet: c.cap.subnet,
        cpu_factor: c.cap.cpuFactor ?? 1.0,
        up_mbps: upAll ? c.cap.upMbps : null,
        // trust is ASSIGNED here (stake + reputation), never read from the announce payload
        trusted: privacy ? role(c.cap.pubkey) === 'boundary' : false,
        // the probe-measured per-node capability (undefined keys drop out of the JSON, so a
        // pool without them plans byte-identically at the profile numbers)
        layer_vram_mb: c.cap.layerVramMb,
        cap_layers: c.cap.capLayers,
        total_vram_mb: c.cap.totalVramMb,
        load_peak_extra_mb: c.cap.loadPeakExtraMb,
        layer_ms: c.cap.layerMs,
      })),
      rtt: subRtt,
      privacy: privacy ? { boundary_in: privacy.boundaryIn, boundary_out: privacy.boundaryOut } : undefined,
      model: {
        n_layers: profile.layerCount,
        layer_vram_mb: profile.layer_vram_mb,
        kv_mb_per_layer: profile.kv_mb_per_layer,
        layer_ms_base: profile.layer_ms_base,
        reserve_mb: profile.reserve_mb,
        head_reserve_mb: profile.head_reserve_mb,
        cap_layers: profile.cap_layers,
        prefill_bytes: profile.prefill_bytes,
        decode_bytes: profile.decode_bytes,
        decode_steps: profile.decode_steps,
      },
    };
    const plan = await this.d.seam.plan(req);
    if (!plan) { this.log(`planner: pool can't hold ${model} (need more/fatter nodes)`); return null; }

    const byId = new Map(pool.map((c) => [c.nodeId, c]));
    const losslessWire = profile.losslessWire ?? true;      // explicit, NOT inferred from upload-awareness
    const stages: SwarmStage[] = plan.stages.map((s) => ({
      nodeId: s.id,
      pubkey: byId.get(s.id)!.cap.pubkey,
      account: byId.get(s.id)!.account,
      stageIndex: s.index,
      layerStart: s.lo,
      layerEnd: s.hi,
      layers: s.layers,
      isHead: s.head,
      isTail: s.tail,
      boundary: s.boundary ?? false,
      ready: false,
    }));
    if (privacy) {
      // belt-and-braces re-check of the planner's contract before anything is emitted: every
      // boundary stage (and both ends) must map to a node this control plane marked trusted.
      const bad = stages.filter((s) => (s.boundary || s.isHead || s.isTail)
        && role(s.pubkey) !== 'boundary');
      if (bad.length) {
        this.log(`refusing to form ${model}: plan put untrusted node(s) on a boundary stage `
          + `(${bad.map((s) => s.nodeId).join(', ')}) — planner/oracle disagreement`);
        return null;
      }
    }
    if (new Set(stages.map((s) => s.pubkey)).size !== stages.length) {
      this.log(`refusing to form ${model}: duplicate pubkey across stages (would misattribute pay)`);
      return null;
    }
    const swarmId = this.id('swarm');
    const swarm: SwarmInfo = {
      id: swarmId,
      model,
      manifestRef,
      layerCount: profile.layerCount,
      status: 'pulling',
      order: plan.order,
      coordinatorNodeId: plan.head,
      stages,
      createdAt: this.now(),
      losslessWire,
    };
    this.swarms.set(swarmId, swarm);
    for (const st of stages) this.nodeToSwarm.set(st.nodeId, swarmId);

    const peers = stages.map((s) => ({
      nodeId: s.nodeId, pubkey: s.pubkey, stageIndex: s.stageIndex,
      layerStart: s.layerStart, layerEnd: s.layerEnd,
    }));
    for (const st of stages) {
      const assign: StageAssignment = {
        swarmId, model, manifestRef,
        stageIndex: st.stageIndex, layerStart: st.layerStart, layerEnd: st.layerEnd,
        role: st.isHead ? 'coordinator' : 'stage',
        isHead: st.isHead, isTail: st.isTail, boundary: st.boundary, losslessWire,
        peers, coordinatorNodeId: plan.head,
      };
      this.d.emit(st.nodeId, 'swarm:assign', assign);
    }
    this.log(`formed ${swarmId} for ${model}: ${plan.k} stages, head=${plan.head}, `
      + `predicted ${plan.step_ms}ms/step (${plan.tok_s_per_g} tok/s per g); assignments emitted`);
    return swarm;
  }

  /** A node reports it pulled its range, warmed, and connected. When all stages are ready, the swarm serves. */
  markReady(swarmId: string, nodeId: string): SwarmInfo | undefined {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return undefined;
    const st = swarm.stages.find((s) => s.nodeId === nodeId);
    if (st) st.ready = true;
    if (swarm.status === 'pulling' && swarm.stages.every((s) => s.ready)) {
      swarm.status = 'ready';
      this.log(`${swarmId} READY — all ${swarm.stages.length} stages pulled + connected; serving ${swarm.model}`);
    }
    return swarm;
  }

  /**
   * SETTLE + PAY — the coordinator returns one signed receipt per stage on job complete. Only the
   * COORDINATOR of a live swarm may settle, each (swarm, job) settles at most ONCE, and `tokens` is
   * bounded. Then verify the set (shard.verify: signatures, coverage tiling, per-job nonce, chain iff
   * lossless, per-signer block binding) and fan the (bounded) tokens out PER SHARD to each stage's frozen
   * account. Returns the per-stage earnings, or null if anything failed (nobody is paid).
   */
  async settleJob(swarmId: string, jobId: string, submitterNodeId: string, nonce: string,
    tokens: number, receipts: unknown[]): Promise<StageEarning[] | null> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) { this.log(`settle: unknown swarm ${swarmId}`); return null; }
    if (swarm.status !== 'ready' && swarm.status !== 'serving') {
      this.log(`settle ${swarmId}: swarm not serving (status ${swarm.status}) — rejected`); return null;
    }
    if (submitterNodeId !== swarm.coordinatorNodeId) {
      this.log(`settle ${swarmId} job ${jobId}: submitter ${submitterNodeId} is not the coordinator — rejected`);
      return null;
    }
    const key = `${swarmId}:${jobId}`;
    if (this.settled.has(key)) { this.log(`settle ${key}: already settled — replay rejected`); return null; }
    if (!Number.isFinite(tokens) || tokens < 0) {
      this.log(`settle ${key}: bad token count ${tokens} — rejected`); return null;
    }
    const payTokens = Math.min(Math.floor(tokens), MAX_SWARM_JOB_TOKENS);

    const assignments: Record<string, [number, number]> = {};
    for (const s of swarm.stages) assignments[s.pubkey] = [s.layerStart, s.layerEnd];
    let res: SettleResult;
    try {
      res = await this.d.seam.verify({
        receipts, layer_count: swarm.layerCount, expected_nonce: nonce,
        check_chain: swarm.losslessWire, assignments,
      });
    } catch (e) {   // a seam crash / non-JSON output must fail CLOSED (pay nobody), never throw up to the socket
      this.log(`settle ${key}: verify seam error (${(e as Error).message}) — rejected, nobody paid`);
      return null;
    }
    if (!res.ok) {
      this.log(`settle ${key} REJECTED: ${res.error} — nobody paid`);
      // only the submitter is safely attributable (any stage could be framed by a fabricated set,
      // but the coordinator CHOSE to submit this one) — a serially-dishonest coordinator burns out
      const coordStage = swarm.stages.find((s) => s.nodeId === swarm.coordinatorNodeId);
      if (coordStage) this.d.trust?.record(coordStage.pubkey, 'receipt_invalid');
      return null;
    }

    this.settled.add(key);                                   // commit BEFORE crediting: no double-pay on retry
    const split = this.splitTokens(payTokens, swarm.stages);
    const byPub = new Map(swarm.stages.map((s) => [s.pubkey, s]));
    const earnings: StageEarning[] = (res.stages ?? []).map((s) => {
      const st = byPub.get(s.pubkey)!;                       // verify pinned signers to assigned blocks
      return {
        nodeId: st.nodeId, pubkey: s.pubkey, account: st.account,
        layerStart: s.lo, layerEnd: s.hi, layers: s.layers, tokens: split.get(s.pubkey) ?? 0,
      };
    });
    for (const e of earnings) {
      this.d.recordStageEarning({ ...e, swarmId, jobId, model: swarm.model });
      this.d.trust?.record(e.pubkey, 'job_served');           // slow trust accrual for verified work
    }
    this.log(`settled ${key}: ${payTokens} tokens split across ${earnings.length} shards `
      + `(${this.cfg.paySplit}) → ${earnings.map((e) => `${e.nodeId}:${e.tokens}`).join(' ')}`);
    return earnings;
  }

  /** Divide a job's tokens across stages by the pay-split rule, exactly (largest-remainder, sum == tokens). */
  private splitTokens(tokens: number, stages: SwarmStage[]): Map<string, number> {
    const weights = stages.map((s) => (this.cfg.paySplit === 'equal' ? 1 : s.layers));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = stages.map((s, i) => (tokens * weights[i]) / total);
    const floors = raw.map(Math.floor);
    let rem = tokens - floors.reduce((a, b) => a + b, 0);
    // hand the leftover tokens to the largest fractional parts (deterministic, sums to `tokens`)
    const order = raw
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    const out = new Map<string, number>();
    stages.forEach((s, i) => out.set(s.pubkey, floors[i]));
    for (let k = 0; k < order.length && rem > 0; k++, rem--) {
      const s = stages[order[k].i];
      out.set(s.pubkey, (out.get(s.pubkey) ?? 0) + 1);
    }
    return out;
  }

  /** A node vanished (crash/leave). Mark its swarm degraded and free ALL its stages for a re-form. */
  onNodeGone(nodeId: string): SwarmInfo | undefined {
    const swarmId = this.nodeToSwarm.get(nodeId);
    for (const [m, pool] of this.candidates) this.candidates.set(m, pool.filter((c) => c.nodeId !== nodeId));
    if (!swarmId) { this.nodeToSwarm.delete(nodeId); return undefined; }
    const swarm = this.swarms.get(swarmId);
    if (swarm && swarm.status !== 'failed') {
      swarm.status = 'degraded';
      const gone = swarm.stages.find((s) => s.nodeId === nodeId);
      if (gone) this.d.trust?.record(gone.pubkey, 'flake');   // vanished mid-swarm: unreliable, not dishonest
      for (const st of swarm.stages) this.nodeToSwarm.delete(st.nodeId);   // free the whole ring's slots
      this.log(`${swarmId} DEGRADED — stage ${nodeId} gone; freed ${swarm.stages.length} slots for re-form`);
    } else {
      this.nodeToSwarm.delete(nodeId);
    }
    return swarm;
  }

  // ─── layer-block spot-check (shard/challenge.py wired to the network) ──────────────────────────
  //
  // The receipt chain proves byte-continuity, never `out == block(in)` — a stage can hash the right
  // endpoints while skipping the matmuls. The spot-check closes that: the SUSPECT and a TRUSTED
  // VERIFIER both derive the identical seeded activation (derive_challenge), run the suspect's layer
  // block, and return a sketch; `shard.challenge` judges the pair by cosine + norm tolerance
  // (bit-exactness is impossible across heterogeneous GPUs). WHEN to probe / HOW to score / WHO gets
  // ejected is this side's policy — the engine only provides the transform and the comparison.

  private checks = new Map<string, SpotCheck>();

  /**
   * Launch one spot-check against `suspectNodeId` (default: the first non-boundary stage without an
   * active check — boundary stages are staked+trusted; strangers in the deep-middle are the threat
   * model). The verifier is a TRUSTED node, preferably off-ring (an on-ring boundary stage is the
   * fallback — it is busy but latency-tolerant). Returns the check, or null if it can't be staged.
   */
  startSpotCheck(swarmId: string, suspectNodeId?: string): SpotCheck | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || (swarm.status !== 'ready' && swarm.status !== 'serving')) return null;
    if (!this.d.trust) { this.log('spot-check: no trust oracle wired'); return null; }
    const active = new Set([...this.checks.values()].map((c) => c.suspectNodeId));
    // default target = an UNTRUSTED deep-middle stage (the threat model — a stranger holding a
    // block). Boundary stages are staked; a trusted-middle stage is a lower priority, allowed only
    // as a fallback so every non-boundary stage is still probeable.
    const probeable = (s: SwarmStage) => !s.boundary && !active.has(s.nodeId);
    const suspect = suspectNodeId
      ? swarm.stages.find((s) => s.nodeId === suspectNodeId)
      : swarm.stages.find((s) => probeable(s) && this.d.trust!.roleFor(s.pubkey) !== 'boundary')
        ?? swarm.stages.find(probeable);
    if (!suspect || active.has(suspect.nodeId)) return null;
    // verifier — a TRUSTED recompute oracle, in priority order:
    //   1. a we-run auditor not busy in this ring (the open-PoC path — no trusted stage needed),
    //   2. an off-ring staked/boundary candidate, then an in-ring boundary stage (the private-tier path).
    const inRing = new Set(swarm.stages.map((s) => s.nodeId));
    const auditor = (this.d.auditors?.() ?? []).find((a) => !inRing.has(a.nodeId));
    const offRing = auditor ? null : (this.candidates.get(swarm.model) ?? []).find((c) =>
      !inRing.has(c.nodeId) && this.d.trust!.roleFor(c.cap.pubkey) === 'boundary');
    const onRing = auditor || offRing ? null
      : swarm.stages.find((s) => s.boundary && s.nodeId !== suspect.nodeId);
    const verifier = auditor
      ? { nodeId: auditor.nodeId, pubkey: auditor.pubkey }
      : offRing ? { nodeId: offRing.nodeId, pubkey: offRing.cap.pubkey }
      : onRing ? { nodeId: onRing.nodeId, pubkey: onRing.pubkey } : null;
    if (!verifier) { this.log(`spot-check ${swarmId}: no trusted verifier/auditor available`); return null; }
    const checkId = this.id('check');
    const check: SpotCheck = {
      checkId, swarmId, model: swarm.model, manifestRef: swarm.manifestRef,
      suspectNodeId: suspect.nodeId, suspectPubkey: suspect.pubkey,
      verifierNodeId: verifier.nodeId, verifierPubkey: verifier.pubkey,
      layerStart: suspect.layerStart, layerEnd: suspect.layerEnd,
      seed: `${swarmId}:${checkId}`,                     // unpredictable pre-announce, identical both sides
      nTokens: 8, hiddenSize: 3072,
      deadlineAt: this.now() + this.cfg.spotCheckTimeoutMs,
      sketches: {},
    };
    this.checks.set(checkId, check);
    const assign: SpotCheckAssignment = {
      checkId, model: check.model, manifestRef: check.manifestRef,
      layerStart: check.layerStart, layerEnd: check.layerEnd,
      seed: check.seed, nTokens: check.nTokens, hiddenSize: check.hiddenSize,
    };
    this.d.emit(check.suspectNodeId, 'swarm:challenge', assign);
    this.d.emit(check.verifierNodeId, 'swarm:challenge', assign);
    this.log(`spot-check ${checkId}: ${check.suspectNodeId} layers[${check.layerStart}:${check.layerEnd}] `
      + `vs trusted ${check.verifierNodeId}`);
    return check;
  }

  /**
   * A node returns its sketch. When both sides are in, judge via the challenge seam and feed the
   * verdict into reputation; a FAILED suspect also degrades the swarm (its outputs can't be trusted).
   * Returns the verdict once judged, null while waiting / on any rejection.
   */
  async submitSketch(checkId: string, nodeId: string, sketch: BlockSketch):
    Promise<{ passed: boolean; cosine: number } | null> {
    const check = this.checks.get(checkId);
    if (!check) return null;
    if (nodeId === check.suspectNodeId) check.sketches.suspect = sketch;
    else if (nodeId === check.verifierNodeId) check.sketches.verifier = sketch;
    else { this.log(`spot-check ${checkId}: sketch from uninvolved node ${nodeId} — ignored`); return null; }
    const { suspect, verifier } = check.sketches;
    if (!suspect || !verifier) return null;
    this.checks.delete(checkId);
    let verdict: { cosine: number; rel_norm: number; passed: boolean };
    try {
      verdict = await this.d.seam.challenge({ a: suspect, b: verifier });
    } catch (e) {   // an infra crash is not the suspect's dishonesty — drop the check, punish nobody
      this.log(`spot-check ${checkId}: challenge seam error (${(e as Error).message}) — dropped`);
      return null;
    }
    this.d.trust?.record(check.suspectPubkey, verdict.passed ? 'spot_check_pass' : 'spot_check_fail');
    if (!verdict.passed) {
      const swarm = this.swarms.get(check.swarmId);
      if (swarm && swarm.status !== 'failed') {
        swarm.status = 'degraded';
        for (const st of swarm.stages) this.nodeToSwarm.delete(st.nodeId);
      }
      this.log(`spot-check ${checkId} FAILED (cosine ${verdict.cosine.toFixed(4)}): `
        + `${check.suspectNodeId} is not running its block — swarm degraded, reputation struck`);
    } else {
      this.log(`spot-check ${checkId} passed (cosine ${verdict.cosine.toFixed(4)})`);
    }
    return { passed: verdict.passed, cosine: verdict.cosine };
  }

  /** Expire overdue checks: a silent SUSPECT fails (refusal is not free); a silent verifier only
   *  flakes itself. Call on an interval (the loop layer owns cadence). Returns expired check ids. */
  sweepSpotChecks(): string[] {
    const now = this.now();
    const expired: string[] = [];
    for (const [id, c] of this.checks) {
      if (now < c.deadlineAt) continue;
      this.checks.delete(id);
      expired.push(id);
      if (!c.sketches.suspect) {
        this.d.trust?.record(c.suspectPubkey, 'spot_check_fail');
        this.log(`spot-check ${id} EXPIRED: suspect ${c.suspectNodeId} never answered — counted as fail`);
      }
      if (!c.sketches.verifier) {
        this.d.trust?.record(c.verifierPubkey, 'flake');
        this.log(`spot-check ${id} expired: verifier ${c.verifierNodeId} never answered — verifier flaked`);
      }
    }
    return expired;
  }
}
