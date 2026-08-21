// Plan state: what a user is on right now, and the payment that changes it.
//
// Everything here is derived from one row and the clock. There is no status
// column to fall out of step with the expiry date, and no scheduler: a period
// that has run out is resolved the next time anybody asks about it, which is
// how a plan lapses.
//
// A PERIOD THAT ENDS, ENDS. There is no renewal from the credit balance and no
// scheduled change of plan — both belonged to the rail where a plan was bought
// with credits, and both meant money could move without the user doing
// anything. Buying again is a purchase they make.
//
// PLAN GRANTS ARE NOT SUBSIDY. A plan's daily credits were paid for when the
// period was bought, so the worker who serves a plan job is paid out of that
// revenue. The free-subsidy caps exist to bound what the TREASURY gives away
// and must never gate a lane the user has already funded.

import {
  PLAN_SPECS,
  PLAN_PERIOD_MS,
  planRank,
  planPriceUsd,
  carriedOverMs,
  isPaidPlanId,
  isPlanMonths,
  type PlanId,
  type PaidPlanId,
} from './plans';
import {
  getPlanRow,
  lapsePlan,
  getOpenPlanIntent,
  createPlanIntent,
  cancelPlanIntent,
  consumePlanIntent,
} from './db';
import { CREDITS_PER_DOLLAR_PURCHASED } from './token-price';
import { drawAllowance, refundAllowance, getAllowanceUsed } from './allowance';

export interface PlanState {
  /** What the account is on after resolution. Free is the floor, not an error. */
  plan: PlanId;
  /** End of the current paid period, or null on Free. */
  expiresAt: string | null;
  /** Whole days left, rounded up. 0 on Free. */
  daysLeft: number;
  /** Today's grant, in credits. Free's standing grant when there is no plan. */
  dailyCredits: number;
  /** True when a paid period ran out. Drives the notice. */
  lapsed: boolean;
}

const FREE_STATE: PlanState = {
  plan: 'free',
  expiresAt: null,
  daysLeft: 0,
  dailyCredits: PLAN_SPECS.free.dailyCredits,
  lapsed: false,
};

function daysLeft(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 86_400_000));
}

function activeState(plan: PaidPlanId, expiresAt: string, nowMs: number): PlanState {
  return {
    plan,
    expiresAt,
    daysLeft: daysLeft(Date.parse(expiresAt), nowMs),
    dailyCredits: PLAN_SPECS[plan].dailyCredits,
    lapsed: false,
  };
}

/**
 * The current plan, lapsing an expired one on the way past.
 *
 * Safe to call on every request: an active plan is one indexed read, and an
 * expired one settles itself once and then stops writing (lapsePlan is a no-op
 * after the marker is set).
 */
export function resolvePlanState(privyId: string): PlanState {
  const row = getPlanRow(privyId);
  if (!row || !isPaidPlanId(row.plan)) return FREE_STATE;

  const now = Date.now();
  if (Date.parse(row.expires_at) > now) return activeState(row.plan, row.expires_at, now);

  lapsePlan(privyId);
  return { ...FREE_STATE, lapsed: true };
}

/** Today's grant and which bucket it draws from. */
export function dailyGrantFor(state: PlanState): { source: 'plan' | 'free'; credits: number } {
  return state.plan === 'free'
    ? { source: 'free', credits: PLAN_SPECS.free.dailyCredits }
    : { source: 'plan', credits: PLAN_SPECS[state.plan].dailyCredits };
}

/**
 * Credits left in today's grant. An advisory read for callers that want to know
 * whether the grant lane is live before they commit to it; drawAllowance stays
 * the atomic authority, so a race here just falls through to the next lane.
 */
