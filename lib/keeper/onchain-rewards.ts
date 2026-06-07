// Keeper v2 — pay on-chain stakers by funding their personal reward vaults.
//
// During the custodial->self-custody transition the keeper pays BOTH populations:
//   - custodial stakers  -> creditReward() DB claimable (existing path, lib/staking.ts)
//   - on-chain stakers    -> fund their reward vault via the rewards program (here)
// Maturity (24h per lot) is preserved across migration: migrated lots keep their
// original `since`, mirrored into `onchain_stake_lots`. Distribution is pro-rata over
// the COMBINED mature stake so neither side is over/under-paid.
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
} from '@solana/spl-token';
import Database from 'better-sqlite3';
import path from 'path';
import { STAKE_MIN_AGE_MS } from '../tokenomics';
import { loadTreasuryKeypair } from '../payout';

const USDC_DECIMALS = 6;

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}
const u64le = (n: bigint): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };

function rewardsProgramId(): PublicKey {
  return new PublicKey(process.env.REWARDS_PROGRAM_ID || process.env.NEXT_PUBLIC_REWARDS_PROGRAM_ID
    || 'EfW8KpmWGwBcDVcq4Qj6F3EYeMMGEcrS4BnKnDyQqvqW');
}
function usdcMint(): PublicKey {
  const m = process.env.ONCHAIN_USDC_MINT || process.env.NEXT_PUBLIC_ONCHAIN_USDC_MINT;
  if (!m) throw new Error('[keeper v2] USDC mint not configured');
  return new PublicKey(m);
}
function keeperKeypair(): Keypair {
  return loadTreasuryKeypair(); // proven loader (handles base58 + JSON array)
}

export function rewardAuthority(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('reward'), owner.toBuffer()], rewardsProgramId())[0];
}
export function rewardVault(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, rewardAuthority(owner), true, TOKEN_PROGRAM_ID);
}

// ── on-chain staker lots (mirror of staking_lots, keyed by wallet owner) ──
export function initOnchainStakeTable(): void {
  getDb().exec(`CREATE TABLE IF NOT EXISTS onchain_stake_lots (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, amount REAL NOT NULL, since TEXT NOT NULL)`);
}

/** Mature (>=24h) on-chain stake per owner. */
export function getEligibleOnchainStakers(): { owner: string; mature: number }[] {
  initOnchainStakeTable();
  const rows = getDb().prepare('SELECT owner, amount, since FROM onchain_stake_lots').all() as
    { owner: string; amount: number; since: string }[];
  const byOwner = new Map<string, number>();
  for (const r of rows) {
    if (Date.now() - new Date(r.since).getTime() >= STAKE_MIN_AGE_MS) {
      byOwner.set(r.owner, (byOwner.get(r.owner) ?? 0) + r.amount);
    }
  }
  return [...byOwner.entries()].filter(([, m]) => m > 0).map(([owner, mature]) => ({ owner, mature }));
}

/** Copy a migrated user's custodial lots into onchain lots, preserving `since` (maturity). */
export function migrateLotsToOnchain(privyId: string, owner: string): void {
  initOnchainStakeTable();
  const db = getDb();
  const crypto = require('crypto');
  const lots = db.prepare('SELECT amount, since FROM staking_lots WHERE privy_id = ?').all(privyId) as
    { amount: number; since: string }[];
  const txn = db.transaction(() => {
    for (const l of lots) {
      db.prepare('INSERT INTO onchain_stake_lots (id, owner, amount, since) VALUES (?, ?, ?, ?)')
        .run(crypto.randomUUID(), owner, l.amount, l.since);
    }
    db.prepare('DELETE FROM staking_lots WHERE privy_id = ?').run(privyId);
  });
  txn();
}

/**
 * Reconcile an on-chain staker's lots to their live vault balance (same LIFO rule as
 * the custodial syncStake): an increase opens a new lot dated now (must age 24h), a
 * decrease (unstake) burns youngest lots first so aged stake is preserved. Prevents
 * paying rewards on stake that's been unstaked on-chain.
 */
export function syncOnchainStake(owner: string, onChainAmount: number): void {
  initOnchainStakeTable();
  const db = getDb();
  const crypto = require('crypto');
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const lots = db.prepare('SELECT id, amount, since FROM onchain_stake_lots WHERE owner = ?').all(owner) as
      { id: string; amount: number; since: string }[];
    const recorded = lots.reduce((s, l) => s + l.amount, 0);
    const delta = onChainAmount - recorded;
    if (onChainAmount <= 1e-9) {
      db.prepare('DELETE FROM onchain_stake_lots WHERE owner = ?').run(owner);
    } else if (delta > 1e-9) {
      db.prepare('INSERT INTO onchain_stake_lots (id, owner, amount, since) VALUES (?, ?, ?, ?)')
        .run(crypto.randomUUID(), owner, delta, now);
    } else if (delta < -1e-9) {
      let remaining = -delta;
      const youngest = [...lots].sort((a, b) => new Date(b.since).getTime() - new Date(a.since).getTime());
      for (const lot of youngest) {
        if (remaining <= 1e-9) break;
        if (lot.amount <= remaining + 1e-9) { db.prepare('DELETE FROM onchain_stake_lots WHERE id = ?').run(lot.id); remaining -= lot.amount; }
        else { db.prepare('UPDATE onchain_stake_lots SET amount = ? WHERE id = ?').run(lot.amount - remaining, lot.id); remaining = 0; }
      }
    }
  });
  txn();
}

