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
 * Penalties therefore HEAL with time (see `effective`). A score that only ever fell would be a
 * one-way ratchet, because the roles a node needs in order to earn points back are precisely the
 * ones the gate has just taken away — and the verdict is persisted, so the exile outlives restarts.
 * Idle time drifts a score back toward `start` at an hour a point for unreliability and a DAY a
 * point for a node carrying a proven-dishonesty strike, and never at all for the decisive rule:
 * consecutive spot-check failures reject outright and no amount of waiting clears them.
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
  /** points an idle node claws back per hour with nothing observed against it, capped at `start` */
  healPerHour: number;
  /** the same for a node carrying a proven-dishonesty strike — a penalty BOX, not a pardon */
  struckHealPerHour: number;
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
  // An hour a point prices ONE flake at eight quiet hours: a node that drops out less often than
  // that is net-recovering and a node that drops out more often stays under the gate, which is the
  // line between a home connection that blipped and one that cannot hold a ring. It also means the
  // two disconnects that used to exile a node outright (40 → 24, under middleMin) cost it an hour.
  healPerHour: 1,
  // A day a point, 24x slower: a failed spot-check (-35) buys 20 days off the critical path and an
  // invalid receipt (-50) buys 25 (the -50 lands on the `min` floor, so the two penalties are only
  // 5 days apart in practice), where a flake costs 8 hours. Long enough that cheating can never pay
  // for the wait, short enough that ONE ambiguous strike — a challenge that missed its 5-minute
  // deadline on a slow card — is not a life sentence for a node that owns its identity.
  struckHealPerHour: 1 / 24,
};

const HOUR_MS = 3_600_000;

