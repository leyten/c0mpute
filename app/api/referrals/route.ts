import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/privy-server';
import { getReferralStats } from '@/lib/referrals';

// Your own referral code/link + referred count. Auth required; you can only
// ever see your own stats.
export async function GET(request: NextRequest) {
  try {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json(getReferralStats(authUserId));
  } catch (error) {
    console.error('Referral stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
