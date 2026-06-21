import { NextRequest, NextResponse } from 'next/server';
import { getProfileByPrivyId, upsertProfile, recordNewAccountForIp } from '@/lib/db';
import { getAuthUserId, userOwnsSolanaWallet } from '@/lib/privy-server';
import { bindReferral } from '@/lib/referrals';
import { hashIp } from '@/lib/anon-auth';
import { ACCOUNT_CREATE_IP_DAILY_CAP } from '@/lib/tokenomics';

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

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

    // Close the drain: NEW accounts require a real X login. Wallet-only signups are
    // disabled — bots were mass-minting wallet accounts (many per second). Existing
    // accounts are unaffected and can still link a wallet.
    if (isNewAccount && !twitter?.id) {
      return NextResponse.json(
        { error: 'Sign in with X to create an account.' },
        { status: 403 }
      );
    }

    // Per-IP cap on NEW account creation — secondary defense for X signups.
    if (isNewAccount && !recordNewAccountForIp(hashIp(clientIp(request)), ACCOUNT_CREATE_IP_DAILY_CAP)) {
      return NextResponse.json(
        { error: 'Too many accounts created from your network today. Please try again later.' },
        { status: 429 }
      );
    }

    // SECURITY: never persist identity fields straight from the request body.
    // A wallet is only written if the caller PROVABLY controls it (linked in
    // Privy) — the same gate /api/profile/link-wallet already uses. Otherwise any
    // logged-in user could set wallet_address to a large staker's wallet and
    // inherit its stake-derived perks (worker revenue boost + daily free-credit
    // allowance). X identity is written only on first creation, so an existing
    // account can't be re-pointed at someone else's handle by a later callback.
    let verifiedWallet: string | null = null;
    if (typeof wallet === 'string' && wallet && (await userOwnsSolanaWallet(authUserId, wallet))) {
      verifiedWallet = wallet;
    }

    const profile = upsertProfile({
      privy_id: authUserId,
      ...(verifiedWallet ? { wallet_address: verifiedWallet } : {}),
      ...(isNewAccount ? { x_username: twitter?.username || null, x_id: twitter?.id || null } : {}),
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
