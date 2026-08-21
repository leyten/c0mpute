// The plan price list, and the arithmetic that reads it.
//
// PURE ON PURPOSE. No sqlite, no env, nothing server-only — the pricing page
// and the settings page both import this, so anything stateful here would drag
// better-sqlite3 into a client bundle. Plan STATE (who is on what, until when)
// lives in lib/db.ts next to the credit ledger it has to be atomic with; this
// file is only the numbers and the sums you can do on them.
//
// A plan is a PREPAID PERIOD bought out of the credit balance, not a card
// subscription: buying one debits `periodCredits` and moves an expiry date.
// That is the whole payment rail — a user deposits USDC, gets credits, and
// spends some of them on a month. It needs no processor, and it is what makes
// "earn your subscription" possible later without a second code path.
//
// The dollar prices are DERIVED, never stored: a plan costs credits, and a
// credit costs what the top-up door charges for it. Writing $12 down next to
// 6,000 credits is how the two drift apart.

import { CREDITS_PER_DOLLAR_PURCHASED } from './token-price';

export type PlanId = 'free' | 'pro' | 'max';
/** The plans you can actually buy. Free is the floor, not a purchase. */
export type PaidPlanId = 'pro' | 'max';

/**
 * A month, fixed at 30 days rather than a calendar month.
 *
 * Proration divides by this, so a variable period would make the same unused
 * week worth a different number of credits in February than in March. Nobody
 * buying a month wants that explained to them.
 */
export const PLAN_PERIOD_DAYS = 30;
export const PLAN_PERIOD_MS = PLAN_PERIOD_DAYS * 86_400_000;

export interface PlanSpec {
  id: PlanId;
  name: string;
  /** Credits granted at 00:00 UTC. Use-or-lose; they do not accumulate. */
  dailyCredits: number;
  /** What one period costs, debited from the credit balance. 0 for Free. */
  periodCredits: number;
}

export const PLAN_SPECS: Record<PlanId, PlanSpec> = {
  free: { id: 'free', name: 'Free', dailyCredits: 20, periodCredits: 0 },
  pro: { id: 'pro', name: 'Pro', dailyCredits: 300, periodCredits: 6_000 },
  max: { id: 'max', name: 'Max', dailyCredits: 750, periodCredits: 15_000 },
};

export const PAID_PLAN_IDS: PaidPlanId[] = ['pro', 'max'];

export function isPlanId(v: unknown): v is PlanId {
  return v === 'free' || v === 'pro' || v === 'max';
}

export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return v === 'pro' || v === 'max';
}

/**
 * A plan's shelf price in dollars, at the rate the top-up door sells credits.
 * Display only — nothing charges dollars. Pro is 6,000 credits, and 6,000
 * credits is what $12 buys, so the page can say $12 without a second constant
 * that has to be kept in step.
 */
export function planMonthlyUsd(id: PlanId): number {
  return PLAN_SPECS[id].periodCredits / CREDITS_PER_DOLLAR_PURCHASED;
}

/** Ranking, so an upgrade and a downgrade can be told apart. Free sorts last. */
export function planRank(id: PlanId): number {
  return id === 'max' ? 2 : id === 'pro' ? 1 : 0;
}

/**
 * What the unspent remainder of a period is worth, in credits.
 *
 * Straight-line by time: half a Pro month left is half of Pro's price. Clamped
 * to one period so a period that was extended past 30 days (buying the same
 * plan twice) can never be valued above what it cost, and floored so the
 * conversion always rounds the house's way by at most one credit.
 */
export function unusedPeriodValue(plan: PaidPlanId, expiresAtMs: number, nowMs: number): number {
  const remainingMs = Math.min(Math.max(0, expiresAtMs - nowMs), PLAN_PERIOD_MS);
  return Math.floor(PLAN_SPECS[plan].periodCredits * (remainingMs / PLAN_PERIOD_MS));
}

/**
 * What it costs to move up a tier mid-period: a fresh full period of the new
 * plan, less whatever the old one still had in it.
 *
 * Deliberately the simple version. The alternative — keeping the old expiry and
 * charging a stub of the difference — needs a second period length, a second
 * proration on renewal, and an explanation. This one is a single debit, a
 * single new 30-day period, and one sentence of copy.
 */
export function upgradeCostCredits(from: PaidPlanId, to: PaidPlanId, expiresAtMs: number, nowMs: number): number {
  return Math.max(0, PLAN_SPECS[to].periodCredits - unusedPeriodValue(from, expiresAtMs, nowMs));
}
