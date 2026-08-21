import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getCreditBalance, getOrCreateDepositWallet, getCreditTransactions, getFreePromptsUsed, getFreeImagesUsed, getTodayFreeSubsidyUsd } from '@/lib/db';
import { getStakerAllowanceStatus } from '@/lib/staker-allowance';
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
    },
  });
}
