import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'c0mpute.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        privy_id TEXT UNIQUE NOT NULL,
        wallet_address TEXT,
        x_username TEXT,
        x_id TEXT,
        is_worker INTEGER DEFAULT 0,
        prompts_sent INTEGER DEFAULT 0,
        zero_balance TEXT DEFAULT '0',
        balance_updated_at TEXT,
        total_sol_earned TEXT DEFAULT '0',
        jobs_completed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
  return _db;
}

function rowToProfile(row: Record<string, unknown>) {
  if (!row) return null;
  return {
    ...row,
    is_worker: !!row.is_worker,
  };
}

export function getProfileByPrivyId(privyId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM profiles WHERE privy_id = ?').get(privyId) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function updateProfile(privyId: string, updates: Record<string, unknown>) {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    values.push(key === 'is_worker' ? (value ? 1 : 0) : value);
  }
  
  setClauses.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(privyId);
  
  db.prepare(`UPDATE profiles SET ${setClauses.join(', ')} WHERE privy_id = ?`).run(...values);
  return getProfileByPrivyId(privyId);
}

export function upsertProfile(data: { privy_id: string; wallet_address?: string | null; x_username?: string | null; x_id?: string | null }) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  
  const existing = getProfileByPrivyId(data.privy_id);
  
  if (existing) {
    // Update only the provided fields
    const updates: Record<string, unknown> = {};
    if (data.wallet_address !== undefined) updates.wallet_address = data.wallet_address;
    if (data.x_username !== undefined) updates.x_username = data.x_username;
    if (data.x_id !== undefined) updates.x_id = data.x_id;
    
    if (Object.keys(updates).length > 0) {
      return updateProfile(data.privy_id, updates);
    }
    return existing;
  }
  
  db.prepare(`
    INSERT INTO profiles (id, privy_id, wallet_address, x_username, x_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.privy_id, data.wallet_address || null, data.x_username || null, data.x_id || null, now, now);
  
  return getProfileByPrivyId(data.privy_id);
}

export function deleteProfile(privyId: string) {
  const db = getDb();
  db.prepare('DELETE FROM profiles WHERE privy_id = ?').run(privyId);
}

export function updateBalance(privyId: string, balance: number | string) {
  return updateProfile(privyId, {
    zero_balance: balance,
    balance_updated_at: new Date().toISOString(),
  });
}

/**
 * Atomically increment prompts_sent counter. Uses SQL increment to avoid race conditions.
 */
export function incrementPromptsSent(privyId: string) {
  const db = getDb();
  db.prepare(
    'UPDATE profiles SET prompts_sent = prompts_sent + 1, updated_at = ? WHERE privy_id = ?'
  ).run(new Date().toISOString(), privyId);
}

// ── Worker Stats ──

function ensureWorkerStatsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_stats (
      privy_id TEXT PRIMARY KEY,
      total_jobs INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_earning_points REAL DEFAULT 0,
      total_sol_paid TEXT DEFAULT '0',
      last_active_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS completed_jobs (
      id TEXT PRIMARY KEY,
      worker_privy_id TEXT NOT NULL,
      user_privy_id TEXT,
      model TEXT,
      tier TEXT,
      tokens_generated INTEGER NOT NULL,
      duration_ms INTEGER,
      earning_points REAL NOT NULL,
      completed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_worker ON completed_jobs(worker_privy_id);
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_date ON completed_jobs(completed_at);
  `);
}

