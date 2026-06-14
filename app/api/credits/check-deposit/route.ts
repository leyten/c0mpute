import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import {
  getCreditBalance,
  getOrCreateDepositWallet,
  getDepositWalletSecret,
  addCredits,
  getDepositProgress,
  setDepositProgress,
} from '@/lib/db';
import {
  CREDITS_PER_USD,
  getConfiguredDepositTokens,
  getTokenUsdPrice,
} from '@/lib/token-price';
import { isTreasuryConfigured, sweepDepositToken } from '@/lib/payout';
import { refundStraySol } from '@/lib/sol-refund';

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

    const { Connection, PublicKey } = require('@solana/web3.js');
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);
    const walletPubkey = new PublicKey(depositWallet);

    const tokens = getConfiguredDepositTokens();

    let totalCredited = 0;
    const notes: string[] = [];

    for (const token of tokens) {
      const mintPubkey = new PublicKey(token.mint);
      const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);

      let onChainBalance = 0;
      try {
        const info = await connection.getTokenAccountBalance(ata);
        onChainBalance = Number(info.value.uiAmount || 0);
      } catch {
        onChainBalance = 0; // ATA not created yet → no deposits of this token
      }

      const alreadyCredited = getDepositProgress(privyId, token.mint);
      const newTokens = onChainBalance - alreadyCredited;

      // Has every on-chain token been converted to credits? Only then is it
      // safe to sweep — otherwise we'd move uncredited funds and the user
      // would lose them.
      let fullyCredited = newTokens <= 0;

      if (newTokens > 0) {
        const priceUsd = await getTokenUsdPrice(token.mint);
        if (priceUsd === null) {
          notes.push(`${token.kind} price unavailable, try again shortly`);
        } else {
          const usdValue = newTokens * priceUsd;
          const credits = Math.floor(usdValue * CREDITS_PER_USD);
          if (credits > 0) {
            addCredits(privyId, credits, undefined, `${token.kind} deposit`);
            setDepositProgress(privyId, token.mint, onChainBalance);
            totalCredited += credits;
            fullyCredited = true;
          }
        }
      }

      // Sweep credited funds into the treasury so the payout float stays funded.
      // Treasury pays the fee + co-signs with the deposit wallet (no SOL needed
      // in the deposit wallet). On success the wallet is empty, so reset
      // progress to 0; on failure we leave progress as-is and retry next check.
      if (fullyCredited && onChainBalance > 0 && isTreasuryConfigured()) {
        try {
          const secret = getDepositWalletSecret(privyId);
          if (secret) {
            await sweepDepositToken(secret, token.mint);
            setDepositProgress(privyId, token.mint, 0);
          }
        } catch (sweepErr) {
          console.error('[Credits] Sweep to treasury failed:', sweepErr);
        }
      }
    }

    // This address only accepts USDC. If a user sent native SOL by mistake, send
    // it straight back to them and tell them on the page.
    let solNote = '';
    try {
      const stray = await refundStraySol(privyId, depositWallet);
      if (stray.kind === 'refunded') {
        solNote = `This address only accepts USDC. We detected ${stray.sol.toFixed(4)} SOL sent by mistake and returned it to your wallet.`;
      } else if (stray.kind === 'unknown_sender') {
        solNote = `This address only accepts USDC. We detected ${stray.sol.toFixed(4)} SOL here but couldn't auto-identify the sender to refund it — please reach out and we'll return it.`;
      }
    } catch (solErr) {
      console.error('[Credits] SOL refund check failed:', solErr);
    }

    const updated = getCreditBalance(privyId);

    if (totalCredited > 0) {
      return NextResponse.json({ credited: totalCredited, newBalance: updated.balance, ...(solNote ? { message: solNote } : {}) });
    }
    return NextResponse.json({
      credited: 0,
      balance: updated.balance,
      message: solNote || (notes.length ? notes.join('; ') : 'No new deposits found'),
    });
  } catch (err) {
    console.error('[Credits] Check deposit error:', err);
    return NextResponse.json({ error: 'Failed to check deposits' }, { status: 500 });
  }
}
