import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAllBuckets, getTreasuryStats } from '@/lib/treasury-ledger';
import { getTotalStaked } from '@/lib/staking';
import { getStakerAllowanceTodayTotals } from '@/lib/staker-allowance';
import { isZeroLaunched, TRADING_FEE_TO_POOL_PCT, POOL_BURN_SPLIT } from '@/lib/tokenomics';

export const dynamic = 'force-dynamic';

// Unclaimed creator fees accrue on-chain between the keeper's daily 15:00 claims:
//  - the PumpSwap coin-creator USDC vault (where trading fees pile up)
//  - the dev wallet's USDC ATA (claimed-but-not-yet-swept residual)
// These are deterministic addresses for the ZERO dev wallet + USDC; reading them
// with plain web3.js keeps the heavy keeper/anchor/pump-sdk out of the Next bundle.
const CREATOR_FEE_VAULT_USDC = new PublicKey('9FLiSF8v9KkokAZB99fS1BxsrmQNiMAycWYYVxK4JDnt');
const DEV_USDC_ATA = new PublicKey('4Am9tYN4FbMgHs8cnMkiNw8VYoH7VNajHNBmbYan8T74');

async function unclaimedFeesUsd(): Promise<number> {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const conn = new Connection(rpc, 'confirmed');
  const read = async (a: PublicKey) => {
    try { return (await conn.getTokenAccountBalance(a)).value.uiAmount ?? 0; } catch { return 0; }
  };
  const [vault, dev] = await Promise.all([read(CREATOR_FEE_VAULT_USDC), read(DEV_USDC_ATA)]);
  return vault + dev;
}

// GET /api/treasury — public buyback/staking dashboard data. Profit (leyten's
// cut) is intentionally not exposed.
export async function GET() {
  const buckets = getAllBuckets();
  const stats = getTreasuryStats();

  // "Pending" = the internal buckets PLUS the share of currently-unclaimed on-chain
  // creator fees that the next keeper cycle will route into the pool (35% of fees →
  // pool, split 50/50 buyback/staker). This is what's genuinely queued for the next
  // buyback + payout; the buckets alone read ~0 because the keeper claims and
  // distributes in the same daily tick.
  let pendingBuyback = buckets.buyback;
  let pendingStakerRewards = buckets.staker_rewards;
  try {
    const toPool = (await unclaimedFeesUsd()) * TRADING_FEE_TO_POOL_PCT;
    pendingBuyback += toPool * POOL_BURN_SPLIT;
    pendingStakerRewards += toPool * (1 - POOL_BURN_SPLIT);
  } catch { /* RPC hiccup — fall back to internal buckets only */ }

  const allowanceToday = getStakerAllowanceTodayTotals();

  return NextResponse.json({
    launched: isZeroLaunched(),
    pendingBuyback,
    pendingStakerRewards,
    totalStaked: getTotalStaked(),
    totalZeroBurned: stats.totalZeroBurned,
    totalUsdBuybackSpent: stats.totalUsdBuybackSpent,
    totalStakerRewardsPaid: stats.totalStakerRewardsPaid,
    freeInferenceSubsidizedTodayUsd: allowanceToday.subsidyUsd,
    freeInferenceCreditsToday: allowanceToday.creditsToday,
  });
}
