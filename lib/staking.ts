// Custodial $ZERO staking.
//
// Auth is X-only (no wallet connect), so staking is custodial like everything
// else in c0mpute: each user gets a per-user staking wallet whose key the server
// holds (AES-256-GCM, same DEPOSIT_WALLET_KEY as credit deposit wallets). The
// user sends ZERO to that address; we read the on-chain balance and treat it as
// their stake. The ZERO sits in the user's own staking wallet until they
// unstake, at which point the treasury (fee payer) co-signs a transfer back to
// their address.
//
// Two perks for stakers (see lib/tokenomics.ts):
//   1. you earn a pro-rata share of the daily USDC reward pool on whatever
//      portion of your stake has been held >= 24h
//   2. a worker whose >= 24h-aged stake clears WORKER_STAKE_THRESHOLD earns the
//      boosted revenue share (80% vs 70%)
//
// Stake is tracked as per-deposit lots: every top-up is its own lot that ages on
// its own 24h clock, and only the matured portion counts. So a fresh bag staked
// right before a reward drop earns nothing (can't snipe), while honest stakers
// can add to a position without freezing the part they've already aged. Partial
// unstakes burn the youngest lots first (LIFO), preserving aged stake.

import Database from 'better-sqlite3';
import path from 'path';
import {
  WORKER_REVENUE_SHARE,
  WORKER_STAKED_REVENUE_SHARE,
  WORKER_STAKE_THRESHOLD,
  STAKE_MIN_AGE_MS,
  MIN_WITHDRAWAL_USD,
} from './tokenomics';

