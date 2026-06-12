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
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync,
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
/**
 * Seed a single stake lot for an owner that has NONE yet, dated `sinceIso` — the
 * REAL on-chain stake time, not "now". Returns true if it seeded, false if the
 * owner already had lots (caller then falls back to the normal reconcile). Used
 * by the status endpoint so a direct on-chain staker is tracked from their true
 * stake time and their 24h clock isn't reset to when they first open the page.
 */
export function seedOnchainLotIfEmpty(owner: string, amount: number, sinceIso: string): boolean {
  if (amount <= 0) return false;
  initOnchainStakeTable();
  const db = getDb();
  const crypto = require('crypto');
  const txn = db.transaction(() => {
    const n = (db.prepare('SELECT COUNT(*) AS c FROM onchain_stake_lots WHERE owner = ?').get(owner) as { c: number }).c;
    if (n > 0) return false;
    db.prepare('INSERT INTO onchain_stake_lots (id, owner, amount, since) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), owner, amount, sinceIso);
    return true;
  });
  return txn() as boolean;
}

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

// ── auto-compound: opted-in stakers get their USDC share swapped to ZERO and
//    staked back into their own vault (deposit-only; only the owner can unstake) ──

const ZERO_DECIMALS = 6;

export function initAutocompoundTables(): void {
  getDb().exec(`CREATE TABLE IF NOT EXISTS autocompound_optin (
    owner TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`);
  getDb().exec(`CREATE TABLE IF NOT EXISTS autocompound_events (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, usd REAL NOT NULL, zero_ui REAL NOT NULL,
    swap_sig TEXT, deposit_sig TEXT, created_at TEXT NOT NULL)`);
  // deposits that failed after the swap already happened — retried next cycle
  getDb().exec(`CREATE TABLE IF NOT EXISTS autocompound_pending (
    owner TEXT PRIMARY KEY, zero_raw TEXT NOT NULL, usd REAL NOT NULL, swap_sig TEXT, created_at TEXT NOT NULL)`);
}

export function setAutocompound(owner: string, enabled: boolean): void {
  initAutocompoundTables();
  getDb().prepare(`INSERT INTO autocompound_optin (owner, enabled, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(owner) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`)
    .run(owner, enabled ? 1 : 0, new Date().toISOString());
}

export function isAutocompoundEnabled(owner: string): boolean {
  initAutocompoundTables();
  const row = getDb().prepare('SELECT enabled FROM autocompound_optin WHERE owner = ?').get(owner) as { enabled: number } | undefined;
  return row?.enabled === 1;
}

function getAutocompoundOptins(): Set<string> {
  initAutocompoundTables();
  const rows = getDb().prepare('SELECT owner FROM autocompound_optin WHERE enabled = 1').all() as { owner: string }[];
  return new Set(rows.map((r) => r.owner));
}

export function getAutocompoundHistory(owner: string, limit = 30): { usd: number; zeroUi: number; swapSig: string | null; createdAt: string }[] {
  initAutocompoundTables();
  const rows = getDb().prepare(
    'SELECT usd, zero_ui, swap_sig, created_at FROM autocompound_events WHERE owner = ? ORDER BY created_at DESC LIMIT ?')
    .all(owner, limit) as { usd: number; zero_ui: number; swap_sig: string | null; created_at: string }[];
  return rows.map((r) => ({ usd: r.usd, zeroUi: r.zero_ui, swapSig: r.swap_sig, createdAt: r.created_at }));
}

function recordCompoundEvent(owner: string, usd: number, zeroUi: number, swapSig: string | null, depositSig: string | null): void {
  const crypto = require('crypto');
  getDb().prepare('INSERT INTO autocompound_events (id, owner, usd, zero_ui, swap_sig, deposit_sig, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), owner, usd, zeroUi, swapSig, depositSig, new Date().toISOString());
}

/** Open a new stake lot dated now — compounded ZERO ages 24h like any deposit. */
function addCompoundLot(owner: string, zeroUi: number): void {
  initOnchainStakeTable();
  const crypto = require('crypto');
  getDb().prepare('INSERT INTO onchain_stake_lots (id, owner, amount, since) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), owner, zeroUi, new Date().toISOString());
}

function stakingProgramId(): PublicKey {
  return new PublicKey(process.env.STAKING_PROGRAM_ID || process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID
    || 'BU3JcQJBsFZwNV2DHSPeu3hKLsfarLS2AU5RuVhJrYKM');
}
function zeroMint(): PublicKey {
  const m = process.env.ZERO_TOKEN_MINT || process.env.NEXT_PUBLIC_STAKE_MINT;
  if (!m) throw new Error('[keeper v2] ZERO mint not configured');
  return new PublicKey(m);
}

/**
 * Deposit treasury-held ZERO into `owner`'s self-custody stake vault using the
 * program's permissionless deposit (same instruction the migration uses:
 * beneficiary = owner, depositor = keeper). Verified with the same retry-read
 * pattern as fundStakerRewardVault.
 */
export async function stakeZeroForBeneficiary(
  conn: Connection, keeper: Keypair, owner: PublicKey, zeroRaw: bigint,
): Promise<string> {
  if (zeroRaw <= BigInt(0)) throw new Error('amount must be > 0');
  const mint = zeroMint();
  const [stakeAuth] = PublicKey.findProgramAddressSync([Buffer.from('stake'), owner.toBuffer()], stakingProgramId());
  const vault = getAssociatedTokenAddressSync(mint, stakeAuth, true, TOKEN_2022_PROGRAM_ID);
  const keeperAta = getAssociatedTokenAddressSync(mint, keeper.publicKey, false, TOKEN_2022_PROGRAM_ID);

  const bal = async (a: PublicKey): Promise<bigint> => {
    try { return BigInt((await getAccount(conn, a, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount); } catch { return BigInt(0); }
  };
  const before = await bal(vault);

  const stakeIx = new TransactionInstruction({
    programId: stakingProgramId(),
    keys: [
      { pubkey: owner, isSigner: false, isWritable: false },                 // beneficiary
      { pubkey: stakeAuth, isSigner: false, isWritable: false },             // stake_authority PDA
      { pubkey: vault, isSigner: false, isWritable: true },                  // stake_vault
      { pubkey: keeper.publicKey, isSigner: true, isWritable: false },       // depositor (keeper)
      { pubkey: keeperAta, isSigner: false, isWritable: true },              // depositor ZERO ATA
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0]), u64le(zeroRaw)]),
  });
  const ensureVault = createAssociatedTokenAccountIdempotentInstruction(
    keeper.publicKey, vault, stakeAuth, mint, TOKEN_2022_PROGRAM_ID);
  const tx = new Transaction().add(ensureVault, stakeIx);
  tx.feePayer = keeper.publicKey;
  const sig = await sendAndConfirmTransaction(conn, tx, [keeper]);

  const want = before + zeroRaw;
  let after = BigInt(0);
  for (let i = 0; i < 8; i++) {
    after = await bal(vault);
    if (after >= want) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (after < want) throw new Error(`stake vault mismatch for ${owner.toBase58()}: ${after} < ${want}`);
  return sig;
}

function upsertPendingCompound(owner: string, zeroRaw: bigint, usd: number, swapSig: string | null): void {
  initAutocompoundTables();
  const db = getDb();
  const existing = db.prepare('SELECT zero_raw, usd FROM autocompound_pending WHERE owner = ?').get(owner) as
    { zero_raw: string; usd: number } | undefined;
  if (existing) {
    db.prepare('UPDATE autocompound_pending SET zero_raw = ?, usd = ?, swap_sig = ?, created_at = ? WHERE owner = ?')
      .run((BigInt(existing.zero_raw) + zeroRaw).toString(), existing.usd + usd, swapSig, new Date().toISOString(), owner);
  } else {
    db.prepare('INSERT INTO autocompound_pending (owner, zero_raw, usd, swap_sig, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(owner, zeroRaw.toString(), usd, swapSig, new Date().toISOString());
  }
}

/** Retry stake deposits that failed after their swap already happened. */
async function retryPendingCompounds(conn: Connection, keeper: Keypair): Promise<void> {
  initAutocompoundTables();
  const rows = getDb().prepare('SELECT owner, zero_raw, usd, swap_sig FROM autocompound_pending').all() as
    { owner: string; zero_raw: string; usd: number; swap_sig: string | null }[];
  for (const r of rows) {
    const raw = BigInt(r.zero_raw);
    if (raw <= BigInt(0)) { getDb().prepare('DELETE FROM autocompound_pending WHERE owner = ?').run(r.owner); continue; }
    try {
      const sig = await stakeZeroForBeneficiary(conn, keeper, new PublicKey(r.owner), raw);
      const zeroUi = Number(raw) / 10 ** ZERO_DECIMALS;
      recordCompoundEvent(r.owner, r.usd, zeroUi, r.swap_sig, sig);
      addCompoundLot(r.owner, zeroUi);
      getDb().prepare('DELETE FROM autocompound_pending WHERE owner = ?').run(r.owner);
      console.log(`[Keeper v2] retried compound deposit for ${r.owner}: ${zeroUi} ZERO (${sig})`);
    } catch (e) {
      console.error(`[Keeper v2] pending compound retry failed for ${r.owner}:`, e instanceof Error ? e.message : e);
    }
  }
}

/**
 * Swap primitives injected by the keeper. They live in ./onchain, which pulls
 * anchor + the PumpSwap SDK and must NEVER enter the Next bundle — this module
 * is imported by API routes, so even a dynamic import here gets traced by
 * webpack. scripts/keeper.ts (never bundled) passes the real functions in.
 */
export type CompoundSwapRails = {
  findGraduatedPool: () => Promise<PublicKey | null>;
  buyZeroWithUsdc: (pool: PublicKey, usdcUi: number) => Promise<{ zeroOutRaw: bigint; swapSig: string }>;
  isDryRun: () => boolean;
};

/**
 * Swap the pooled compound USDC to ZERO once, then stake each compounder's
 * pro-rata ZERO into their own vault. Returns the USD counted as distributed.
 * Failure ladder: no pool / swap threw → pay USDC to reward vaults as normal
 * (nothing was spent); deposit failed after the swap → park in
 * autocompound_pending and retry next cycle (the ZERO sits in the treasury).
 */
async function compoundRewards(
  conn: Connection, keeper: Keypair, swap: CompoundSwapRails,
  shares: { owner: string; usd: number }[], compoundUsd: number,
): Promise<number> {
  const fallbackToUsdc = async (): Promise<number> => {
    let f = 0;
    for (const s of shares) {
      try {
        await fundStakerRewardVault(conn, keeper, new PublicKey(s.owner), s.usd);
        f += s.usd;
        console.log(`[Keeper v2] compound fallback: funded ${s.owner} reward vault $${s.usd.toFixed(6)}`);
      } catch (e) {
        console.error(`[Keeper v2] compound fallback fund failed for ${s.owner}:`, e instanceof Error ? e.message : e);
      }
    }
    return f;
  };

  if (swap.isDryRun()) {
    console.log(`[Keeper v2] DRY RUN — would compound $${compoundUsd.toFixed(2)} into ZERO for ${shares.length} staker(s)`);
    return 0;
  }
  const pool = await swap.findGraduatedPool();
  if (!pool) {
    console.log('[Keeper v2] no graduated pool — paying compounders in USDC');
    return fallbackToUsdc();
  }

  let zeroOutRaw: bigint, swapSig: string;
  try {
    ({ zeroOutRaw, swapSig } = await swap.buyZeroWithUsdc(pool, compoundUsd));
  } catch (e) {
    console.error('[Keeper v2] compound swap failed — paying USDC instead:', e instanceof Error ? e.message : e);
    return fallbackToUsdc();
  }
  if (zeroOutRaw <= BigInt(0)) {
    // Swap confirmed but the receipt couldn't be measured: the USDC IS spent, so
    // never double-pay. Park every share as pending with 0 ZERO so it's visible
    // for manual reconciliation against the swap signature.
    console.error(`[Keeper v2] compound swap ${swapSig} confirmed but unmeasured — manual reconciliation needed`);
    for (const s of shares) upsertPendingCompound(s.owner, BigInt(0), s.usd, swapSig);
    return compoundUsd;
  }

  // split bought ZERO pro-rata by USD share (integer math; dust stays in treasury)
  const usdScale = (n: number) => BigInt(Math.round(n * 1e6));
  let distributed = 0;
  for (const s of shares) {
    const zeroShare = (zeroOutRaw * usdScale(s.usd)) / usdScale(compoundUsd);
    if (zeroShare <= BigInt(0)) continue;
    const zeroUi = Number(zeroShare) / 10 ** ZERO_DECIMALS;
    try {
      const sig = await stakeZeroForBeneficiary(conn, keeper, new PublicKey(s.owner), zeroShare);
      recordCompoundEvent(s.owner, s.usd, zeroUi, swapSig, sig);
      addCompoundLot(s.owner, zeroUi);
      console.log(`[Keeper v2] compounded $${s.usd.toFixed(6)} → ${zeroUi} ZERO into ${s.owner}'s stake (${sig})`);
    } catch (e) {
      upsertPendingCompound(s.owner, zeroShare, s.usd, swapSig);
      console.error(`[Keeper v2] compound deposit failed for ${s.owner} (parked for retry):`, e instanceof Error ? e.message : e);
    }
    distributed += s.usd; // swap already spent this share either way
  }
  return distributed;
}

/**
 * Pay on-chain stakers their share of `totalUsdForOnchain` pro-rata by mature stake.
 * Returns total actually funded. One vault at a time, verified per-fund; a failure on
 * one staker doesn't abort the rest (logged, skipped). Stakers with auto-compound
 * enabled get their share swapped to ZERO and staked instead of USDC.
 */
export async function distributeOnchainRewards(totalUsdForOnchain: number, swap?: CompoundSwapRails): Promise<number> {
  if (totalUsdForOnchain <= 0) return 0;
  const stakers = getEligibleOnchainStakers();
  const totalMature = stakers.reduce((s, x) => s + x.mature, 0);
  if (totalMature <= 0) return 0;

  const conn = new Connection(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_ONCHAIN_RPC || 'https://api.devnet.solana.com', 'confirmed');
  const keeper = keeperKeypair();

  await retryPendingCompounds(conn, keeper);

  // Without swap rails (defensive default) everyone is paid USDC as before.
  const optins = swap ? getAutocompoundOptins() : new Set<string>();
  const compoundShares: { owner: string; usd: number }[] = [];
  let funded = 0;
  for (const s of stakers) {
    const share = Math.floor((s.mature / totalMature) * totalUsdForOnchain * 1e6) / 1e6;
    if (share <= 0) continue;
    if (optins.has(s.owner)) {
      compoundShares.push({ owner: s.owner, usd: share });
      continue;
    }
    try {
      await fundStakerRewardVault(conn, keeper, new PublicKey(s.owner), share);
      funded += share;
      console.log(`[Keeper v2] funded ${s.owner} reward vault $${share.toFixed(6)}`);
    } catch (e) {
      console.error(`[Keeper v2] fund failed for ${s.owner}:`, e instanceof Error ? e.message : e);
    }
  }

  const compoundUsd = compoundShares.reduce((s, x) => s + x.usd, 0);
  if (compoundUsd > 0 && swap) {
    funded += await compoundRewards(conn, keeper, swap, compoundShares, compoundUsd);
  }
  return funded;
}
