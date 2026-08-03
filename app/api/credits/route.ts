import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getCreditBalance, getOrCreateDepositWallet, getCreditTransactions, getFreePromptsUsed, getFreeImagesUsed, getTodayFreeSubsidyUsd } from '@/lib/db';
import { getStakerAllowanceStatus } from '@/lib/staker-allowance';
import { CREDITS_PER_USD } from '@/lib/token-price';
import { FREE_PROMPT_LIMIT, FREE_IMAGE_LIMIT, FREE_SUBSIDY_DAILY_CAP_USD, WORKER_STAKED_REVENUE_SHARE, TIER_CREDIT_COST } from '@/lib/tokenomics';

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

  const txLimit = Math.min(TX_MAX, Math.max(1, Number(req.nextUrl.searchParams.get('tx')) || TX_DEFAULT));

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
  const projectedSubsidyUsd = (TIER_CREDIT_COST.pro / CREDITS_PER_USD) * WORKER_STAKED_REVENUE_SHARE;
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
      creditsPerUsd: CREDITS_PER_USD,
      tierCredits: TIER_CREDIT_COST,
    },
  });
}
