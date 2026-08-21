// The plan price list, and the arithmetic that reads it.
//
// PURE ON PURPOSE. No sqlite, no env, nothing server-only — the pricing page
// and the settings page both import this, so anything stateful here would drag
// better-sqlite3 into a client bundle. Plan STATE (who is on what, until when)
// lives in lib/db.ts next to the ledger it has to be atomic with; this file is
// only the numbers and the sums you can do on them.
//
// A plan is a PREPAID PERIOD bought with USDC, not a card subscription and not
// a credit spend: the user sends the exact dollar amount to the deposit address
// they already have, and the period starts when the money lands. That is the
// whole payment rail — the same one a top-up uses, with the deposit attributed
// to a plan instead of converted to credits.
//
// The prices are DOLLARS, stored as dollars. They used to be credit amounts
// with the dollar figure derived from the top-up rate; nothing charges credits
// any more, so a second representation would only be something to drift.

export type PlanId = 'free' | 'pro' | 'max';
/** The plans you can actually buy. Free is the floor, not a purchase. */
export type PaidPlanId = 'pro' | 'max';

/**
 * A month, fixed at 30 days rather than a calendar month.
 *
 * The upgrade carry-over divides by this, so a variable period would make the
 * same unused week worth a different number of days in February than in March.
 * Nobody buying a month wants that explained to them.
 */
export const PLAN_PERIOD_DAYS = 30;
export const PLAN_PERIOD_MS = PLAN_PERIOD_DAYS * 86_400_000;

/** How many months one purchase may buy. N months is N x the price, one payment. */
export const PLAN_MONTH_CHOICES = [1, 3, 12] as const;

export interface PlanSpec {
  id: PlanId;
  name: string;
  /** Credits granted at 00:00 UTC. Use-or-lose; they do not accumulate. */
  dailyCredits: number;
  /** USDC for one 30-day period. 0 for Free. */
  monthlyUsd: number;
}

export const PLAN_SPECS: Record<PlanId, PlanSpec> = {
  free: { id: 'free', name: 'Free', dailyCredits: 20, monthlyUsd: 0 },
  pro: { id: 'pro', name: 'Pro', dailyCredits: 300, monthlyUsd: 12 },
  max: { id: 'max', name: 'Max', dailyCredits: 750, monthlyUsd: 30 },
};

export const PAID_PLAN_IDS: PaidPlanId[] = ['pro', 'max'];

export function isPlanId(v: unknown): v is PlanId {
  return v === 'free' || v === 'pro' || v === 'max';
}

export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return v === 'pro' || v === 'max';
}

export function isPlanMonths(v: unknown): v is number {
  return typeof v === 'number' && (PLAN_MONTH_CHOICES as readonly number[]).includes(v);
}

/** A plan's shelf price for one month. */
export function planMonthlyUsd(id: PlanId): number {
  return PLAN_SPECS[id].monthlyUsd;
}

/**
 * What a purchase asks for, in USDC. Rounded to the cent because it is quoted
 * to a human and then compared against what arrived on chain — a price with a
 * float tail would be a price nobody can send exactly.
 */
export function planPriceUsd(plan: PaidPlanId, months: number): number {
  return Math.round(PLAN_SPECS[plan].monthlyUsd * months * 100) / 100;
}

/** Ranking, so an upgrade and a downgrade can be told apart. Free sorts last. */
export function planRank(id: PlanId): number {
  return id === 'max' ? 2 : id === 'pro' ? 1 : 0;
}

/**
 * How much time an unfinished period is worth on a different plan.
 *
 * An upgrade pays the new plan's full price and keeps the old plan's remainder
 * as EXTRA DAYS, converted by the price ratio: 15 days of Pro left, at 12/30 of
 * Max's price, is 6 more days of Max. The money the user already spent buys
 * exactly as much as it did before — no refund, no credit, no stub period.
 *
 * Not clamped to one period on purpose: someone who bought a year of Pro and
 * upgrades carries all of it across, because all of it was paid for. Floored,
 * so the conversion rounds the house's way by at most a millisecond.
 */
export function carriedOverMs(from: PaidPlanId, to: PaidPlanId, expiresAtMs: number, nowMs: number): number {
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  return Math.floor(remainingMs * (PLAN_SPECS[from].monthlyUsd / PLAN_SPECS[to].monthlyUsd));
}
