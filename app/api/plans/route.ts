// Plan checkout.
//
// Buying a plan is a credit spend, so there is no payment provider here and no
// webhook to reconcile: the balance is already the user's, and the whole
// transaction is lib/plan-state.ts's buyPlan. A card checkout added later
// becomes a different way of TOPPING UP and lands on this same function.
//
// One POST with an action, mirroring app/api/credits/check-deposit/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { buyPlan, setAutoRenew, resolvePlanState } from '@/lib/plan-state';
import { isPlanId } from '@/lib/plans';

// Buying moves real money, and the client sends one request per click. A short
// per-user window is enough to stop a double-submit becoming two periods.
const lastAction = new Map<string, number>();
const MIN_INTERVAL_MS = 3_000;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; plan?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const now = Date.now();
  const previous = lastAction.get(privyId) ?? 0;
  if (now - previous < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: 'Slow down a moment and try again.' }, { status: 429 });
  }
  lastAction.set(privyId, now);

  if (body.action === 'auto_renew') {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    }
    const state = setAutoRenew(privyId, body.enabled);
    if (!state) return NextResponse.json({ error: 'No active plan to change.' }, { status: 400 });
    return NextResponse.json({ plan: state });
  }

  if (body.action === 'buy') {
    if (!isPlanId(body.plan)) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
    }
    const result = buyPlan(privyId, body.plan);
    if (!result.ok) {
      // 402 for "you cannot afford this", which the client turns into a
      // top-up prompt rather than a generic failure.
      const status = result.creditsNeeded === undefined ? 400 : 402;
      return NextResponse.json({ error: result.error, creditsNeeded: result.creditsNeeded }, { status });
    }
    return NextResponse.json({ action: result.action, creditsSpent: result.creditsSpent, plan: result.state });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ plan: resolvePlanState(privyId) });
}
