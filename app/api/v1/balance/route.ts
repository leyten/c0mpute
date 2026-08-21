import { NextRequest, NextResponse } from 'next/server';
import { resolveApiKeyFull, getCreditBalance } from '@/lib/db';
import { getStakerAllowanceStatus } from '@/lib/staker-allowance';
import { CREDITS_PER_USD } from '@/lib/token-price';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Four decimals, not two: a credit is a tenth of a cent, so rounding to cents
// reported every balance under 10 credits as $0.00 — including a balance that
// still buys several messages.
const usd = (credits: number) => Number((credits / CREDITS_PER_USD).toFixed(4));

// GET /api/v1/balance — spendable balance for the calling API key.
// Lets integrators (and their users) check how much inference is left before/
// after requests. Surfaces the staking allowance (free daily credits) separately
// from deposited USDC, and `spendable_*` = what THIS key can actually spend:
//   - free_only ("resale") key: the staking allowance remaining today only.
//   - normal key: staking allowance remaining + deposited credits.
// Same Bearer auth as the other v1 endpoints.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const resolved = auth.startsWith('Bearer ') ? resolveApiKeyFull(auth.slice(7).trim()) : null;
  if (!resolved) {
    return NextResponse.json({ error: { message: 'Invalid API key.', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } }, { status: 401 });
  }

  const bal = getCreditBalance(resolved.privyId);
  const allowance = getStakerAllowanceStatus(resolved.privyId);
  const spendableCredits = resolved.freeOnly ? allowance.remaining : allowance.remaining + bal.balance;

  return NextResponse.json({
    object: 'balance',
    credits: bal.balance,
    usd: usd(bal.balance),
    total_deposited: bal.totalDeposited,
    total_spent: bal.totalSpent,
    free_only: resolved.freeOnly,
    staking_allowance: {
      enabled: allowance.enabled,
      daily: allowance.dailyAllowance,
      used_today: allowance.usedToday,
      remaining: allowance.remaining,
      usd_remaining: usd(allowance.remaining),
    },
    spendable_credits: spendableCredits,
    spendable_usd: usd(spendableCredits),
  });
}
