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
  Candidate, NodeCapabilities, RingPlan, SettleResult,
  StageAssignment, StageEarning, SwarmInfo, SwarmStage,
} from './swarm-types';

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
}

export interface SwarmConfig {
  admission:
    | { mode: 'curated'; allowlist: Set<string> }   // pubkeys we run / vetted — betanet-first
    | { mode: 'open'; minFreeVramMb: number };       // permissionless: any node past a proven floor
  paySplit: 'layers' | 'equal';
  /** minimum candidates before a swarm is formed (must be able to hold the model; k is decided by the
   *  planner, this is just "don't try with too few"). */
  minCandidates: number;
}

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  admission: { mode: 'curated', allowlist: new Set() },  // betanet-first; flip to 'open' on leyten's call
  paySplit: 'layers',
  minCandidates: 2,
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
    const full = this.candidates.get(model) ?? [];
    // keep un-placed candidates AND the original indices, so we slice `rtt` to exactly this sub-pool
    const kept = full.map((c, i) => ({ c, i })).filter(({ c }) => !this.nodeToSwarm.has(c.nodeId));
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
      })),
      rtt: subRtt,
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
      ready: false,
    }));
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
        isHead: st.isHead, isTail: st.isTail, losslessWire,
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
    if (!res.ok) { this.log(`settle ${key} REJECTED: ${res.error} — nobody paid`); return null; }

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
    for (const e of earnings) this.d.recordStageEarning({ ...e, swarmId, jobId, model: swarm.model });
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
      for (const st of swarm.stages) this.nodeToSwarm.delete(st.nodeId);   // free the whole ring's slots
      this.log(`${swarmId} DEGRADED — stage ${nodeId} gone; freed ${swarm.stages.length} slots for re-form`);
    } else {
      this.nodeToSwarm.delete(nodeId);
    }
    return swarm;
  }
}
