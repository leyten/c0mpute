// Plan state: what a user is on right now, and the four things that change it.
//
// Everything here is derived from one row and the clock. There is no status
// column to fall out of step with the expiry date, and no scheduler: a period
// that has run out is resolved the next time anybody asks about it, which is
// how a plan renews or lapses.
//
// LAZY RESOLUTION IS A DECISION, NOT A SHORTCUT. A cron that swept expired
// plans at midnight would charge people who have not come back, for a month
// they are not going to use. Resolving on the next request means the renewal
// happens when the user turns up, and someone who never returns is never billed
// again. It also means no new moving part to keep running: the chat path, the
// credits endpoint and the settings page all resolve the same way.
//
// PLAN GRANTS ARE NOT SUBSIDY. A plan's daily credits were paid for when the
// period was bought, so the worker who serves a plan job is paid out of that
// revenue. The free-subsidy caps exist to bound what the TREASURY gives away
// and must never gate a lane the user has already funded.

import {
  PLAN_SPECS,
  PLAN_PERIOD_MS,
  planRank,
  upgradeCostCredits,
  isPaidPlanId,
  type PlanId,
  type PaidPlanId,
} from './plans';
import {
  getPlanRow,
  purchasePlanPeriod,
  lapsePlan,
  setPlanAutoRenew,
  schedulePlanChange,
  getCreditBalance,
} from './db';
import { drawAllowance, refundAllowance } from './allowance';

export interface PlanState {
  /** What the account is on after resolution. Free is the floor, not an error. */
  plan: PlanId;
  /** End of the current paid period, or null on Free. */
  expiresAt: string | null;
  /** Whole days left, rounded up. 0 on Free. */
  daysLeft: number;
  autoRenew: boolean;
  /** A cheaper plan taking effect at the end of this period. */
  pendingPlan: PlanId | null;
  /** Today's grant, in credits. Free's standing grant when there is no plan. */
  dailyCredits: number;
  /** True when a paid period ran out and was not renewed. Drives the notice. */
  lapsed: boolean;
}

const FREE_STATE: PlanState = {
  plan: 'free',
  expiresAt: null,
  daysLeft: 0,
  autoRenew: false,
  pendingPlan: null,
  dailyCredits: PLAN_SPECS.free.dailyCredits,
  lapsed: false,
};

function daysLeft(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 86_400_000));
}

function activeState(plan: PaidPlanId, expiresAt: string, autoRenew: boolean, pendingPlan: PlanId | null, nowMs: number): PlanState {
  return {
    plan,
    expiresAt,
    daysLeft: daysLeft(Date.parse(expiresAt), nowMs),
    autoRenew,
    pendingPlan,
    dailyCredits: PLAN_SPECS[plan].dailyCredits,
    lapsed: false,
  };
}

/**
 * The current plan, renewing or lapsing an expired one on the way past.
 *
 * Safe to call on every request: an active plan is one indexed read, and an
 * expired one settles itself once and then stops writing (the lapse turns
 * auto-renew off, so the branch that writes is not entered again).
 */
export function resolvePlanState(privyId: string): PlanState {
  const row = getPlanRow(privyId);
  if (!row || !isPaidPlanId(row.plan)) return FREE_STATE;

  const now = Date.now();
  const expiresMs = Date.parse(row.expires_at);
  const pending = isPaidPlanId(row.pending_plan) ? row.pending_plan : null;

  if (expiresMs > now) {
    return activeState(row.plan, row.expires_at, row.auto_renew === 1, pending, now);
  }

  // The period is over. Renew it if the user asked us to and the balance
  // covers it; otherwise this is where the plan ends.
  if (row.auto_renew === 1 || pending) {
    const next: PaidPlanId = pending ?? row.plan;
    const cost = PLAN_SPECS[next].periodCredits;
    if (row.auto_renew === 1 && getCreditBalance(privyId).balance >= cost) {
      // From now, not from the old expiry date. Someone away for three months
      // owes one month on their return, not three for time they did not use.
      const expiresAt = new Date(now + PLAN_PERIOD_MS).toISOString();
      const bought = purchasePlanPeriod({
        privyId,
        plan: next,
        credits: cost,
        expiresAt,
        kind: 'renew',
        description: `${PLAN_SPECS[next].name} plan renewal, ${PLAN_SPECS[next].periodCredits} credits`,
        autoRenew: true,
        pendingPlan: null,
      });
      if (bought) return activeState(next, expiresAt, true, null, now);
    }
    lapsePlan(privyId);
  }

  return { ...FREE_STATE, lapsed: true };
}

/** Today's grant and which bucket it draws from. */
export function dailyGrantFor(state: PlanState): { source: 'plan' | 'free'; credits: number } {
  return state.plan === 'free'
    ? { source: 'free', credits: PLAN_SPECS.free.dailyCredits }
    : { source: 'plan', credits: PLAN_SPECS[state.plan].dailyCredits };
}

