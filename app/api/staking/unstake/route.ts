import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  getOrCreateStakingWallet,
  getStakingWalletSecret,
  syncStake,
} from '@/lib/staking';
import { getTokenUiBalance, sendTokenFromWallet, isTreasuryConfigured } from '@/lib/payout';
import { getZeroMint, isZeroLaunched, ZERO_DECIMALS, MIN_UNSTAKE_ZERO } from '@/lib/tokenomics';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const lastAttempt: Map<string, number> = new Map();

// POST /api/staking/unstake { address, amount } — send `amount` ZERO from the
// user's custodial staking wallet back to a Solana address they control.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isZeroLaunched()) {
    return NextResponse.json({ error: 'Staking is not live yet' }, { status: 503 });
  }
  if (!isTreasuryConfigured()) {
    return NextResponse.json({ error: 'Unstaking is temporarily unavailable' }, { status: 503 });
  }

  const { address, amount } = await req.json();
  if (!address || typeof address !== 'string' || !BASE58_REGEX.test(address)) {
    return NextResponse.json({ error: 'Invalid Solana wallet address' }, { status: 400 });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const now = Date.now();
  if (now - (lastAttempt.get(privyId) || 0) < 5000) {
    return NextResponse.json({ error: 'Please wait a few seconds between actions' }, { status: 429 });
  }
  lastAttempt.set(privyId, now);

  const mint = getZeroMint()!;
  const stakingAddress = getOrCreateStakingWallet(privyId);

  // Chain is the source of truth — never let a user unstake more than is there.
  const onChain = await getTokenUiBalance(stakingAddress, mint);
  if (amt > onChain + 1e-9) {
    syncStake(privyId, onChain);
    return NextResponse.json({ error: 'Amount exceeds your staked balance' }, { status: 400 });
  }

  // Enforce a minimum on PARTIAL unstakes only. Emptying the whole balance is
  // always allowed (so a small staker is never trapped); the floor just blocks
  // dust-spam unstakes that drain treasury SOL on per-destination ATA rent.
  const isFullWithdrawal = amt >= onChain - 1e-9;
  if (!isFullWithdrawal && amt < MIN_UNSTAKE_ZERO) {
    return NextResponse.json(
      { error: `Minimum partial unstake is ${MIN_UNSTAKE_ZERO} ZERO. Withdraw your full balance to take out less.` },
      { status: 400 },
    );
  }

  const secret = getStakingWalletSecret(privyId);
  if (!secret) {
    return NextResponse.json({ error: 'No staking wallet found' }, { status: 400 });
  }

  try {
    const txHash = await sendTokenFromWallet(secret, mint, address, amt, ZERO_DECIMALS);
    const remaining = await getTokenUiBalance(stakingAddress, mint);
    const position = syncStake(privyId, remaining);
    return NextResponse.json({ success: true, txHash, stakedAmount: position.stakedAmount });
  } catch (err) {
    console.error('[Unstake] Transfer failed:', err);
    return NextResponse.json({ error: 'Unstake failed — your stake is unchanged' }, { status: 500 });
  }
}
