import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getWorkerStats, getWorkerJobHistory } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = getWorkerStats(privyId);
  const history = getWorkerJobHistory(privyId, 20);

  return NextResponse.json({
    stats: stats || { totalJobs: 0, totalTokens: 0, totalEarningPoints: 0, totalSolPaid: '0', lastActiveAt: null },
    recentJobs: history,
  });
}
