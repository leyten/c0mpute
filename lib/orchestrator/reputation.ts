/**
 * GradedReputation — a per-node score that gates swarm ROLES, replacing the whole-model worker's
 * binary canary ban for shard nodes.
 *
 * The whole-model path can probe a worker with a hidden math+nonce prompt (canarySweep) and ban on
 * failure — binary is fine there because the probe is cheap and decisive. A SHARD node can't be
 * canaried (it never sees a prompt; it transforms activations), placement is a spectrum of roles
 * with very different blast radii, and open admission means strangers are the common case. So
 * reputation here is GRADED and it gates ROLES, not membership:
 *
 *   boundary   — may hold the leaky boundary layers / head / tail (sees prompt- or output-adjacent
 *                data). STAKE-GATED: `isStaked(pubkey) && score >= boundaryMin`. Score alone can
 *                NEVER earn this — otherwise a Sybil farms honest middle-work for a week and then
 *                reads prompts. Stake is the c0mpute staking layer's call (leyten's fork).
 *   middle     — may hold deep-middle layers (sees only mid-depth activations). The open-admission
 *                default for a stranger in good standing.
 *   relegated  — off the critical path only (weight-seeder / spot-check-verifier / standby-for-
 *                non-boundary). Where a flaky-but-not-proven-dishonest node lands.
 *   rejected   — refused at announce. Proven dishonesty (failed spot-checks, invalid receipts).
 *
 * Scoring follows the canary ban's proven shape: judge RECENT behaviour, not lifetime counts. An
 * honest node ~never fails a spot-check (honest recompute lands at cosine ~0.9999 vs the 0.99
 * threshold), so consecutive spot-check failures are decisive; everything else nudges.
 *
 * Pure + deterministic (clock injected); persistence via snapshot()/restore() so the orchestrator
 * owns storage (same pattern as the injected earnings sink). Keyed by node PUBKEY — the identity
 * receipts are signed with — never by socket id (a reconnect must not reset a score).
 */

export type SwarmRole = 'boundary' | 'middle' | 'relegated' | 'rejected';

export type ReputationEventKind =
  | 'job_served'          // a settled job this node held a shard of (small, slow trust accrual)
  | 'spot_check_pass'     // seeded redundant recompute matched the trusted replica
  | 'spot_check_fail'     // recompute mismatch OR refusal/timeout — refusing must not be free
  | 'receipt_invalid'     // its stage receipt failed signature/coverage/chain at settlement
  | 'flake';              // vanished mid-job / broke ring formation (unreliable, not dishonest)

export interface ReputationConfig {
  start: number;               // a stranger's opening score
  min: number;
  max: number;
  deltas: Record<ReputationEventKind, number>;
  /** score floors per role gate (roles also have non-score conditions, see roleFor) */
  boundaryMin: number;         // + isStaked — never score-alone
  middleMin: number;           // below → relegated-only
  rejectBelow: number;         // below → refused at announce
  /** this many spot-check fails IN A ROW → rejected outright (honest nodes ~never fail once) */
  consecFailReject: number;
}

export const DEFAULT_REPUTATION_CONFIG: ReputationConfig = {
  start: 40,
  min: 0,
  max: 100,
  deltas: {
    job_served: 1,
    spot_check_pass: 4,
    spot_check_fail: -35,
    receipt_invalid: -50,
    flake: -8,
  },
  boundaryMin: 70,
  middleMin: 25,
  rejectBelow: 5,
  consecFailReject: 2,
};

interface NodeRecord {
  score: number;
  consecSpotFails: number;
  events: number;              // lifetime event count (observability)
  lastEventAt: number;
}

export interface ReputationDeps {
  /** the staking layer's verdict for boundary eligibility — economics, injected (leyten's fork) */
  isStaked?: (pubkey: string) => boolean;
  now?: () => number;
}

export class GradedReputation {
  private nodes = new Map<string, NodeRecord>();
  private cfg: ReputationConfig;
  private d: ReputationDeps;

  constructor(deps: ReputationDeps = {}, cfg: Partial<ReputationConfig> = {}) {
    this.d = deps;
    this.cfg = { ...DEFAULT_REPUTATION_CONFIG, ...cfg, deltas: { ...DEFAULT_REPUTATION_CONFIG.deltas, ...(cfg.deltas ?? {}) } };
  }

  private now() { return (this.d.now ?? Date.now)(); }

  private rec(pubkey: string): NodeRecord {
    let r = this.nodes.get(pubkey);
    if (!r) {
      r = { score: this.cfg.start, consecSpotFails: 0, events: 0, lastEventAt: 0 };
      this.nodes.set(pubkey, r);
    }
    return r;
  }

  /** apply one observed event; returns the new score. */
  record(pubkey: string, kind: ReputationEventKind): number {
    const r = this.rec(pubkey);
    r.score = Math.min(this.cfg.max, Math.max(this.cfg.min, r.score + this.cfg.deltas[kind]));
    if (kind === 'spot_check_fail') r.consecSpotFails += 1;
    else if (kind === 'spot_check_pass') r.consecSpotFails = 0;
    r.events += 1;
    r.lastEventAt = this.now();
    return r.score;
  }

  score(pubkey: string): number {
    return this.nodes.get(pubkey)?.score ?? this.cfg.start;
  }

  /**
   * The role gate placement consults. Order matters — dishonesty dominates:
   *   rejected   — consecutive spot-check fails, or score below rejectBelow.
   *   boundary   — staked AND score >= boundaryMin.
   *   middle     — score >= middleMin (a fresh stranger lands here: open admission).
   *   relegated  — everything else (flaky/suspect but not proven dishonest).
   */
  roleFor(pubkey: string): SwarmRole {
    const r = this.nodes.get(pubkey);
    const score = r?.score ?? this.cfg.start;
    if ((r?.consecSpotFails ?? 0) >= this.cfg.consecFailReject) return 'rejected';
    if (score < this.cfg.rejectBelow) return 'rejected';
    if ((this.d.isStaked?.(pubkey) ?? false) && score >= this.cfg.boundaryMin) return 'boundary';
    if (score >= this.cfg.middleMin) return 'middle';
    return 'relegated';
  }

  /** persistence seam — the orchestrator owns storage (sqlite), this module owns the policy. */
  snapshot(): Record<string, { score: number; consecSpotFails: number; events: number; lastEventAt: number }> {
    const out: Record<string, NodeRecord> = {};
    for (const [k, v] of this.nodes) out[k] = { ...v };
    return out;
  }

  restore(snap: Record<string, { score: number; consecSpotFails: number; events: number; lastEventAt: number }>) {
    this.nodes.clear();
    for (const [k, v] of Object.entries(snap)) this.nodes.set(k, { ...v });
  }
}
