import { NextResponse } from 'next/server';
import { getAllBuckets, getTreasuryStats } from '@/lib/treasury-ledger';
import { getTotalStaked } from '@/lib/staking';
import { isZeroLaunched } from '@/lib/tokenomics';

export const dynamic = 'force-dynamic';

// GET /api/treasury — public buyback/staking dashboard data. Profit (leyten's
// cut) is intentionally not exposed.
export async function GET() {
  const buckets = getAllBuckets();
  const stats = getTreasuryStats();
  return NextResponse.json({
    launched: isZeroLaunched(),
    pendingBuyback: buckets.buyback,
    pendingStakerRewards: buckets.staker_rewards,
    totalStaked: getTotalStaked(),
    totalZeroBurned: stats.totalZeroBurned,
    totalUsdBuybackSpent: stats.totalUsdBuybackSpent,
    totalStakerRewardsPaid: stats.totalStakerRewardsPaid,
  });
}