export function recordCompletedJob(data: {
  jobId: string;
  workerPrivyId: string;
  userPrivyId?: string;
  model?: string;
  tier: string;
  tokensGenerated: number;
  durationMs?: number;
}) {
  ensureWorkerStatsTable();
  const db = getDb();
  const now = new Date().toISOString();

  // Earning points: tokens * tier multiplier
  const tierMultiplier = data.tier === 'max' ? 5 : data.tier === 'pro' ? 2 : 1;
  const earningPoints = data.tokensGenerated * tierMultiplier;

  db.prepare(`
    INSERT INTO completed_jobs (id, worker_privy_id, user_privy_id, model, tier, tokens_generated, duration_ms, earning_points, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.jobId, data.workerPrivyId, data.userPrivyId || null, data.model || null, data.tier, data.tokensGenerated, data.durationMs || null, earningPoints, now);

  // Upsert worker stats
  db.prepare(`
    INSERT INTO worker_stats (privy_id, total_jobs, total_tokens, total_earning_points, last_active_at, created_at)
    VALUES (?, 1, ?, ?, ?, ?)
    ON CONFLICT(privy_id) DO UPDATE SET
      total_jobs = total_jobs + 1,
      total_tokens = total_tokens + ?,
      total_earning_points = total_earning_points + ?,
      last_active_at = ?
  `).run(data.workerPrivyId, data.tokensGenerated, earningPoints, now, now, data.tokensGenerated, earningPoints, now);
}

export function getWorkerStats(privyId: string): { totalJobs: number; totalTokens: number; totalEarningPoints: number; totalSolPaid: string; lastActiveAt: string | null } | null {
  ensureWorkerStatsTable();
  const db = getDb();
  const row = db.prepare('SELECT * FROM worker_stats WHERE privy_id = ?').get(privyId) as any;
  if (!row) return null;
  return {
    totalJobs: row.total_jobs,
    totalTokens: row.total_tokens,
    totalEarningPoints: row.total_earning_points,
    totalSolPaid: row.total_sol_paid,
    lastActiveAt: row.last_active_at,
  };
}

export function getWorkerJobHistory(privyId: string, limit = 50): any[] {
  ensureWorkerStatsTable();
  const db = getDb();
  return db.prepare('SELECT * FROM completed_jobs WHERE worker_privy_id = ? ORDER BY completed_at DESC LIMIT ?').all(privyId, limit);
}

export function getNetworkStats(): { totalJobs: number; totalTokens: number; totalWorkers: number } {
  ensureWorkerStatsTable();
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(total_jobs),0) as tj, COALESCE(SUM(total_tokens),0) as tt, COUNT(*) as tw FROM worker_stats').get() as any;
  return { totalJobs: row.tj, totalTokens: row.tt, totalWorkers: row.tw };
}

// ── Worker Earnings & Payouts ──

function ensureEarningsTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_earnings (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      job_id TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      earning_usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_worker_earnings_privy ON worker_earnings(privy_id);
    CREATE INDEX IF NOT EXISTS idx_worker_earnings_date ON worker_earnings(created_at);

    CREATE TABLE IF NOT EXISTS worker_payouts (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      amount_sol REAL,
      sol_price_usd REAL,
      wallet_address TEXT,
      status TEXT DEFAULT 'pending_transfer',
      tx_hash TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS worker_wallets (
      privy_id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

const DAILY_CAPS: Record<string, number> = { free: 20, pro: 50, max: 100 };

export function recordEarning(data: {
  privyId: string;
  jobId: string;
  tier: 'free' | 'pro' | 'max';
  tokensGenerated: number;
}): number {
  ensureEarningsTables();
  const db = getDb();
  const cap = DAILY_CAPS[data.tier] || 20;
  const todayEarnings = getTodayEarnings(data.privyId);
  if (todayEarnings >= cap) return 0;

  let earning = data.tokensGenerated * 0.01;
  const remaining = cap - todayEarnings;
  if (earning > remaining) earning = remaining;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO worker_earnings (id, privy_id, job_id, tier, tokens, earning_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.privyId, data.jobId, data.tier, data.tokensGenerated, earning, now);
  return earning;
}

export function getTodayEarnings(privyId: string): number {
  ensureEarningsTables();
  const db = getDb();
  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);
  const row = db.prepare(
    'SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE privy_id = ? AND created_at >= ?'
  ).get(privyId, todayMidnight.toISOString()) as { total: number };
  return row.total;
}

export function getPendingBalance(privyId: string): number {
  ensureEarningsTables();
  const db = getDb();
  const earningsRow = db.prepare(
    'SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE privy_id = ?'
  ).get(privyId) as { total: number };
  const payoutsRow = db.prepare(
    "SELECT COALESCE(SUM(amount_usd), 0) as total FROM worker_payouts WHERE privy_id = ? AND status IN ('pending_transfer', 'completed')"
  ).get(privyId) as { total: number };
  return Math.max(0, earningsRow.total - payoutsRow.total);
}

export function getTotalEarnings(privyId: string): number {
  ensureEarningsTables();
  const db = getDb();
  const row = db.prepare(
    'SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE privy_id = ?'
  ).get(privyId) as { total: number };
  return row.total;
}

export function requestPayout(privyId: string, walletAddress?: string): { payoutId: string; amountUsd: number } | null {
  ensureEarningsTables();
  const db = getDb();

  // Use a transaction to prevent race conditions (double-claim)
  const txn = db.transaction(() => {
    const pending = getPendingBalance(privyId);
    if (pending < 1.0) return null;
    // Use provided wallet (from Privy profile) or fall back to legacy worker_wallets
    const wallet = walletAddress || getWorkerWallet(privyId);
    if (!wallet) return null;

    // Check no pending_transfer payout exists (prevent spam)
    const existingPending = db.prepare(
      "SELECT id FROM worker_payouts WHERE privy_id = ? AND status = 'pending_transfer'"
    ).get(privyId);
    if (existingPending) return null;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO worker_payouts (id, privy_id, amount_usd, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, privyId, pending, wallet, 'pending_transfer', now);
    return { payoutId: id, amountUsd: pending };
  });

  return txn();
}

export function getPayoutHistory(privyId: string, limit = 10): any[] {
  ensureEarningsTables();
  const db = getDb();
  return db.prepare(
    'SELECT * FROM worker_payouts WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(privyId, limit);
}

export function setWorkerWallet(privyId: string, walletAddress: string): void {
  ensureEarningsTables();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO worker_wallets (privy_id, wallet_address, updated_at) VALUES (?, ?, ?) ON CONFLICT(privy_id) DO UPDATE SET wallet_address = ?, updated_at = ?'
  ).run(privyId, walletAddress, now, walletAddress, now);
}

export function getWorkerWallet(privyId: string): string | null {
  ensureEarningsTables();
  const db = getDb();
  const row = db.prepare(
    'SELECT wallet_address FROM worker_wallets WHERE privy_id = ?'
  ).get(privyId) as { wallet_address: string } | undefined;
  return row?.wallet_address || null;
}

export function getRecentEarnings(privyId: string, limit = 20): any[] {
  ensureEarningsTables();
  const db = getDb();
  return db.prepare(
    'SELECT * FROM worker_earnings WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(privyId, limit);
}

// ── Worker Tokens ──

function ensureWorkerTokensTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_tokens (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'default',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked INTEGER DEFAULT 0
    );
  `);
}