export function dailyGrantRemaining(privyId: string, state: PlanState): number {
  const grant = dailyGrantFor(state);
  return Math.max(0, grant.credits - getAllowanceUsed(privyId, grant.source));
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
  /** Pass an already-resolved state to avoid lapsing twice in one request. */
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

// ── Buying a period ──
//
// The user opens an INTENT — this plan, this many months, this exact amount —
// and then sends that amount of USDC to the deposit address they already have.
// The intent is what tells the deposit checker that the next payment is for a
// plan rather than a top-up. It is not a hold, a promise or a debt: nothing
// happens until the money lands, and nothing is owed if it never does.
//
// An intent expires so a stale one cannot silently swallow a top-up months
// later. Two hours is long enough to open a wallet and short enough that the
// user still remembers pressing the button.

export const PLAN_INTENT_TTL_MS = 2 * 3_600_000;

/**
 * One micro-USDC, the smallest unit that exists on chain.
 *
 * The comparison is against a float built by dividing an integer token amount
 * by 10^6 and subtracting the last figure we credited, so an exact payment can
 * land a few attoseconds of a cent light. This tolerance covers that and
 * nothing else — it is not a discount.
 */
const USDC_DUST = 1e-6;

export interface PlanIntent {
  id: string;
  plan: PaidPlanId;
  planName: string;
  months: number;
  /** Exactly what to send, in USDC. */
  amountUsd: number;
  createdAt: string;
  expiresAt: string;
  /** Past its window: a payment now becomes credits instead. */
  expired: boolean;
}

function toIntent(row: {
  id: string; privy_id: string; plan: string; months: number;
  expected_usd: number; created_at: string; expires_at: string;
}): PlanIntent | null {
  if (!isPaidPlanId(row.plan)) return null;
  return {
    id: row.id,
    plan: row.plan,
    planName: PLAN_SPECS[row.plan].name,
    months: row.months,
    amountUsd: row.expected_usd,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: Date.parse(row.expires_at) <= Date.now(),
  };
}

/** The user's open intent, expired or not, so the page can say which it is. */
export function getPlanIntent(privyId: string): PlanIntent | null {
  const row = getOpenPlanIntent(privyId);
  return row ? toIntent(row) : null;
}

export type OpenIntentResult = { ok: true; intent: PlanIntent } | { ok: false; error: string };

/**
 * Quote a purchase and open the intent for it. Replaces whatever was open
 * before — a user who changes their mind before paying has one live amount, not
 * two the checker would have to choose between.
 */
export function openPlanIntent(privyId: string, plan: PlanId, months: number): OpenIntentResult {
  if (!isPaidPlanId(plan)) return { ok: false, error: 'Free is not a plan you buy.' };
  if (!isPlanMonths(months)) return { ok: false, error: 'Choose 1, 3 or 12 months.' };

  // A cheaper plan cannot be bought over a dearer one that is still running.
  // There is no proration downwards and nothing to refund, so the honest answer
  // is to wait: the period they paid for runs out, and then they buy the other
  // one. Refusing it HERE is what makes it unpayable — the checker only ever
  // settles a payment against an intent that exists.
  const state = resolvePlanState(privyId);
  if (isPaidPlanId(state.plan) && planRank(plan) < planRank(state.plan)) {
    return {
      ok: false,
      error: `You are on ${PLAN_SPECS[state.plan].name} for another ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}. You can buy ${PLAN_SPECS[plan].name} once it ends.`,
    };
  }

  const row = createPlanIntent({
    privyId,
    plan,
    months,
    expectedUsd: planPriceUsd(plan, months),
    expiresAt: new Date(Date.now() + PLAN_INTENT_TTL_MS).toISOString(),
  });
  const intent = toIntent(row);
  return intent ? { ok: true, intent } : { ok: false, error: 'Could not open a purchase. Try again.' };
}

/** Drop the open intent. The next deposit buys credits again, as usual. */
export function closePlanIntent(privyId: string): boolean {
  return cancelPlanIntent(privyId);
}

export interface PlanPayment {
  plan: PaidPlanId;
  planName: string;
  months: number;
  /** USDC that went to the plan. The rest became credits. */
  usdApplied: number;
  excessCredits: number;
  expiresAt: string;
  action: 'purchase' | 'renew' | 'upgrade';
  /** Days the old plan's remainder was worth on this one. Upgrades only. */
  carriedOverDays: number;
}

/** An unaccounted deposit, as the check-deposit route read it. */
export interface IncomingDeposit {
  /** USD value of the tokens the deposit marker has not accounted for yet. */
  usd: number;
  mint: string;
  /** The marker as the route read it, and what it becomes once this applies. */
  creditedBefore: number;
  creditedAfter: number;
}

/**
 * Whether an arriving deposit pays for a plan, and what it bought.
 *
 * `null` means it did not, and the caller converts the whole deposit to credits
 * exactly as it always has — no intent, an expired one, a cancelled one, or not
 * enough sent. `'retry'` means the money is NOT the caller's to credit: either
 * another check already applied it, or the state it was settling against moved
 * under it. Crediting on a `'retry'` is how one transfer buys a period and gets
 * paid out as credits as well.
 *
 * The deposit marker is both checked and moved inside the settling transaction,
 * which is what makes those outcomes safe to report rather than guess at.
 */
export function applyDepositToPlan(privyId: string, deposit: IncomingDeposit): PlanPayment | 'retry' | null {
  const usdReceived = deposit.usd;
  const row = getOpenPlanIntent(privyId);
  if (!row || !isPaidPlanId(row.plan)) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) return null;
  // Short of the quote. It becomes credits, the intent stays open, and the user
  // is told both — money that arrives is never held, and never lost.
  if (usdReceived + USDC_DUST < row.expected_usd) return null;

  const plan = row.plan;
  const state = resolvePlanState(privyId);
  const periodMs = row.months * PLAN_PERIOD_MS;

  // Same plan: the months go on the end of what is running. A dearer plan: it
  // starts now, and the remainder of the old one comes across as extra days at
  // the price ratio. Nothing running: it starts now.
  let action: 'purchase' | 'renew' | 'upgrade' = 'purchase';
  let base = now;
  let carriedMs = 0;
  if (isPaidPlanId(state.plan) && state.expiresAt) {
    if (state.plan === plan) {
      action = 'renew';
      base = Date.parse(state.expiresAt);
    } else {
      action = 'upgrade';
      carriedMs = carriedOverMs(state.plan, plan, Date.parse(state.expiresAt), now);
    }
  }
  const expiresAt = new Date(base + periodMs + carriedMs).toISOString();
  const excessCredits = Math.max(0, Math.floor((usdReceived - row.expected_usd) * CREDITS_PER_DOLLAR_PURCHASED));

  const result = consumePlanIntent({
    intentId: row.id,
    privyId,
    plan,
    expiresAt,
    kind: action,
    usdPaid: row.expected_usd,
    excessCredits,
    excessDescription: `USDC deposit, change from ${PLAN_SPECS[plan].name} plan`,
    mint: deposit.mint,
    creditedBefore: deposit.creditedBefore,
    creditedAfter: deposit.creditedAfter,
    ifExpiresAt: state.expiresAt,
  });
  // Only a CANCELLED intent means nobody has a claim on this money, so only
  // that one falls through to the credit path. The rest are somebody else's
  // settlement or a stale read, and both want another check, not a payout.
  if (result === 'already_settled' || result === 'deposit_moved' || result === 'period_moved') return 'retry';
  if (result !== 'ok') return null;

  return {
    plan,
    planName: PLAN_SPECS[plan].name,
    months: row.months,
    usdApplied: row.expected_usd,
    excessCredits,
    expiresAt,
    action,
    carriedOverDays: Math.floor(carriedMs / 86_400_000),
  };
}
