import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getUserUsage } from '@/lib/db';

async function getPrivyUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyPrivyToken(authHeader.slice(7));
}

// GET — usage summary (requests + tokens, overall and per model) for the user.
export async function GET(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getUserUsage(privyId));
}
