import { NextRequest, NextResponse } from 'next/server';
import { deleteProfile } from '@/lib/db';
import { getAuthUserId, deletePrivyUser } from '@/lib/privy-server';
import { getStakePosition, getClaimableRewards } from '@/lib/staking';

export async function DELETE(request: NextRequest) {
  try {
    // Verify auth — only delete own account
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Guard: never let a delete orphan custodial stake or unclaimed USDC rewards.
    // On-chain (self-custody) stake is unaffected by deletion, so it isn't checked here.
    const staked = getStakePosition(authUserId).stakedAmount;
    const claimable = getClaimableRewards(authUserId);
    if (staked > 0 || claimable > 0) {
      return NextResponse.json(
        {
          error: 'stake_present',
          message:
            'You still have staked $ZERO or unclaimed rewards. Unstake (or migrate on-chain) and claim your rewards before deleting your account.',
          stakedAmount: staked,
          claimableRewards: claimable,
        },
        { status: 409 }
      );
    }

    // Remove the app profile row, then the Privy user so the linked wallet is freed.
    // (deleteProfile alone leaves the Privy account + its wallet link, which blocks the
    // user from re-linking that wallet to another login.)
    deleteProfile(authUserId);
    try {
      await deletePrivyUser(authUserId);
    } catch (e) {
      // Profile is already gone; log the Privy failure but don't fail the request.
      console.error('Privy user delete failed for', authUserId, e);
    }

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
