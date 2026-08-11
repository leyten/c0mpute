import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId, userOwnsSolanaWallet } from '@/lib/privy-server';
import { upsertProfile } from '@/lib/db';
import Database from 'better-sqlite3';
import path from 'path';

// Syncs the caller's connected Solana wallet to their profile so the server-side
// checks keyed on profiles.wallet_address (worker boost, daily allowance, stake
// reconcile) recognise stake done from a wallet linked on the staking page rather
// than at login. ONLY writes a wallet the user provably controls (linked in Privy),
// so nobody can claim someone else's stake for boost or free credits.
// Same read onchain-status uses, so both agree on which wallet is authoritative.
function profileWallet(privyId: string): string | null {
  try {
    const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
    const row = db.prepare('SELECT wallet_address FROM profiles WHERE privy_id = ?').get(privyId) as
      { wallet_address: string | null } | undefined;
    db.close();
    return row?.wallet_address?.trim() || null;
  } catch { return null; }
}

function hasStake(owner: string): boolean {
  try {
    const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
    const row = db.prepare('SELECT 1 AS x FROM onchain_stake_lots WHERE owner = ? LIMIT 1').get(owner) as
      { x: number } | undefined;
    db.close();
    return !!row;
  } catch { return false; }
}

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

  // Ownership is not enough to justify a REPLACEMENT. A user can own several
  // wallets — typically a funded Phantom plus an empty embedded one — and both
  // pass the check above. The staking page used to sync whichever Privy listed
  // first on every load, which after the compute.tech cutover was usually the
  // embedded one, so this endpoint cheerfully overwrote the address the stake
  // was actually made from and the server-side view went to zero.
  //
  // Fill an empty profile freely; never silently swap one wallet for another.
  // Fill an empty profile freely. Replace an existing one ONLY when the wallet
  // being replaced holds no stake — that keeps a funded, staked address safe
  // while still letting an account that was mis-linked heal itself, which the
  // ones mis-linked during the cutover need.
  const current = profileWallet(privyId);
  if (current && current !== wallet && hasStake(current)) {
    return NextResponse.json(
      { synced: false, wallet: current, reason: 'profile already linked to a wallet holding stake' },
      { status: 409 },
    );
  }

  upsertProfile({ privy_id: privyId, wallet_address: wallet });
  return NextResponse.json({ synced: true, wallet });
}
