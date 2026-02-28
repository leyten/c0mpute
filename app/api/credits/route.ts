import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getCreditBalance, getOrCreateDepositWallet, getCreditTransactions } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const balance = getCreditBalance(privyId);
  const depositWallet = getOrCreateDepositWallet(privyId);
  const recentTransactions = getCreditTransactions(privyId);

  return NextResponse.json({
    balance: balance.balance,
    totalDeposited: balance.totalDeposited,
    totalSpent: balance.totalSpent,
    depositWallet,
    recentTransactions,
  });
}
