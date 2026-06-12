import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  setAutocompound, isAutocompoundEnabled, getAutocompoundHistory,
} from '@/lib/keeper/onchain-rewards';
import Database from 'better-sqlite3';
import path from 'path';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function linkedWalletFor(privyId: string): string | null {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
  const row = db.prepare('SELECT wallet_address FROM profiles WHERE privy_id = ?').get(privyId) as { wallet_address: string | null } | undefined;
  db.close();
  return row?.wallet_address?.trim() || null;
}

async function authedWallet(req: NextRequest): Promise<string | NextResponse> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const privyId = await verifyPrivyToken(auth.slice(7));
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const linked = linkedWalletFor(privyId);
  if (!linked || !BASE58.test(linked)) {
    return NextResponse.json({ error: 'Connect a wallet first', code: 'NO_WALLET' }, { status: 400 });
  }
  return linked;
}

// GET /api/staking/autocompound — current toggle state + compound history
export async function GET(req: NextRequest) {
  const wallet = await authedWallet(req);
  if (wallet instanceof NextResponse) return wallet;
  return NextResponse.json({
    enabled: isAutocompoundEnabled(wallet),
    history: getAutocompoundHistory(wallet),
  });
}

// POST /api/staking/autocompound { enabled: boolean } — flip the toggle
export async function POST(req: NextRequest) {
  const wallet = await authedWallet(req);
  if (wallet instanceof NextResponse) return wallet;
  let enabled: unknown;
  try { ({ enabled } = await req.json()); } catch { /* fall through */ }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }
  setAutocompound(wallet, enabled);
  return NextResponse.json({ enabled });
}
