import { NextRequest, NextResponse } from 'next/server';
import { getProfileByPrivyId, upsertProfile } from '@/lib/db';
import { getAuthUserId } from '@/lib/privy-server';
import { bindReferral } from '@/lib/referrals';

export async function POST(request: NextRequest) {
  try {
    // Verify auth — only create/update own profile
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { wallet, twitter, refCode } = body;

    // Referral binding is signup-only: the profile must not exist yet.
    const isNewAccount = !getProfileByPrivyId(authUserId);

    const profile = upsertProfile({
      privy_id: authUserId,
      wallet_address: wallet || null,
      x_username: twitter?.username || null,
      x_id: twitter?.id || null,
    });

    if (isNewAccount && typeof refCode === 'string' && refCode) {
      bindReferral(authUserId, refCode);
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