const DB_PATH = path.join(process.cwd(), 'data', 'c0mpute.db');

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS staking_wallets (
        privy_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        encrypted_secret TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS staking_positions (
        privy_id TEXT PRIMARY KEY,
        staked_amount REAL NOT NULL DEFAULT 0,
        staked_since TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS staking_lots (
        id TEXT PRIMARY KEY,
        privy_id TEXT NOT NULL,
        amount REAL NOT NULL,
        since TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_staking_lots_privy ON staking_lots(privy_id);
      CREATE TABLE IF NOT EXISTS staking_rewards (
        privy_id TEXT PRIMARY KEY,
        claimable_usd REAL NOT NULL DEFAULT 0,
        total_earned_usd REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS staking_reward_payouts (
        id TEXT PRIMARY KEY,
        privy_id TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        wallet_address TEXT NOT NULL,
        status TEXT DEFAULT 'pending_transfer',
        tx_hash TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
    `);
  }
  return _db;
}

// ── Per-user staking wallet (AES-256-GCM, format ivHex:tagHex:cipherHex) ──

export function getOrCreateStakingWallet(privyId: string): string {
  const db = getDb();
  const existing = db.prepare('SELECT public_key FROM staking_wallets WHERE privy_id = ?').get(privyId) as
    | { public_key: string }
    | undefined;
  if (existing) return existing.public_key;

  const { Keypair } = require('@solana/web3.js');
  const cryptoMod = require('crypto');
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();

  const encKey = process.env.DEPOSIT_WALLET_KEY;
  if (!encKey) throw new Error('[Staking] DEPOSIT_WALLET_KEY not set');
  const iv = cryptoMod.randomBytes(16);
  const cipher = cryptoMod.createCipheriv('aes-256-gcm', Buffer.from(encKey, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(keypair.secretKey)), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedSecret = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

  db.prepare('INSERT INTO staking_wallets (privy_id, public_key, encrypted_secret, created_at) VALUES (?, ?, ?, ?)')
    .run(privyId, publicKey, encryptedSecret, new Date().toISOString());
  return publicKey;
}

export function getStakingWalletSecret(privyId: string): Uint8Array | null {
  const db = getDb();
  const row = db.prepare('SELECT encrypted_secret FROM staking_wallets WHERE privy_id = ?').get(privyId) as
    | { encrypted_secret: string }
    | undefined;
  if (!row) return null;
  const encKey = process.env.DEPOSIT_WALLET_KEY;
  if (!encKey) throw new Error('[Staking] DEPOSIT_WALLET_KEY not set');
  const cryptoMod = require('crypto');
  const [ivHex, tagHex, dataHex] = row.encrypted_secret.split(':');
  const decipher = cryptoMod.createDecipheriv('aes-256-gcm', Buffer.from(encKey, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return new Uint8Array(decrypted);
}

// ── Position ──

export interface StakePosition {
  stakedAmount: number; // total ZERO in the staking wallet
  matureAmount: number; // portion held >= 24h (the part that earns)
  stakedSince: string | null; // oldest lot's start (for display)
  nextMatureAt: string | null; // when the soonest cooling-down lot matures, else null
  eligible: boolean; // matureAmount > 0
}

interface Lot {
  id: string;
  amount: number;
  since: string;
}

function getLots(db: Database.Database, privyId: string): Lot[] {
  return db.prepare('SELECT id, amount, since FROM staking_lots WHERE privy_id = ?').all(privyId) as Lot[];
}

function isLotMature(since: string): boolean {
  return Date.now() - new Date(since).getTime() >= STAKE_MIN_AGE_MS;
}

export function getStakePosition(privyId: string): StakePosition {
  const lots = getLots(getDb(), privyId);
  if (lots.length === 0) {
    return { stakedAmount: 0, matureAmount: 0, stakedSince: null, nextMatureAt: null, eligible: false };
  }
  let total = 0;
  let mature = 0;
  let oldest: number | null = null;
  let nextMature: number | null = null;
  for (const lot of lots) {
    total += lot.amount;
    const sinceMs = new Date(lot.since).getTime();
    if (oldest === null || sinceMs < oldest) oldest = sinceMs;
    if (isLotMature(lot.since)) {
      mature += lot.amount;
    } else {
      const matureAt = sinceMs + STAKE_MIN_AGE_MS;
      if (nextMature === null || matureAt < nextMature) nextMature = matureAt;
    }
  }
  return {
    stakedAmount: total,
    matureAmount: mature,
    stakedSince: oldest !== null ? new Date(oldest).toISOString() : null,
    nextMatureAt: nextMature !== null ? new Date(nextMature).toISOString() : null,
    eligible: mature > 0,
  };
}

/**
 * Sync the DB stake to the freshly-read on-chain balance of the user's staking
 * wallet, maintaining per-deposit lots. An increase opens a new lot dated now
 * (it must age 24h before it earns). A decrease burns the youngest lots first
 * (LIFO), so aged stake is preserved. Returns the updated position.
 */
export function syncStake(privyId: string, onChainAmount: number): StakePosition {
  const db = getDb();
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const lots = getLots(db, privyId);
    const recorded = lots.reduce((s, l) => s + l.amount, 0);
    const delta = onChainAmount - recorded;

    if (onChainAmount <= 1e-9) {
      // Fully unstaked — clear all lots.
      db.prepare('DELETE FROM staking_lots WHERE privy_id = ?').run(privyId);
    } else if (delta > 1e-9) {
      // Deposit — new lot starts aging now.
      db.prepare('INSERT INTO staking_lots (id, privy_id, amount, since) VALUES (?, ?, ?, ?)')
        .run(crypto.randomUUID(), privyId, delta, now);
    } else if (delta < -1e-9) {
      // Partial unstake — consume youngest lots first.
      let remaining = -delta;
      const youngestFirst = [...lots].sort((a, b) => new Date(b.since).getTime() - new Date(a.since).getTime());
      for (const lot of youngestFirst) {
        if (remaining <= 1e-9) break;
        if (lot.amount <= remaining + 1e-9) {
          db.prepare('DELETE FROM staking_lots WHERE id = ?').run(lot.id);
          remaining -= lot.amount;
        } else {
          db.prepare('UPDATE staking_lots SET amount = ? WHERE id = ?').run(lot.amount - remaining, lot.id);
          remaining = 0;
        }
      }
    }

    // Mirror total + oldest lot into staking_positions for getTotalStaked/display.
    const after = getLots(db, privyId);
    const total = after.reduce((s, l) => s + l.amount, 0);
    const oldest = after.length
      ? after.reduce((min, l) => (new Date(l.since).getTime() < new Date(min).getTime() ? l.since : min), after[0].since)
      : null;
    db.prepare(
      `INSERT INTO staking_positions (privy_id, staked_amount, staked_since, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(privy_id) DO UPDATE SET staked_amount = ?, staked_since = ?, updated_at = ?`
    ).run(privyId, total, oldest, now, total, oldest, now);
  });
  txn();
  return getStakePosition(privyId);
}

/** Worker's effective revenue share, boosted if their >=24h-aged stake clears the threshold. */
export function getWorkerRevenueShare(privyId: string): number {
  const pos = getStakePosition(privyId);
  if (pos.matureAmount >= WORKER_STAKE_THRESHOLD) return WORKER_STAKED_REVENUE_SHARE;
  return WORKER_REVENUE_SHARE;
}

/**
 * Every staker's matured stake (the portion of their lots held >= 24h). Only
 * users with a positive matured amount are returned, weighted by that amount —
 * cooling-down lots earn nothing until they age in.
 */
export function getEligibleStakers(): { privyId: string; stakedAmount: number }[] {
  const db = getDb();
  const rows = db.prepare('SELECT privy_id, amount, since FROM staking_lots').all() as {
    privy_id: string;
    amount: number;
    since: string;
  }[];
  const matureByUser = new Map<string, number>();
  for (const r of rows) {
    if (isLotMature(r.since)) {
      matureByUser.set(r.privy_id, (matureByUser.get(r.privy_id) ?? 0) + r.amount);
    }
  }
  return [...matureByUser.entries()]
    .filter(([, mature]) => mature > 0)
    .map(([privyId, mature]) => ({ privyId, stakedAmount: mature }));
}

/** Every staking wallet (for the keeper to re-read on-chain balances before paying). */
export function getAllStakingWallets(): { privyId: string; publicKey: string }[] {
  const db = getDb();
  return db.prepare('SELECT privy_id AS privyId, public_key AS publicKey FROM staking_wallets').all() as {
    privyId: string;
    publicKey: string;
  }[];
}

export function getTotalStaked(): number {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(staked_amount), 0) AS total FROM staking_positions').get() as { total: number };
  return row.total;
}

// ── Rewards ──

function creditReward(privyId: string, usd: number): void {
  if (usd <= 0) return;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO staking_rewards (privy_id, claimable_usd, total_earned_usd, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(privy_id) DO UPDATE SET claimable_usd = claimable_usd + ?, total_earned_usd = total_earned_usd + ?, updated_at = ?`
  ).run(privyId, usd, usd, now, usd, usd, now);
}

/**
 * Split `totalUsd` pro-rata across all eligible stakers by staked amount.
 * Returns the amount actually distributed (0 if there are no eligible stakers,
 * so the caller can roll the pool to the next epoch).
 */
export function distributeEpochRewards(totalUsd: number): number {
  if (totalUsd <= 0) return 0;
  const stakers = getEligibleStakers();
  const totalStaked = stakers.reduce((s, x) => s + x.stakedAmount, 0);
  if (totalStaked <= 0) return 0;

  const db = getDb();
  let distributed = 0;
  const txn = db.transaction(() => {
    for (const s of stakers) {
      const share = (s.stakedAmount / totalStaked) * totalUsd;
      const rounded = Math.floor(share * 1e6) / 1e6;
      if (rounded > 0) {
        creditReward(s.privyId, rounded);
        distributed += rounded;
      }
    }
  });
  txn();
  return distributed;
}

export function getClaimableRewards(privyId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT claimable_usd FROM staking_rewards WHERE privy_id = ?').get(privyId) as
    | { claimable_usd: number }
    | undefined;
  return row?.claimable_usd ?? 0;
}

export function getTotalEarnedRewards(privyId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT total_earned_usd FROM staking_rewards WHERE privy_id = ?').get(privyId) as
    | { total_earned_usd: number }
    | undefined;
  return row?.total_earned_usd ?? 0;
}

type RewardWithdrawalResult =
  | { ok: true; payoutId: string; amount: number }
  | { ok: false; reason: 'below_min' | 'insufficient' | 'in_flight' };

/**
 * Atomically debit claimable reward USD and create a pending payout row. The
 * caller then sends the USDC (reuse lib/payout sendUsdc) and flips the row to
 * completed, or to failed (which restores the balance).
 */
export function createRewardWithdrawal(privyId: string, walletAddress: string, amount: number): RewardWithdrawalResult {
  const db = getDb();
  const rounded = Math.round(amount * 100) / 100;
  const txn = db.transaction((): RewardWithdrawalResult => {
    if (rounded < MIN_WITHDRAWAL_USD) return { ok: false, reason: 'below_min' };
    const inflight = db.prepare(
      "SELECT id FROM staking_reward_payouts WHERE privy_id = ? AND status = 'pending_transfer'"
    ).get(privyId);
    if (inflight) return { ok: false, reason: 'in_flight' };

    const claimable = getClaimableRewards(privyId);
    if (claimable < rounded) return { ok: false, reason: 'insufficient' };

    db.prepare('UPDATE staking_rewards SET claimable_usd = claimable_usd - ?, updated_at = ? WHERE privy_id = ?')
      .run(rounded, new Date().toISOString(), privyId);
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO staking_reward_payouts (id, privy_id, amount_usd, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, privyId, rounded, walletAddress, 'pending_transfer', new Date().toISOString());
    return { ok: true, payoutId: id, amount: rounded };
  });
  return txn();
}

export function markRewardPayoutCompleted(payoutId: string, txHash: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE staking_reward_payouts SET status = 'completed', tx_hash = ?, completed_at = ? WHERE id = ? AND status = 'pending_transfer'"
  ).run(txHash, new Date().toISOString(), payoutId);
}

export function markRewardPayoutFailed(payoutId: string): void {
  const db = getDb();
  const row = db.prepare("SELECT privy_id, amount_usd FROM staking_reward_payouts WHERE id = ? AND status = 'pending_transfer'").get(payoutId) as
    | { privy_id: string; amount_usd: number }
    | undefined;
  if (!row) return;
  const txn = db.transaction(() => {
    db.prepare("UPDATE staking_reward_payouts SET status = 'failed', completed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), payoutId);
    db.prepare('UPDATE staking_rewards SET claimable_usd = claimable_usd + ?, updated_at = ? WHERE privy_id = ?')
      .run(row.amount_usd, new Date().toISOString(), row.privy_id);
  });
  txn();
}
