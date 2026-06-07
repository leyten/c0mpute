import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  createRewardWithdrawal,
  markRewardPayoutCompleted,
  markRewardPayoutFailed,
} from '@/lib/staking';
import { isTreasuryConfigured, sendUsdc } from '@/lib/payout';
import { MIN_WITHDRAWAL_USD } from '@/lib/tokenomics';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const lastAttempt: Map<string, number> = new Map();

// POST /api/staking/claim-rewards { address, amount } — pay out accrued USDC
// staking rewards to a Solana address. Same atomic debit-before-send pattern as
// worker payouts: createRewardWithdrawal reserves the balance, sendUsdc moves
// it, failure restores it.
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
    return NextResponse.json({ error: `Minimum claim is $${MIN_WITHDRAWAL_USD.toFixed(2)}` }, { status: 400 });
  }
  if (!isTreasuryConfigured()) {
    return NextResponse.json({ error: 'Claims are temporarily unavailable' }, { status: 503 });
  }

  const now = Date.now();
  if (now - (lastAttempt.get(privyId) || 0) < 5000) {
    return NextResponse.json({ error: 'Please wait a few seconds between claims' }, { status: 429 });
  }
  lastAttempt.set(privyId, now);

  const result = createRewardWithdrawal(privyId, address, amt);
  if (!result.ok) {
    const map = {
      below_min: { error: `Minimum claim is $${MIN_WITHDRAWAL_USD.toFixed(2)}`, status: 400 },
      insufficient: { error: 'Insufficient reward balance', status: 400 },
      in_flight: { error: 'You already have a claim in progress', status: 409 },
    } as const;
    const r = map[result.reason];
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  try {
    const txHash = await sendUsdc(address, result.amount);
    markRewardPayoutCompleted(result.payoutId, txHash);
    return NextResponse.json({ success: true, amount: result.amount, txHash });
  } catch (err) {
    markRewardPayoutFailed(result.payoutId);
    console.error('[StakingRewards] Transfer failed:', err);
    return NextResponse.json({ error: 'Claim failed — your reward balance is unchanged' }, { status: 500 });
  }
}