interface NodeRecord {
  score: number;
  consecSpotFails: number;
  events: number;              // lifetime event count (observability)
  lastEventAt: number;
  struck: boolean;             // proven dishonesty on record (spot-check fail / invalid receipt)
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
      r = { score: this.cfg.start, consecSpotFails: 0, events: 0, lastEventAt: 0, struck: false };
      this.nodes.set(pubkey, r);
    }
    return r;
  }

  /**
   * The stored score with idle time healed back in — what every gate actually reads.
   *
   * Without this every delta is PERMANENT, and that turns the most ordinary event on a residential
   * network into a one-way ratchet: `flake` costs 8, so two mid-job disconnects put a node under
   * `middleMin`, formSwarm then keeps it out of the stage pool, `startSpotCheck` only ever probes
   * stages, and `boundary` needs stake — so there is no longer anything the node can DO that earns
   * a point back, and the snapshot carries the exile across restarts. `lastEventAt` was always the
   * hook for the header's "judge RECENT behaviour": a node with nothing observed against it claws
   * back `healPerHour` an hour, capped at `start`. Recovery restores a stranger's benefit of the
   * doubt and nothing more — standing above `start` is still earned only by verified work.
   *
   * A node with a proven-dishonesty strike heals 24x slower, so the unreliable/dishonest line the
   * roles are built on survives: a flake is forgiven in hours, a failed check in weeks. It is a
   * penalty box rather than a permanent exile because "forever" only bites an identity worth
   * keeping — admission is open, so a real cheater's cheapest move has always been a fresh keypair
   * that starts at `start`, while the node a life sentence actually lands on is the honest one that
   * missed a single challenge deadline. The decisive rule is untouched: `consecSpotFails` never
   * decays, so a second failed check with no pass between them still rejects, permanently — which
   * also means a node whose challenges keep EXPIRING (sweepSpotChecks scores silence as a fail) is
   * still gone for good on the second one, healing or not. That is the rule working as designed on
   * evidence this layer cannot second-guess; whether the same suspect should be re-probed after a
   * timeout is the caller's aim, not the score's.
   */
  private effective(r: NodeRecord): number {
    if (r.score >= this.cfg.start) return r.score;
    const rate = r.struck ? this.cfg.struckHealPerHour : this.cfg.healPerHour;
    const idleHours = Math.max(0, this.now() - r.lastEventAt) / HOUR_MS;
    return Math.min(this.cfg.start, r.score + idleHours * rate);
  }

  /** apply one observed event; returns the new score. */
  record(pubkey: string, kind: ReputationEventKind): number {
    const r = this.rec(pubkey);
    // heal first, THEN apply the delta: the stored score is always "as of lastEventAt", which is
    // what lets the pending recovery survive a restart instead of being forfeited by the next event.
    r.score = Math.min(this.cfg.max, Math.max(this.cfg.min, this.effective(r) + this.cfg.deltas[kind]));
    if (kind === 'spot_check_fail') r.consecSpotFails += 1;
    else if (kind === 'spot_check_pass') r.consecSpotFails = 0;
    // `flake` is unreliability and stays on the fast heal; only proof of dishonesty boxes a node.
    // The mark is permanent even after a later pass — a pass clears the CONSECUTIVE counter (it is
    // evidence about this check), it does not un-observe the failure that is being waited out.
    if (kind === 'spot_check_fail' || kind === 'receipt_invalid') r.struck = true;
    r.events += 1;
    r.lastEventAt = this.now();
    return r.score;
  }

  score(pubkey: string): number {
    const r = this.nodes.get(pubkey);
    return r ? this.effective(r) : this.cfg.start;
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
    const score = r ? this.effective(r) : this.cfg.start;
    if ((r?.consecSpotFails ?? 0) >= this.cfg.consecFailReject) return 'rejected';
    if (score < this.cfg.rejectBelow) return 'rejected';
    if ((this.d.isStaked?.(pubkey) ?? false) && score >= this.cfg.boundaryMin) return 'boundary';
    if (score >= this.cfg.middleMin) return 'middle';
    return 'relegated';
  }

  /** persistence seam — the orchestrator owns storage (sqlite), this module owns the policy.
   *  Stores the score as of `lastEventAt`, not the healed one: healing is a function of elapsed
   *  time, so recomputing it on read is what makes downtime count exactly like uptime. */
  snapshot(): Record<string, { score: number; consecSpotFails: number; events: number; lastEventAt: number; struck: boolean }> {
    const out: Record<string, NodeRecord> = {};
    for (const [k, v] of this.nodes) out[k] = { ...v };
    return out;
  }

  /**
   * Accepts a snapshot written before `struck` existed, and reads its silence STRICTLY: any record
   * carrying a penalty it cannot explain serves the slow clock. An old file records the score but
   * not what took it down, and the two shapes a caught cheater leaves behind are not the deep ones
   * you would expect — `receipt_invalid` never touches `consecSpotFails`, and a later
   * `spot_check_pass` zeroes it — so a node caught from good standing sits mid-range with a clean
   * counter, indistinguishable from an honest node that flaked twice. Guessing leniently there
   * would hand a proven cheater the 24x-faster clock; guessing strictly costs the honest node a day
   * where it wanted an hour, once, and only for a record written before this field existed.
   */
  restore(snap: Record<string, { score: number; consecSpotFails: number; events: number; lastEventAt: number; struck?: boolean }>) {
    this.nodes.clear();
    for (const [k, v] of Object.entries(snap)) {
      // A record we cannot read is not evidence. NaN is ABSORBING here — it fails every comparison
      // in roleFor (so the node is silently relegated) and survives every delta — so a corrupt
      // entry would be a permanent exile with no way back, the exact failure this module just fixed.
      const score = Number(v.score);
      if (!Number.isFinite(score)) continue;
      const consecSpotFails = Number(v.consecSpotFails) || 0;
      this.nodes.set(k, {
        score,
        consecSpotFails,
        events: Number(v.events) || 0,
        // healing READS this now: a file that predates it has no idle time to credit, and dating it
        // to 0 would credit ~50 years of it — an instant full pardon. `now` starts the clock here.
        lastEventAt: Number(v.lastEventAt) || this.now(),
        struck: v.struck ?? (consecSpotFails > 0 || score < this.cfg.start),
      });
    }
  }
}
