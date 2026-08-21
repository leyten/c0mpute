/**
 * The published price list.
 *
 * One place, because these numbers are quoted on the pricing page, in the
 * checkout, and by whatever hands out the daily grant — and three copies of a
 * price is how somebody ends up billed for a plan we never advertised.
 *
 * BILLING BACKEND: this file is the seam. The subscription release imports it,
 * or replaces it outright once plans and their payment-provider price ids live
 * server-side. Nothing here charges anyone today; it is copy and arithmetic.
 *
 * IT DOES NOT MATCH THE LIVE LEDGER YET, AND THAT IS DELIBERATE. Today
 * lib/token-price.ts prices a credit at a cent (CREDITS_PER_USD = 100) and
 * lib/tokenomics.ts charges 10-20 of them per prompt. The plans below assume
 * the redenominated credit these prices were approved against: a tenth of a
 * cent, one per typical message. Whoever wires the checkout has to land that
 * repricing in the same change, or a subscriber will be granted 300 credits a
 * day and watch twenty of them buy a single prompt.
 */

export type PricingPlanId = 'free' | 'pro' | 'max';

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

/** What a dollar buys when you top up outright (no subscription). FINAL,
 *  owner-approved 2026-08-21: retail sits above the plans' effective rate on
 *  purpose, Venice-style, so subscribing is always the better deal. The
 *  internal value of a credit stays a tenth of a cent; the gap between the
 *  two is the subscription incentive, and this page only ever quotes THIS
 *  number. */
export const CREDITS_PER_DOLLAR = 500;

/** What the common actions spend. A message is the unit; the rest are multiples. */
export const CREDIT_COST = {
  message: 1,
  image: 10,
} as const;

export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    dailyCredits: 20,
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
    monthly: 12,
    dailyCredits: 300,
    allowance: 'About 300 typical messages, or 30 images, a day.',
    blurb: 'Enough for a working day, every day.',
    features: [
      'Everything in Free',
      'Fifteen times the daily grant',
      'Vision, thinking and web-search tools all day',
      'Top up when a day runs long',
    ],
    cta: { label: 'Choose Pro', href: '/settings' },
    featured: true,
  },
  {
    id: 'max',
    name: 'Max',
    monthly: 30,
    dailyCredits: 750,
    allowance: 'About 750 typical messages, or 75 images, a day.',
    blurb: 'For agents, long tool runs and heavy days.',
    features: [
      'Everything in Pro',
      'Two and a half times the daily grant',
      'Room for agent loops and long context',
      'More images before the day runs out',
    ],
    cta: { label: 'Choose Max', href: '/settings' },
  },
];
