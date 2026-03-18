import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  getPendingBalance,
  getTodayEarnings,
  getTotalEarnings,
  getWorkerWallet,
  getRecentEarnings,
  getPayoutHistory,
  requestPayout,
  getProfileByPrivyId,
} from '@/lib/db';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: determine tier from user profile; default to 'free' for now
  const dailyCap = 5;
  const tier = 'free';

  return NextResponse.json({
    pendingBalance: getPendingBalance(privyId),
    todayEarnings: getTodayEarnings(privyId),
    totalEarnings: getTotalEarnings(privyId),
    dailyCap,
    tier,
    wallet: getWorkerWallet(privyId),
    recentEarnings: getRecentEarnings(privyId, 20),
    payoutHistory: getPayoutHistory(privyId, 10),
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  if (body.action !== 'claim') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const profile = getProfileByPrivyId(privyId) as any;
  const wallet = profile?.wallet_address;
  if (!wallet) {
    return NextResponse.json({ error: 'Connect a wallet in Settings first' }, { status: 400 });
  }

  const result = requestPayout(privyId);
  if (!result) {
    return NextResponse.json({ error: 'Minimum payout is $1.00' }, { status: 400 });
  }

  return NextResponse.json(result);
}
