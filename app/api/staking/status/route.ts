import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  getOrCreateStakingWallet,
  syncStake,
  getStakePosition,
  getClaimableRewards,
  getTotalEarnedRewards,
  getTotalStaked,
  getEligibleStakers,
} from '@/lib/staking';
import { getTokenUiBalance } from '@/lib/payout';
import { getBucket } from '@/lib/treasury-ledger';
import {
  getZeroMint,
  isZeroLaunched,
  WORKER_STAKE_THRESHOLD,
  STAKE_MIN_AGE_MS,
  MIN_UNSTAKE_ZERO,
  KEEPER_UTC_HOUR,
} from '@/lib/tokenomics';

// GET /api/staking/status — the staking wallet address + the user's live
// position (re-synced from chain on every call) + claimable USDC rewards.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isZeroLaunched()) {
    return NextResponse.json({ launched: false });
  }

  const stakingAddress = getOrCreateStakingWallet(privyId);

  // Re-read the on-chain ZERO balance and fold it into the DB position so the
  // stake always reflects what the user actually deposited/withdrew.
  const mint = getZeroMint()!;
  const onChain = await getTokenUiBalance(stakingAddress, mint);
  const position = syncStake(privyId, onChain);

  // Forward-looking payout: the staker-rewards bucket is distributed pro-rata to
  // mature stake at the next keeper epoch (daily, KEEPER_UTC_HOUR UTC). Project
  // this user's share at current numbers — an estimate (pool + mature stake both
  // move before the epoch), so the UI labels it "~".
  const now = new Date();
  const nextEpoch = new Date(now);
  nextEpoch.setUTCHours(KEEPER_UTC_HOUR, 0, 0, 0);
  if (nextEpoch <= now) nextEpoch.setUTCDate(nextEpoch.getUTCDate() + 1);

  const stakerPoolUsd = getBucket('staker_rewards');
  const totalMature = getEligibleStakers().reduce((s, e) => s + e.stakedAmount, 0);
  const projectedRewardUsd =
    position.eligible && totalMature > 0 ? stakerPoolUsd * (position.matureAmount / totalMature) : 0;

  return NextResponse.json({
    launched: true,
    stakingAddress,
    stakedAmount: position.stakedAmount,
    matureAmount: position.matureAmount,
    stakedSince: position.stakedSince,
    nextMatureAt: position.nextMatureAt,
    eligible: position.eligible,
    minAgeMs: STAKE_MIN_AGE_MS,
    minUnstake: MIN_UNSTAKE_ZERO,
    workerThreshold: WORKER_STAKE_THRESHOLD,
    claimableUsd: getClaimableRewards(privyId),
    totalEarnedUsd: getTotalEarnedRewards(privyId),
    totalStaked: getTotalStaked(),
    nextEpochAt: nextEpoch.toISOString(),
    stakerPoolUsd,
    projectedRewardUsd,
  });
}
