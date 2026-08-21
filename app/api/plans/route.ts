// Plan checkout.
//
// There is no payment provider here and no webhook to reconcile. Buying a plan
// is a USDC deposit to the address the account already has, so all this route
// does is quote the amount and open the intent that tells the deposit checker
// what the next payment is for. The money itself is settled in
// app/api/credits/check-deposit/route.ts, on the rail top-ups already use.
//
// One POST with an action, mirroring that route.

import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { openPlanIntent, closePlanIntent, getPlanIntent, resolvePlanState } from '@/lib/plan-state';
import { isPlanId } from '@/lib/plans';
import { getOrCreateDepositWallet } from '@/lib/db';

// The client sends one request per click. A short per-user window is enough to
// stop a double-submit opening two intents in a row.
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

  let body: { action?: string; plan?: string; months?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body.action === 'buy') {
    // Only buying is throttled. Cancelling has to stay available the instant
    // after a misclick, and it can only ever close something.
    const now = Date.now();
    const previous = lastAction.get(privyId) ?? 0;
    if (now - previous < MIN_INTERVAL_MS) {
      return NextResponse.json({ error: 'Slow down a moment and try again.' }, { status: 429 });
    }
    lastAction.set(privyId, now);

    if (!isPlanId(body.plan)) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
    }
    const result = openPlanIntent(privyId, body.plan, Number(body.months ?? 1));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    // The address comes back with the quote so the page can show both at once,
    // rather than the amount arriving before the place to send it.
    // releasedCredits is money the replaced purchase was holding, handed back —
    // the page has to say so, or credits appear from nowhere.
    return NextResponse.json({
      intent: result.intent,
      releasedCredits: result.releasedCredits,
      depositWallet: getOrCreateDepositWallet(privyId),
    });
  }

  if (body.action === 'cancel') {
    const { releasedCredits } = closePlanIntent(privyId);
    return NextResponse.json({ intent: null, releasedCredits });
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
  return NextResponse.json({ plan: resolvePlanState(privyId), intent: getPlanIntent(privyId) });
}
