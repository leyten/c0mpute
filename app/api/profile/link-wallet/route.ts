import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId, userOwnsSolanaWallet } from '@/lib/privy-server';
import { upsertProfile } from '@/lib/db';

// Syncs the caller's connected Solana wallet to their profile so the server-side
// checks keyed on profiles.wallet_address (worker boost, daily allowance, stake
// reconcile) recognise stake done from a wallet linked on the staking page rather
// than at login. ONLY writes a wallet the user provably controls (linked in Privy),
// so nobody can claim someone else's stake for boost or free credits.
export async function POST(req: NextRequest) {
  const privyId = await getAuthUserId(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { wallet } = await req.json().catch(() => ({} as { wallet?: string }));
  if (!wallet || typeof wallet !== 'string') {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  if (!(await userOwnsSolanaWallet(privyId, wallet))) {
    return NextResponse.json({ error: 'wallet not linked to this account', synced: false }, { status: 403 });
  }

  upsertProfile({ privy_id: privyId, wallet_address: wallet });
  return NextResponse.json({ synced: true, wallet });
}
