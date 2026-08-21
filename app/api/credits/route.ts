import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getCreditBalance, getOrCreateDepositWallet, getCreditTransactions, getFreePromptsUsed, getFreeImagesUsed, getTodayFreeSubsidyUsd } from '@/lib/db';
import { getStakerAllowanceStatus } from '@/lib/staker-allowance';
import { resolvePlanState, dailyGrantFor, getPlanIntent } from '@/lib/plan-state';
import { getAllowanceUsed } from '@/lib/allowance';
import { PLAN_SPECS, PAID_PLAN_IDS, PLAN_MONTH_CHOICES, planMonthlyUsd } from '@/lib/plans';
import { CREDITS_PER_USD, CREDITS_PER_DOLLAR_PURCHASED } from '@/lib/token-price';
import {
  FREE_PROMPT_LIMIT,
  FREE_IMAGE_LIMIT,
  FREE_SUBSIDY_DAILY_CAP_USD,
  WORKER_STAKED_REVENUE_SHARE,
  TEXT_USD_PER_M_INPUT,
  TEXT_USD_PER_M_OUTPUT,
  TYPICAL_INPUT_TOKENS,
  TYPICAL_OUTPUT_TOKENS,
  textCreditCost,
  textCreditReservation,
} from '@/lib/tokenomics';
import { MAX_INPUT_TOKENS_NATIVE, MAX_OUTPUT_TOKENS_THINKING } from '@/lib/orchestrator/types';
import { IMAGE_CREDITS } from '@/lib/image-gen';

// How many credit transactions to return. The usage panel draws its daily
// activity from these rows, so it asks for a year's worth; every other caller
// wants the short recent list and pays for nothing more.
const TX_DEFAULT = 20;
const TX_MAX = 500;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Math.trunc: the clamp preserved fractions, and a fractional LIMIT is a
  // datatype mismatch in SQLite. `?tx=1.5` threw and 500'd the whole payload —
  // balance, free prompts and the staker lane all share this handler, so the
  // chat page lost every one of them.
  const txLimit = Math.min(TX_MAX, Math.max(1, Math.trunc(Number(req.nextUrl.searchParams.get('tx'))) || TX_DEFAULT));

  const balance = getCreditBalance(privyId);
  const depositWallet = getOrCreateDepositWallet(privyId);
  const recentTransactions = getCreditTransactions(privyId, txLimit);
  const freePromptsRemaining = Math.max(0, FREE_PROMPT_LIMIT - getFreePromptsUsed(privyId));
  const freeImagesRemaining = Math.max(0, FREE_IMAGE_LIMIT - getFreeImagesUsed(privyId));
  const stakerAllowance = getStakerAllowanceStatus(privyId);

  // Plan state, resolved here as everywhere else — this is one of the points a
  // finished period renews or lapses. The daily meter in the chat composer and
  // the Plans section in settings both read this, so both get the grant, the
  // plan and the price list from a single request.
  const planState = resolvePlanState(privyId);
  const grant = dailyGrantFor(planState);
  const grantUsed = getAllowanceUsed(privyId, grant.source);

  // The onboarding grant is only issued while the treasury's daily free-subsidy
  // budget can still pay a worker for the job (see the orchestrator's submit
  // path). Surfaced as a plain boolean so the UI can say why a remaining count
  // isn't spending today — the cap itself and its usage stay private.
  // Project the WORST case a free prompt can reserve — a full-length answer to a
  // full-length prompt on the native lane — because that is exactly what the
  // orchestrator reserves at submit. Projecting anything smaller would show
  // prompts as live that the orchestrator then refuses.
  const worstFreeCredits = textCreditReservation(MAX_INPUT_TOKENS_NATIVE, MAX_OUTPUT_TOKENS_THINKING);
  const projectedSubsidyUsd = (worstFreeCredits / CREDITS_PER_USD) * WORKER_STAKED_REVENUE_SHARE;
  const freePromptsPaused = getTodayFreeSubsidyUsd() + projectedSubsidyUsd > FREE_SUBSIDY_DAILY_CAP_USD;

  return NextResponse.json({
    balance: balance.balance,
    totalDeposited: balance.totalDeposited,
    totalSpent: balance.totalSpent,
    depositWallet,
    recentTransactions,
    freePromptsRemaining,
    freePromptLimit: FREE_PROMPT_LIMIT,
    freePromptsPaused,
    freeImagesRemaining,
    freeImageLimit: FREE_IMAGE_LIMIT,
    stakerAllowance,
    plan: {
      id: planState.plan,
      name: PLAN_SPECS[planState.plan].name,
      expiresAt: planState.expiresAt,
      daysLeft: planState.daysLeft,
      // True when a period just ran out. The UI says so once; it is not an
      // error state, just the reason they are back on Free.
      lapsed: planState.lapsed,
    },
    // An open purchase waiting to be paid, if there is one. Sent here rather
    // than only from /api/plans so the settings page renders the whole Plans
    // section — plan, grant, price list and the payment in flight — from the
    // one request it already makes.
    planIntent: getPlanIntent(privyId),
    dailyGrant: {
      // Which bucket today's grant comes from. 'plan' is prepaid, 'free' is
      // the standing signed-in grant.
      source: grant.source,
      total: grant.credits,
      used: grantUsed,
      remaining: Math.max(0, grant.credits - grantUsed),
      // Every grant resets at 00:00 UTC and does not carry over. Sent so the
      // meter can say when, without the client inventing a timezone rule.
      resetsAt: `${new Date().toISOString().slice(0, 10)}T24:00:00Z`,
    },
    config: {
      // What a credit is worth when SPENT …
      creditsPerUsd: CREDITS_PER_USD,
      // … and what a dollar BUYS on the top-up door. Different numbers; the
      // top-up form must quote the second one.
      creditsPerDollarPurchased: CREDITS_PER_DOLLAR_PURCHASED,
      // Text is metered per token, so there is no per-tier price to hand the
      // client any more. What a UI actually needs is a yardstick — "your
      // allowance is worth about N messages" — so publish the cost of a typical
      // message and the rate card it comes from, and let nothing pretend the
      // number is a fixed charge.
      typicalMessageCredits: textCreditCost(TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS),
      textRate: { usdPerMInput: TEXT_USD_PER_M_INPUT, usdPerMOutput: TEXT_USD_PER_M_OUTPUT },
      imageCredits: IMAGE_CREDITS,
      // The price list, so the settings page quotes buy buttons from the same
      // numbers the deposit checker charges rather than a copy of them.
      plans: PAID_PLAN_IDS.map((id) => ({
        id,
        name: PLAN_SPECS[id].name,
        dailyCredits: PLAN_SPECS[id].dailyCredits,
        monthlyUsd: planMonthlyUsd(id),
      })),
      // How many months one purchase may buy. The server refuses anything else,
      // so the picker has to be built from this and not from a second list.
      planMonths: PLAN_MONTH_CHOICES,
      freeDailyCredits: PLAN_SPECS.free.dailyCredits,
    },
  });
}
