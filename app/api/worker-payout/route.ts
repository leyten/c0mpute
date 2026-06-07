import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  createWithdrawal,
  markPayoutCompleted,
  markPayoutFailed,
  setWorkerWallet,
  MIN_WITHDRAWAL_USD,
} from '@/lib/db';
import { isTreasuryConfigured, sendUsdc } from '@/lib/payout';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// One withdrawal attempt per 5s per user (the createWithdrawal in-flight guard
// is the real safety net; this just blunts accidental double-clicks/spam).
const lastAttempt: Map<string, number> = new Map();

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { address, amount } = await req.json();

  if (!address || typeof address !== 'string' || !BASE58_REGEX.test(address)) {
    return NextResponse.json({ error: 'Invalid Solana wallet address' }, { status: 400 });
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  if (amt < MIN_WITHDRAWAL_USD) {
    return NextResponse.json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD.toFixed(2)}` }, { status: 400 });
  }

  if (!isTreasuryConfigured()) {
    return NextResponse.json({ error: 'Withdrawals are temporarily unavailable' }, { status: 503 });
  }

  const now = Date.now();
  if (now - (lastAttempt.get(privyId) || 0) < 5000) {
    return NextResponse.json({ error: 'Please wait a few seconds between withdrawals' }, { status: 429 });
  }
  lastAttempt.set(privyId, now);

  const result = createWithdrawal(privyId, address, amt);
  if (!result.ok) {
    const map = {
      below_min: { error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD.toFixed(2)}`, status: 400 },
      insufficient: { error: 'Insufficient balance', status: 400 },
      in_flight: { error: 'You already have a withdrawal in progress', status: 409 },
    } as const;
    const r = map[result.reason];
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  // Remember the address so it prefills next time.
  setWorkerWallet(privyId, address);

  try {
    const txHash = await sendUsdc(address, result.amount);
    markPayoutCompleted(result.payoutId, txHash);
    return NextResponse.json({ success: true, amount: result.amount, txHash });
  } catch (err) {
    markPayoutFailed(result.payoutId);
    console.error('[Payout] Transfer failed:', err);
    return NextResponse.json({ error: 'Transfer failed — your balance is unchanged' }, { status: 500 });
  }
}
