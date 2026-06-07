import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getStakingWalletSecret } from '@/lib/staking';
import { isTreasuryConfigured, getTokenUiBalance, loadTreasuryKeypair } from '@/lib/payout';
import { getZeroMint, isZeroLaunched } from '@/lib/tokenomics';
import { migrateLotsToOnchain, fundStakerRewardVault, rewardVault } from '@/lib/keeper/onchain-rewards';
import Database from 'better-sqlite3';
import path from 'path';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
} from '@solana/spl-token';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const inflight = new Set<string>();

function stakingProgramId(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || 'BU3JcQJBsFZwNV2DHSPeu3hKLsfarLS2AU5RuVhJrYKM');
}
function linkedWalletFor(privyId: string): string | null {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
  const row = db.prepare('SELECT wallet_address FROM profiles WHERE privy_id = ?').get(privyId) as { wallet_address: string | null } | undefined;
  db.close();
  return row?.wallet_address?.trim() || null;
}
function custodialPubkey(privyId: string): string | null {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
  const row = db.prepare('SELECT public_key FROM staking_wallets WHERE privy_id = ?').get(privyId) as { public_key: string } | undefined;
  db.close();
  return row?.public_key ?? null;
}
function readClaimableUsd(privyId: string): number {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
  const row = db.prepare('SELECT claimable_usd FROM staking_rewards WHERE privy_id = ?').get(privyId) as { claimable_usd: number } | undefined;
  db.close();
  return row?.claimable_usd ?? 0;
}
// Zero the custodial claimable AFTER the on-chain reward vault is funded + verified.
function clearClaimableUsd(privyId: string, amount: number): void {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
  db.prepare('UPDATE staking_rewards SET claimable_usd = MAX(0, claimable_usd - ?), updated_at = ? WHERE privy_id = ?')
    .run(amount, new Date().toISOString(), privyId);
  db.close();
}

// POST /api/staking/migrate — move the caller's custodial staked ZERO into their own
// on-chain self-custody stake vault (beneficiary = their linked wallet). One-click,
// user-initiated. Verifies on-chain after the move and preserves 24h maturity.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const privyId = await verifyPrivyToken(auth.slice(7));
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isZeroLaunched()) return NextResponse.json({ error: 'Staking is not live yet' }, { status: 503 });
  if (!isTreasuryConfigured()) return NextResponse.json({ error: 'Migration temporarily unavailable' }, { status: 503 });

  const linked = linkedWalletFor(privyId);
  if (!linked || !BASE58.test(linked)) {
    return NextResponse.json({ error: 'Connect a wallet first to receive your self-custody stake', code: 'NO_WALLET' }, { status: 400 });
  }
  const custodialPk = custodialPubkey(privyId);
  const secret = getStakingWalletSecret(privyId);
  if (!custodialPk || !secret) return NextResponse.json({ error: 'No custodial stake found', code: 'NOTHING' }, { status: 400 });

  if (inflight.has(privyId)) return NextResponse.json({ error: 'Migration already in progress' }, { status: 429 });
  inflight.add(privyId);
  try {
    const mint = new PublicKey(getZeroMint()!);
    const owner = new PublicKey(linked);
    const custodial = Keypair.fromSecretKey(secret);
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const conn = new Connection(rpc, 'confirmed');

    const custodialAta = getAssociatedTokenAddressSync(mint, custodial.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const rawBal = async (a: PublicKey): Promise<bigint> => { try { return BigInt((await getAccount(conn, a, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount); } catch { return BigInt(0); } };
    const treasury = loadTreasuryKeypair();

    // ── 1. migrate staked ZERO (if any still custodial) ──
    const amount = await rawBal(custodialAta);
    let migratedZero = 0;
    if (amount > BigInt(0)) {
      const [stakeAuth] = PublicKey.findProgramAddressSync([Buffer.from('stake'), owner.toBuffer()], stakingProgramId());
      const vault = getAssociatedTokenAddressSync(mint, stakeAuth, true, TOKEN_2022_PROGRAM_ID);
      const before = await rawBal(vault);
      const amtBuf = Buffer.alloc(8); amtBuf.writeBigUInt64LE(amount);
      const stakeIx = new TransactionInstruction({
        programId: stakingProgramId(),
        keys: [
          { pubkey: owner, isSigner: false, isWritable: false },
          { pubkey: stakeAuth, isSigner: false, isWritable: false },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: custodial.publicKey, isSigner: true, isWritable: false },
          { pubkey: custodialAta, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([Buffer.from([0]), amtBuf]),
      });
      const ensureVault = createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, vault, stakeAuth, mint, TOKEN_2022_PROGRAM_ID);
      const tx = new Transaction().add(ensureVault, stakeIx);
      tx.feePayer = treasury.publicKey;
      await sendAndConfirmTransaction(conn, tx, [treasury, custodial]);
      const after = await rawBal(vault), left = await rawBal(custodialAta);
      if (after !== before + amount || left !== BigInt(0)) {
        return NextResponse.json({ error: 'Stake migration verification failed — funds are safe, support notified' }, { status: 500 });
      }
      migrateLotsToOnchain(privyId, linked); // preserve 24h maturity
      migratedZero = Number(amount) / 1e6;
    }

    // ── 2. migrate pending USDC rewards into the on-chain reward vault ──
    let migratedRewards = 0;
    const claimable = readClaimableUsd(privyId);
    if (claimable > 0.000001) {
      // Idempotent: only top up the SHORTFALL between what's owed and what's already in
      // the reward vault, so a retry (or a prior lag-induced false-fail) can't double-fund.
      const usdcMint = process.env.NEXT_PUBLIC_ONCHAIN_USDC_MINT || process.env.ONCHAIN_USDC_MINT;
      let inVault = 0;
      if (usdcMint) {
        const rv = rewardVault(owner, new PublicKey(usdcMint));
        try { inVault = Number((await getAccount(conn, rv, 'confirmed', TOKEN_PROGRAM_ID)).amount) / 1e6; } catch {}
      }
      const needed = claimable - inVault;
      if (needed > 0.000001) {
        // fundStakerRewardVault verifies (with retry) the vault increased by `needed`.
        await fundStakerRewardVault(conn, treasury, owner, needed);
      }
      clearClaimableUsd(privyId, claimable); // clear ledger only after vault holds >= owed
      migratedRewards = claimable;
    }

    if (migratedZero === 0 && migratedRewards === 0) {
      return NextResponse.json({ migrated: 0, message: 'Nothing to migrate' });
    }
    return NextResponse.json({ migrated: migratedZero, migratedRewards, owner: linked });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Migration failed' }, { status: 500 });
  } finally {
    inflight.delete(privyId);
  }
}