function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateWorkerToken(): string {
  const crypto = require('crypto');
  return 'cwt_' + crypto.randomBytes(24).toString('base64url');
}

export function createWorkerToken(privyId: string, name?: string): string {
  ensureWorkerTokensTable();
  const db = getDb();
  const token = generateWorkerToken();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO worker_tokens (id, privy_id, token_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, privyId, hashToken(token), name || 'default', now);
  return token;
}

export function verifyWorkerToken(token: string): string | null {
  ensureWorkerTokensTable();
  const db = getDb();
  const hash = hashToken(token);
  const row = db.prepare(
    'SELECT privy_id FROM worker_tokens WHERE token_hash = ? AND revoked = 0'
  ).get(hash) as { privy_id: string } | undefined;
  if (!row) return null;
  // Update last_used_at
  db.prepare('UPDATE worker_tokens SET last_used_at = ? WHERE token_hash = ?').run(new Date().toISOString(), hash);
  return row.privy_id;
}

export function getWorkerTokens(privyId: string): { id: string; name: string; created_at: string; last_used_at: string | null }[] {
  ensureWorkerTokensTable();
  const db = getDb();
  return db.prepare(
    'SELECT id, name, created_at, last_used_at FROM worker_tokens WHERE privy_id = ? AND revoked = 0 ORDER BY created_at DESC'
  ).all(privyId) as any[];
}