export interface DailyGrantDraw {
  source: 'plan' | 'free';
  /** The UTC day the draw was written to. Refunds MUST be keyed to it. */
  day: string;
  plan: PlanId;
}

/**
 * Draw against today's grant, resolving the plan on the way past.
 *
 * `allowFree` gates the treasury-subsidized half. The rule the codebase already
 * follows is that subsidized lanes are human-onboarding only while funded lanes
 * work everywhere, so an API key draws a plan grant (its owner paid for it) and
 * never the Free one.
 *
 * All-or-nothing, like every other draw: a request that does not fit inside
 * what is left of the grant takes none of it and falls through to the next
 * source. Splitting one job across the grant and the balance would mean every
 * refund path downstream had to split it back the same way.
 */
export function drawDailyGrant(
  privyId: string,
  credits: number,
  allowFree: boolean,
  /** Pass an already-resolved state to avoid renewing/lapsing twice in one request. */
  resolved?: PlanState,
): DailyGrantDraw | null {
  if (credits <= 0) return null;
  const state = resolved ?? resolvePlanState(privyId);
  const grant = dailyGrantFor(state);
  if (grant.source === 'free' && !allowFree) return null;
  const day = drawAllowance(privyId, grant.source, credits, { resolveAllowance: () => grant.credits });
  return day ? { source: grant.source, day, plan: state.plan } : null;
}

/** Give back grant credits drawn earlier, against the day they were drawn. */
export function refundDailyGrant(privyId: string, source: 'plan' | 'free', credits: number, day?: string): void {
  refundAllowance(privyId, source, credits, day);
}

export type BuyPlanResult =
  | { ok: true; action: 'purchase' | 'renew' | 'upgrade' | 'downgrade_scheduled'; state: PlanState; creditsSpent: number }
  | { ok: false; error: string; creditsNeeded?: number };

/**
 * Buy, extend, upgrade or schedule a downgrade — whichever the current state
 * makes this request mean.
 *
 * ONE entry point on purpose. A card checkout added later prices the same way
 * and calls the same function; the only thing it changes is where the credits
 * came from. Splitting "buy" and "upgrade" into separate endpoints is how the
 * two end up with different proration.
 */
export function buyPlan(privyId: string, plan: PlanId): BuyPlanResult {
  if (!isPaidPlanId(plan)) return { ok: false, error: 'Free is not a plan you buy. Cancel auto-renew instead.' };

  const state = resolvePlanState(privyId);
  const now = Date.now();
  const balance = getCreditBalance(privyId).balance;
  const spec = PLAN_SPECS[plan];

  // Moving DOWN mid-period: no money moves and nothing is taken away. The
  // period they paid for runs to the end, then the cheaper plan starts.
  if (isPaidPlanId(state.plan) && planRank(plan) < planRank(state.plan)) {
    if (!schedulePlanChange(privyId, plan)) return { ok: false, error: 'No active plan to change.' };
    return { ok: true, action: 'downgrade_scheduled', state: resolvePlanState(privyId), creditsSpent: 0 };
  }

  const upgrading = isPaidPlanId(state.plan) && planRank(plan) > planRank(state.plan);
  const extending = state.plan === plan && state.expiresAt !== null;

  const cost = upgrading
    ? upgradeCostCredits(state.plan as PaidPlanId, plan, Date.parse(state.expiresAt!), now)
    : spec.periodCredits;

  if (balance < cost) {
    return { ok: false, error: 'Your credit balance does not cover this plan.', creditsNeeded: Math.ceil(cost - balance) };
  }

  // Extending adds a period to the end of the one still running; everything
  // else starts a fresh period now. An upgrade deliberately restarts the
  // clock — the unused value of the old plan was converted into the price.
  const expiresAt = new Date((extending ? Date.parse(state.expiresAt!) : now) + PLAN_PERIOD_MS).toISOString();
  const kind = upgrading ? 'upgrade' : extending ? 'renew' : 'purchase';
  const description = upgrading
    ? `Upgrade to ${spec.name}, ${cost} credits`
    : extending
      ? `${spec.name} plan renewal, ${cost} credits`
      : `${spec.name} plan, ${cost} credits`;

  const bought = purchasePlanPeriod({
    privyId,
    plan,
    credits: cost,
    expiresAt,
    kind,
    description,
    // On by default at purchase, and an upgrade clears any scheduled
    // downgrade — you cannot be on your way up and down at once.
    autoRenew: extending ? state.autoRenew : true,
    pendingPlan: null,
  });
  if (!bought) return { ok: false, error: 'Could not take the payment. Try again.' };

  return { ok: true, action: kind, state: resolvePlanState(privyId), creditsSpent: cost };
}

/** Turn auto-renew on or off for the current plan. */
export function setAutoRenew(privyId: string, enabled: boolean): PlanState | null {
  const state = resolvePlanState(privyId);
  if (state.plan === 'free') return null;
  if (!setPlanAutoRenew(privyId, enabled)) return null;
  return resolvePlanState(privyId);
}