/** Re-read every tracked on-chain staker's live stake balance and reconcile lots. */
export async function resyncOnchainStakesFromChain(): Promise<number> {
  initOnchainStakeTable();
  const owners = (getDb().prepare('SELECT DISTINCT owner FROM onchain_stake_lots').all() as { owner: string }[]).map((r) => r.owner);
  if (owners.length === 0) return 0;
  const { readStaked } = await import('../onchain-staking');
  for (const owner of owners) {
    try { syncOnchainStake(owner, await readStaked(new PublicKey(owner))); } catch (e) {
      console.error(`[Keeper v2] resync failed for ${owner}:`, e instanceof Error ? e.message : e);
    }
  }
  return owners.length;
}

// ── fund one on-chain staker's reward vault (the new payout primitive) ──
export async function fundStakerRewardVault(
  conn: Connection, keeper: Keypair, owner: PublicKey, amountUi: number,
): Promise<{ sig: string; amountRaw: bigint }> {
  const mint = usdcMint();
  const amountRaw = BigInt(Math.floor(amountUi * 10 ** USDC_DECIMALS));
  if (amountRaw <= BigInt(0)) throw new Error('amount must be > 0');
  const vault = rewardVault(owner, mint);
  const keeperAta = getAssociatedTokenAddressSync(mint, keeper.publicKey, false, TOKEN_PROGRAM_ID);

  const before = await safeBal(conn, vault);
  const fundIx = new TransactionInstruction({
    programId: rewardsProgramId(),
    keys: [
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: rewardAuthority(owner), isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: keeper.publicKey, isSigner: true, isWritable: false },
      { pubkey: keeperAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0]), u64le(amountRaw)]),
  });
  const ensureVault = createAssociatedTokenAccountIdempotentInstruction(
    keeper.publicKey, vault, rewardAuthority(owner), mint, TOKEN_PROGRAM_ID);
  const tx = new Transaction().add(ensureVault, fundIx);
  tx.feePayer = keeper.publicKey;
  const sig = await sendAndConfirmTransaction(conn, tx, [keeper]);

  // Verify with retry: a getAccount right after sendAndConfirmTransaction can read a
  // stale (pre-tx) balance on a lagging RPC node. Poll until it reflects the deposit
  // before concluding failure — avoids false "mismatch" that prompts a double-fund.
  const want = before + amountRaw;
  let after = BigInt(0);
  for (let i = 0; i < 8; i++) {
    after = await safeBal(conn, vault);
    if (after >= want) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (after < want) throw new Error(`reward vault mismatch for ${owner}: ${after} < ${want}`);
  return { sig, amountRaw };
}

async function safeBal(conn: Connection, ata: PublicKey): Promise<bigint> {
  try { return BigInt((await getAccount(conn, ata, 'confirmed', TOKEN_PROGRAM_ID)).amount); } catch { return BigInt(0); }
}

/**
 * Pay on-chain stakers their share of `totalUsdForOnchain` pro-rata by mature stake.
 * Returns total actually funded. One vault at a time, verified per-fund; a failure on
 * one staker doesn't abort the rest (logged, skipped).
 */
export async function distributeOnchainRewards(totalUsdForOnchain: number): Promise<number> {
  if (totalUsdForOnchain <= 0) return 0;
  const stakers = getEligibleOnchainStakers();
  const totalMature = stakers.reduce((s, x) => s + x.mature, 0);
  if (totalMature <= 0) return 0;

  const conn = new Connection(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_ONCHAIN_RPC || 'https://api.devnet.solana.com', 'confirmed');
  const keeper = keeperKeypair();
  let funded = 0;
  for (const s of stakers) {
    const share = Math.floor((s.mature / totalMature) * totalUsdForOnchain * 1e6) / 1e6;
    if (share <= 0) continue;
    try {
      await fundStakerRewardVault(conn, keeper, new PublicKey(s.owner), share);
      funded += share;
      console.log(`[Keeper v2] funded ${s.owner} reward vault $${share.toFixed(6)}`);
    } catch (e) {
      console.error(`[Keeper v2] fund failed for ${s.owner}:`, e instanceof Error ? e.message : e);
    }
  }
  return funded;
}