export function revokeWorkerToken(tokenId: string, privyId: string): boolean {
  ensureWorkerTokensTable();
  const db = getDb();
  const result = db.prepare(
    'UPDATE worker_tokens SET revoked = 1 WHERE id = ? AND privy_id = ?'
  ).run(tokenId, privyId);
  return result.changes > 0;
}

// ── User Credits ──

function ensureCreditTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_credits (
      privy_id TEXT PRIMARY KEY,
      balance REAL DEFAULT 0,
      total_deposited REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      tx_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_credit_tx_privy ON credit_transactions(privy_id);
    CREATE INDEX IF NOT EXISTS idx_credit_tx_date ON credit_transactions(created_at);

    CREATE TABLE IF NOT EXISTS deposit_wallets (
      privy_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      encrypted_secret TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function getOrCreateDepositWallet(privyId: string): string {
  ensureCreditTables();
  const db = getDb();
  const existing = db.prepare('SELECT public_key FROM deposit_wallets WHERE privy_id = ?').get(privyId) as any;
  if (existing) return existing.public_key;

  const { Keypair } = require('@solana/web3.js');
  const cryptoMod = require('crypto');
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();

  const encKey: string | undefined = process.env.DEPOSIT_WALLET_KEY;
  if (!encKey) {
    throw new Error('[Credits] FATAL: DEPOSIT_WALLET_KEY not set. Cannot generate deposit wallets without encryption key.');
  }
  const iv = cryptoMod.randomBytes(16);
  const cipher = cryptoMod.createCipheriv('aes-256-gcm', Buffer.from(encKey, 'hex'), iv);
  let encrypted = cipher.update(Buffer.from(keypair.secretKey));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedSecret = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');

  const now = new Date().toISOString();
  db.prepare('INSERT INTO deposit_wallets (privy_id, public_key, encrypted_secret, created_at) VALUES (?, ?, ?, ?)')
    .run(privyId, publicKey, encryptedSecret, now);

  return publicKey;
}

export function getCreditBalance(privyId: string): { balance: number; totalDeposited: number; totalSpent: number } {
  ensureCreditTables();
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_credits WHERE privy_id = ?').get(privyId) as any;
  if (!row) return { balance: 0, totalDeposited: 0, totalSpent: 0 };
  return { balance: row.balance, totalDeposited: row.total_deposited, totalSpent: row.total_spent };
}

export function addCredits(privyId: string, amount: number, txHash?: string, description?: string): void {
  ensureCreditTables();
  const db = getDb();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO user_credits (privy_id, balance, total_deposited, total_spent, updated_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(privy_id) DO UPDATE SET
        balance = balance + ?,
        total_deposited = total_deposited + ?,
        updated_at = ?
    `).run(privyId, amount, amount, now, amount, amount, now);

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, privyId, 'deposit', amount, description || 'Token deposit', txHash || null, now);
  });
  txn();
}

export function spendCredits(privyId: string, amount: number, description?: string): boolean {
  ensureCreditTables();
  const db = getDb();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    const row = db.prepare('SELECT balance FROM user_credits WHERE privy_id = ?').get(privyId) as any;
    if (!row || row.balance < amount) return false;

    db.prepare('UPDATE user_credits SET balance = balance - ?, total_spent = total_spent + ?, updated_at = ? WHERE privy_id = ?')
      .run(amount, amount, now, privyId);

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, privyId, 'spend', amount, description || 'Prompt', null, now);

    return true;
  });
  return txn() as boolean;
}

export function refundCredits(privyId: string, amount: number, description?: string): void {
  ensureCreditTables();
  const db = getDb();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO user_credits (privy_id, balance, total_deposited, total_spent, updated_at)
      VALUES (?, ?, 0, 0, ?)
      ON CONFLICT(privy_id) DO UPDATE SET
        balance = balance + ?,
        total_spent = total_spent - ?,
        updated_at = ?
    `).run(privyId, amount, now, amount, amount, now);

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, privyId, 'refund', amount, description || 'Refund', null, now);
  });
  txn();
}

export function getCreditTransactions(privyId: string, limit = 20): any[] {
  ensureCreditTables();
  const db = getDb();
  return db.prepare('SELECT * FROM credit_transactions WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?').all(privyId, limit);
}
