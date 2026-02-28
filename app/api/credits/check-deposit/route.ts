import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getCreditBalance, getOrCreateDepositWallet, addCredits } from '@/lib/db';

// Rate limit: 1 check per 10 seconds per user
const lastCheck: Map<string, number> = new Map();

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const privyId = await verifyPrivyToken(authHeader.slice(7));
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // DEV-ONLY: add credits directly
  if (body.action === 'dev_add' && process.env.NODE_ENV !== 'production') {
    const amount = Number(body.amount);
    if (!amount || amount <= 0 || amount > 10000) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    addCredits(privyId, amount, undefined, 'Dev credit');
    const balance = getCreditBalance(privyId);
    return NextResponse.json({ credited: amount, newBalance: balance.balance });
  }

  if (body.action !== 'check') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Rate limit
  const now = Date.now();
  const last = lastCheck.get(privyId) || 0;
  if (now - last < 10000) {
    return NextResponse.json({ error: 'Please wait 10 seconds between checks' }, { status: 429 });
  }
  lastCheck.set(privyId, now);

  try {
    const depositWallet = getOrCreateDepositWallet(privyId);
    const balance = getCreditBalance(privyId);

    // Check on-chain SPL token balance
    const { Connection, PublicKey } = require('@solana/web3.js');
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);
    const mintAddress = process.env.ZERO_TOKEN_MINT;

    if (!mintAddress) {
      // No mint configured yet — return current balance
      return NextResponse.json({ credited: 0, balance: balance.balance, message: 'Token mint not configured yet' });
    }

    // Find the associated token account
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    const walletPubkey = new PublicKey(depositWallet);
    const mintPubkey = new PublicKey(mintAddress);
    const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);

    let onChainBalance = 0;
    try {
      const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
      onChainBalance = Number(tokenAccountInfo.value.uiAmount || 0);
    } catch {
      // Token account doesn't exist yet (no deposits)
      onChainBalance = 0;
    }

    const newDeposit = onChainBalance - balance.totalDeposited;
    if (newDeposit > 0) {
      addCredits(privyId, newDeposit, undefined, 'Token deposit');
      const updated = getCreditBalance(privyId);
      return NextResponse.json({ credited: newDeposit, newBalance: updated.balance });
    }

    return NextResponse.json({ credited: 0, balance: balance.balance });
  } catch (err) {
    console.error('[Credits] Check deposit error:', err);
    return NextResponse.json({ error: 'Failed to check deposits' }, { status: 500 });
  }
}
