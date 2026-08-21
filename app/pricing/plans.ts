/**
 * The published price list — the COPY half of it.
 *
 * Every number on this page now comes from lib/plans.ts, which is what the
 * checkout debits and what hands out the daily grant. This file holds only the
 * words: who a plan is for, what to call the button. A price quoted here can no
 * longer disagree with the price charged, because there is nothing here to
 * disagree with.
 *
 * The seam this file promised is closed: lib/plans.ts is the source of truth,
 * and a future card checkout prices against the same specs rather than a copy.
 */

import { PLAN_SPECS, planMonthlyUsd, type PlanId } from '@/lib/plans';
import { CREDITS_PER_DOLLAR_PURCHASED } from '@/lib/token-price';

export type PricingPlanId = PlanId;

export interface PricingPlan {
  id: PricingPlanId;
  /** Displayed in caps on the card. */
  name: string;
  /** United States dollars per month. Free is a standing grant, not a trial. */
  monthly: number;
  /** Credits granted every day. Unused ones do not carry into tomorrow. */
  dailyCredits: number;
  /** The grant restated in the reader's units, since nobody thinks in credits. */
  allowance: string;
  /** One line on who the plan is for. */
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  /** The one card the row lifts out. Exactly one plan may set this. */
  featured?: boolean;
}

/** What a dollar buys when you top up outright (no subscription). Retail sits
 *  above the plans' effective rate on purpose, Venice-style, so subscribing is
 *  always the better deal. The internal value of a credit stays a tenth of a
 *  cent; the gap between the two is the subscription incentive, and this page
 *  only ever quotes THIS number — which is also the rate a plan purchase is
 *  priced at, so the dollar figures below are the same arithmetic a buyer does. */
export const CREDITS_PER_DOLLAR = CREDITS_PER_DOLLAR_PURCHASED;

/** What the common actions spend. A message is the unit; the rest are multiples. */
export const CREDIT_COST = {
  message: 1,
  image: 10,
} as const;

// The prices and grants below are read from lib/plans.ts, which is what the
// checkout debits and what the grant engine hands out. The prose stays written
// out by hand: "about 300 typical messages" is a claim about the model, not a
// number this file is entitled to compute, and it wants a human when it moves.
export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: planMonthlyUsd('free'),
    dailyCredits: PLAN_SPECS.free.dailyCredits,
    allowance: 'About 20 typical messages a day.',
    blurb: 'The whole model, in small daily helpings.',
    features: [
      'Qwen3.8 27B Uncensored, in full',
      'Vision, thinking and web search',
      'No card, no trial clock',
    ],
    cta: { label: 'Start free', href: '/chat' },
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: planMonthlyUsd('pro'),
    dailyCredits: PLAN_SPECS.pro.dailyCredits,
    allowance: 'About 300 typical messages, or 30 images, a day.',
    blurb: 'Enough for a working day, every day.',
    features: [
      'Everything in Free',
      'Fifteen times the daily grant',
      'Vision, thinking and web-search tools all day',
      'Top up when a day runs long',
    ],
    cta: { label: 'Choose Pro', href: '/settings#plans' },
    featured: true,
  },
  {
    id: 'max',
    name: 'Max',
    monthly: planMonthlyUsd('max'),
    dailyCredits: PLAN_SPECS.max.dailyCredits,
    allowance: 'About 750 typical messages, or 75 images, a day.',
    blurb: 'For agents, long tool runs and heavy days.',
    features: [
      'Everything in Pro',
      'Two and a half times the daily grant',
      'Room for agent loops and long context',
      'More images before the day runs out',
    ],
    cta: { label: 'Choose Max', href: '/settings#plans' },
  },
];
