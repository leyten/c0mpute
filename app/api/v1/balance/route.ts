import { NextRequest, NextResponse } from 'next/server';
import { resolveApiKey, getCreditBalance } from '@/lib/db';
import { CREDITS_PER_USD } from '@/lib/token-price';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/balance — credit balance for the calling API key.
// Lets integrators (and their users) check how much credit is left on a key
// before/after requests. Same Bearer auth as the other v1 endpoints.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const privyId = auth.startsWith('Bearer ') ? resolveApiKey(auth.slice(7).trim()) : null;
  if (!privyId) {
    return NextResponse.json({ error: { message: 'Invalid API key.', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } }, { status: 401 });
  }

  const bal = getCreditBalance(privyId);
  return NextResponse.json({
    object: 'balance',
    credits: bal.balance,
    usd: Number((bal.balance / CREDITS_PER_USD).toFixed(2)),
    total_deposited: bal.totalDeposited,
    total_spent: bal.totalSpent,
  });
}
