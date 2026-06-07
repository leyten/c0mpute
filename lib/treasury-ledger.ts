// Treasury bucket ledger.
//
// The treasury is ONE real USDC wallet, but the dollars in it belong to several
// different parties. This ledger tracks the slices the protocol is allowed to
// spend so the buyback keeper can NEVER touch money owed to users or workers.
//
// Spendable buckets (funded only by realised protocol revenue):
//   buyback        — USDC earmarked to buy + burn ZERO
//   staker_rewards — USDC earmarked to pay stakers (paid out as USDC)
//   profit         — leyten's cut
//
// NOT tracked here (they're liabilities derived from existing tables):
//   unspent credits  = users' refundable money  (sum of user_credits.balance)
//   pending payouts   = workers' earned money     (sum of unpaid worker_earnings)
//
// The keeper only ever calls spendBuyback()/spendStakerRewards(), which clamp at
// zero, so it is structurally impossible to spend a liability on a buyback.

import Database from 'better-sqlite3';
import path from 'path';
import {
  COMPUTE_MARGIN_TO_POOL_PCT,
  TRADING_FEE_TO_POOL_PCT,
  POOL_BURN_SPLIT,
} from './tokenomics';

const DB_PATH = path.join(process.cwd(), 'data', 'c0mpute.db');

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS treasury_buckets (
        name TEXT PRIMARY KEY,
        balance_usd REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS treasury_stats (
        name TEXT PRIMARY KEY,
        value REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS treasury_ledger (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        bucket TEXT,
        amount_usd REAL,
        meta TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_treasury_ledger_date ON treasury_ledger(created_at);
    `);
  }
  return _db;
}

export type Bucket = 'buyback' | 'staker_rewards' | 'profit';

function credit(db: Database.Database, bucket: Bucket, usd: number, event: string, meta?: string) {
  if (usd <= 0) return;
  db.prepare(
    `INSERT INTO treasury_buckets (name, balance_usd) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET balance_usd = balance_usd + ?`
  ).run(bucket, usd, usd);
  db.prepare(
    'INSERT INTO treasury_ledger (id, event, bucket, amount_usd, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), event, bucket, usd, meta || null, new Date().toISOString());
}

/**
 * Realise the protocol margin from one completed job into the buyback pool.
 * 100% of the margin goes to the pool (default), which splits 50/50 into the
 * buyback (buy+burn) and staker-reward buckets. Any fraction of margin not
 * routed to the pool falls through to profit.
 */
export function realizeMargin(usdMargin: number, meta?: string): void {
  if (usdMargin <= 0) return;
  const db = getDb();
  const toPool = usdMargin * COMPUTE_MARGIN_TO_POOL_PCT;
  const txn = db.transaction(() => {
    credit(db, 'buyback', toPool * POOL_BURN_SPLIT, 'margin', meta);
    credit(db, 'staker_rewards', toPool * (1 - POOL_BURN_SPLIT), 'margin', meta);
    credit(db, 'profit', usdMargin - toPool, 'margin', meta);
  });
  txn();
}

/**
 * Realise claimed trading fees: TRADING_FEE_TO_POOL_PCT goes into the buyback
 * pool (split 50/50 buyback/staker), the remainder is leyten's profit.
 */
export function realizeFees(usdFees: number, meta?: string): void {
  if (usdFees <= 0) return;
  const db = getDb();
  const toPool = usdFees * TRADING_FEE_TO_POOL_PCT;
  const txn = db.transaction(() => {
    credit(db, 'buyback', toPool * POOL_BURN_SPLIT, 'fees', meta);
    credit(db, 'staker_rewards', toPool * (1 - POOL_BURN_SPLIT), 'fees', meta);
    credit(db, 'profit', usdFees - toPool, 'fees', meta);
  });
  txn();
}

export function getBucket(bucket: Bucket): number {
  const db = getDb();
  const row = db.prepare('SELECT balance_usd FROM treasury_buckets WHERE name = ?').get(bucket) as
    | { balance_usd: number }
    | undefined;
  return row?.balance_usd ?? 0;
}

export function getAllBuckets(): Record<Bucket, number> {
  return {
    buyback: getBucket('buyback'),
    staker_rewards: getBucket('staker_rewards'),
    profit: getBucket('profit'),
  };
}

function getStat(name: string): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM treasury_stats WHERE name = ?').get(name) as
    | { value: number }
    | undefined;
  return row?.value ?? 0;
}

function bumpStat(db: Database.Database, name: string, delta: number) {
  db.prepare(
    `INSERT INTO treasury_stats (name, value) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET value = value + ?`
  ).run(name, delta, delta);
}

/**
 * Atomically remove `usd` from the buyback bucket before a buy executes. Returns
 * the amount actually reserved (clamped to the available balance, never below 0)
 * so the keeper buys only with money it truly has. Call this, swap, then on
 * failure refund via creditBuyback().
 */
export function reserveBuyback(usd: number): number {
  if (usd <= 0) return 0;
  const db = getDb();
  const txn = db.transaction((): number => {
    const have = getBucket('buyback');
    const take = Math.min(have, usd);
    if (take <= 0) return 0;
    db.prepare('UPDATE treasury_buckets SET balance_usd = balance_usd - ? WHERE name = ?').run(take, 'buyback');
    db.prepare(
      'INSERT INTO treasury_ledger (id, event, bucket, amount_usd, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), 'buyback_reserve', 'buyback', -take, null, new Date().toISOString());
    return take;
  });
  return txn();
}

export function creditBuyback(usd: number, meta?: string): void {
  credit(getDb(), 'buyback', usd, 'buyback_refund', meta);
}

/** Reserve up to `usd` from the staker-reward bucket for an epoch distribution. */
export function reserveStakerRewards(usd: number): number {
  if (usd <= 0) return 0;
  const db = getDb();
  const txn = db.transaction((): number => {
    const have = getBucket('staker_rewards');
    const take = Math.min(have, usd);
    if (take <= 0) return 0;
    db.prepare('UPDATE treasury_buckets SET balance_usd = balance_usd - ? WHERE name = ?').run(take, 'staker_rewards');
    db.prepare(
      'INSERT INTO treasury_ledger (id, event, bucket, amount_usd, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), 'staker_payout', 'staker_rewards', -take, null, new Date().toISOString());
    return take;
  });
  return txn();
}

export function creditStakerRewards(usd: number, meta?: string): void {
  credit(getDb(), 'staker_rewards', usd, 'staker_refund', meta);
}

/**
 * Record a completed buy+burn: `usdSpent` of USDC bought `zeroBurned` ZERO which
 * was then burned. Updates the lifetime counters shown on the treasury page.
 */
export function recordBurn(usdSpent: number, zeroBurned: number, txSig: string): void {
  const db = getDb();
  const txn = db.transaction(() => {
    bumpStat(db, 'total_usd_buyback_spent', usdSpent);
    bumpStat(db, 'total_zero_burned', zeroBurned);
    db.prepare(
      'INSERT INTO treasury_ledger (id, event, bucket, amount_usd, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), 'burn', 'buyback', usdSpent, `${zeroBurned} ZERO burned, tx ${txSig}`, new Date().toISOString());
  });
  txn();
}

export function recordStakerPayout(usdPaid: number): void {
  bumpStat(getDb(), 'total_staker_rewards_paid', usdPaid);
}

export function getTreasuryStats(): {
  totalZeroBurned: number;
  totalUsdBuybackSpent: number;
  totalStakerRewardsPaid: number;
} {
  return {
    totalZeroBurned: getStat('total_zero_burned'),
    totalUsdBuybackSpent: getStat('total_usd_buyback_spent'),
    totalStakerRewardsPaid: getStat('total_staker_rewards_paid'),
  };
}
