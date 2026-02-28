import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { setWorkerWallet } from '@/lib/db';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { walletAddress } = await req.json();
  if (!walletAddress || typeof walletAddress !== 'string' || !BASE58_REGEX.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid Solana wallet address' }, { status: 400 });
  }

  setWorkerWallet(privyId, walletAddress);
  return NextResponse.json({ success: true });
}
