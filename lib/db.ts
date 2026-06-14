import Database from 'better-sqlite3';
import path from 'path';
import { CREDITS_PER_USD } from './token-price';
import { WORKER_REVENUE_SHARE, MIN_WITHDRAWAL_USD } from './tokenomics';
import { realizeMargin } from './treasury-ledger';
import { recordReferralEarning, getReferralEarningsTotal } from './referrals';

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
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_user ON completed_jobs(user_privy_id);
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_date ON completed_jobs(completed_at);
  `);
}

// Usage summary for a user (their requests + tokens, overall and per model).
export function getUserUsage(privyId: string): {
  totalRequests: number;
  totalTokens: number;
  byModel: { model: string; requests: number; tokens: number }[];
} {
  ensureWorkerStatsTable();
  const db = getDb();
  const totals = db.prepare(
    'SELECT COUNT(*) AS requests, COALESCE(SUM(tokens_generated), 0) AS tokens FROM completed_jobs WHERE user_privy_id = ?'
  ).get(privyId) as { requests: number; tokens: number };
  const byModel = db.prepare(
    `SELECT COALESCE(model, 'unknown') AS model, COUNT(*) AS requests, COALESCE(SUM(tokens_generated), 0) AS tokens
     FROM completed_jobs WHERE user_privy_id = ? GROUP BY model ORDER BY requests DESC`
  ).all(privyId) as { model: string; requests: number; tokens: number }[];
  return { totalRequests: totals?.requests || 0, totalTokens: totals?.tokens || 0, byModel };
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
      created_at TEXT NOT NULL,
      subsidized INTEGER NOT NULL DEFAULT 0
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
  // Migrate pre-existing DBs: add the subsidized flag if it's missing. Marks
  // treasury-funded free-prompt payouts so they can be capped + reported
  // separately from self-solvent paid earnings. Throws (and we ignore) if the
  // column already exists.
  try { db.exec('ALTER TABLE worker_earnings ADD COLUMN subsidized INTEGER NOT NULL DEFAULT 0'); } catch {}
  // subsidy_kind distinguishes 'free' (onboarding/anon free prompts) from
  // 'allowance' (staker daily allowance). They draw from SEPARATE daily caps, so
  // the free-prompt cap accounting (getTodayFreeSubsidyUsd) must exclude
  // 'allowance' rows. NULL = legacy/paid. Throws (ignored) if it already exists.
  try { db.exec('ALTER TABLE worker_earnings ADD COLUMN subsidy_kind TEXT'); } catch {}
}

// Worker keeps a fixed share of the USD value of credits spent on their job
// (70% base, 80% if they stake enough ZERO); the rest is protocol margin.
// Self-solvent: payout is always a fraction of revenue, so it can never exceed
// what the user paid. Free tier charges 0 credits → 0 payout. The margin is
// realised into the buyback pool here so it's accounted the instant it's earned.
export function recordEarning(data: {
  privyId: string;
  jobId: string;
  tier: 'free' | 'pro' | 'max' | 'image';
  creditsCharged: number;
  tokensGenerated: number;
  revenueShare?: number; // worker's effective share (defaults to base 70%)
  // Worker-pay basis in credits. Defaults to creditsCharged (paid jobs are paid
  // out of their own revenue). For treasury-subsidized free-prompt jobs the
  // caller passes the tier's list price here while creditsCharged stays 0.
  payoutCredits?: number;
  subsidized?: boolean; // true => treasury-funded (free prompt), not self-solvent
  subsidyKind?: 'free' | 'allowance'; // which daily cap it draws from (separate caps)
  // The PAYING user. When set and the job carries real revenue, their referrer
  // earns REFERRAL_REVENUE_SHARE of it, netted from treasury's margin below —
  // worker pay is untouched (split becomes 70/25/5 base, 80/15/5 boosted).
  payerPrivyId?: string;
}): number {
  ensureEarningsTables();
  const db = getDb();

  const revenueUsd = data.creditsCharged / CREDITS_PER_USD;
  const payoutBaseUsd = (data.payoutCredits ?? data.creditsCharged) / CREDITS_PER_USD;
  const share = data.revenueShare ?? WORKER_REVENUE_SHARE;
  const earning = payoutBaseUsd * share;
  if (earning <= 0) return 0;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO worker_earnings (id, privy_id, job_id, tier, tokens, earning_usd, created_at, subsidized, subsidy_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.privyId, data.jobId, data.tier, data.tokensGenerated, earning, now, data.subsidized ? 1 : 0, data.subsidyKind ?? null);

  // Referral cut on self-paid usage only: subsidized jobs carry revenueUsd 0
  // and never book one. Sits after the UNIQUE(job_id) earnings insert, so it's
  // once-per-job like the margin (and double-guarded by UNIQUE in its own table).
  let referralUsd = 0;
  if (data.payerPrivyId && revenueUsd > 0) {
    referralUsd = recordReferralEarning({
      payerPrivyId: data.payerPrivyId,
      jobId: data.jobId,
      tier: data.tier,
      revenueUsd,
    });
  }

  // The insert above is UNIQUE(job_id), so a duplicate job throws before we get
  // here — margin is realised exactly once per job. For a subsidized free job
  // revenue is 0, so this margin is negative and realizeMargin ignores it (the
  // subsidy is a pure treasury outflow, not pool revenue).
  realizeMargin(revenueUsd - earning - referralUsd, data.jobId);
  return earning;
}

// Total USD of FREE-PROMPT treasury-subsidized worker earnings booked since
// 00:00 UTC today. Used to enforce the daily free-prompt subsidy cap. Excludes
// staker-allowance subsidies — those have their own separate daily pool cap, so
// the two never draw from each other's budget.
export function getTodayFreeSubsidyUsd(): number {
  ensureEarningsTables();
  const db = getDb();
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const row = db.prepare(
    "SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE subsidized = 1 AND (subsidy_kind IS NULL OR subsidy_kind != 'allowance') AND created_at >= ?"
  ).get(midnight.toISOString()) as { total: number };
  return row.total;
}

// Same as getTodayFreeSubsidyUsd but bounded to the current UTC hour. Used to
// enforce the hourly sub-cap so one burst can't drain the whole daily budget.
export function getThisHourFreeSubsidyUsd(): number {
  ensureEarningsTables();
  const db = getDb();
  const hourStart = new Date();
  hourStart.setUTCMinutes(0, 0, 0);
  const row = db.prepare(
    "SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE subsidized = 1 AND (subsidy_kind IS NULL OR subsidy_kind != 'allowance') AND created_at >= ?"
  ).get(hourStart.toISOString()) as { total: number };
  return row.total;
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
  // Referral earnings ride the same withdrawal rails: one pending balance,
  // one payout ledger, so requestPayout's double-claim guard covers both.
  return Math.max(0, earningsRow.total + getReferralEarningsTotal(privyId) - payoutsRow.total);
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

export { MIN_WITHDRAWAL_USD };

type WithdrawalResult =
  | { ok: true; payoutId: string; amount: number }
  | { ok: false; reason: 'below_min' | 'insufficient' | 'in_flight' };

/**
 * Create a withdrawal to a worker-supplied address. Atomic: the balance check
 * and the debiting payout row are written in one transaction so two concurrent
 * requests can't drain more than the available balance. The inserted
 * 'pending_transfer' row immediately reduces getPendingBalance; the caller then
 * sends the USDC and flips it to 'completed' (stays deducted) or 'failed'
 * (excluded from the deduction → balance restored).
 */
export function createWithdrawal(privyId: string, walletAddress: string, amount: number): WithdrawalResult {
  ensureEarningsTables();
  const db = getDb();
  const rounded = Math.round(amount * 100) / 100;

  const txn = db.transaction((): WithdrawalResult => {
    if (rounded < MIN_WITHDRAWAL_USD) return { ok: false, reason: 'below_min' };

    const existingPending = db.prepare(
      "SELECT id FROM worker_payouts WHERE privy_id = ? AND status = 'pending_transfer'"
    ).get(privyId);
    if (existingPending) return { ok: false, reason: 'in_flight' };

    if (Math.round(getPendingBalance(privyId) * 100) / 100 + 1e-9 < rounded) return { ok: false, reason: 'insufficient' };

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO worker_payouts (id, privy_id, amount_usd, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, privyId, rounded, walletAddress, 'pending_transfer', now);
    return { ok: true, payoutId: id, amount: rounded };
  });

  return txn();
}

export function markPayoutCompleted(payoutId: string, txHash: string): void {
  ensureEarningsTables();
  const db = getDb();
  db.prepare(
    "UPDATE worker_payouts SET status = 'completed', tx_hash = ?, completed_at = ? WHERE id = ? AND status = 'pending_transfer'"
  ).run(txHash, new Date().toISOString(), payoutId);
}

export function markPayoutFailed(payoutId: string): void {
  ensureEarningsTables();
  const db = getDb();
  db.prepare(
    "UPDATE worker_payouts SET status = 'failed', completed_at = ? WHERE id = ? AND status = 'pending_transfer'"
  ).run(new Date().toISOString(), payoutId);
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

// ── API Keys (public inference API) ──
// Mirrors worker_tokens: store only the sha256 hash, show the raw key once.

function ensureApiKeysTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'default',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked INTEGER DEFAULT 0
    );
  `);
}

function generateApiKey(): string {
  const crypto = require('crypto');
  return 'sk-c0mpute-' + crypto.randomBytes(24).toString('base64url');
}

export function createApiKey(privyId: string, name?: string): string {
  ensureApiKeysTable();
  const db = getDb();
  const key = generateApiKey();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO api_keys (id, privy_id, key_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, privyId, hashToken(key), name || 'default', now);
  return key;
}

// Resolve a raw API key to its owner's privy_id (or null). Updates last_used_at.
export function resolveApiKey(rawKey: string): string | null {
  ensureApiKeysTable();
  const db = getDb();
  const hash = hashToken(rawKey);
  const row = db.prepare(
    'SELECT privy_id FROM api_keys WHERE key_hash = ? AND revoked = 0'
  ).get(hash) as { privy_id: string } | undefined;
  if (!row) return null;
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?').run(new Date().toISOString(), hash);
  return row.privy_id;
}

export function getApiKeys(privyId: string): { id: string; name: string; created_at: string; last_used_at: string | null }[] {
  ensureApiKeysTable();
  const db = getDb();
  return db.prepare(
    'SELECT id, name, created_at, last_used_at FROM api_keys WHERE privy_id = ? AND revoked = 0 ORDER BY created_at DESC'
  ).all(privyId) as any[];
}

export function revokeApiKey(keyId: string, privyId: string): boolean {
  ensureApiKeysTable();
  const db = getDb();
  const result = db.prepare(
    'UPDATE api_keys SET revoked = 1 WHERE id = ? AND privy_id = ?'
  ).run(keyId, privyId);
  return result.changes > 0;
}

// ── Generated images (image-gen feature) ──
// Metadata only; the PNG bytes live on disk at data/images/{id}.png and are
// served by /api/images/[id]. `public` controls gallery visibility, `blocked`
// hard-hides anything a safety check rejected.

function ensureImagesTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      negative_prompt TEXT,
      model TEXT NOT NULL,
      seed INTEGER,
      width INTEGER,
      height INTEGER,
      credits_charged INTEGER NOT NULL,
      nsfw INTEGER DEFAULT 0,
      blocked INTEGER DEFAULT 0,
      public INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_images_created ON images (created_at DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_images_owner ON images (privy_id, created_at DESC);`);
}

export interface ImageRecord {
  id: string;
  privy_id: string;
  prompt: string;
  negative_prompt: string | null;
  model: string;
  seed: number | null;
  width: number | null;
  height: number | null;
  credits_charged: number;
  nsfw: number;
  blocked: number;
  public: number;
  created_at: string;
}

export function recordImage(rec: {
  id: string;
  privyId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  seed?: number;
  width?: number;
  height?: number;
  creditsCharged: number;
  nsfw?: boolean;
  isPublic?: boolean;
}): void {
  ensureImagesTable();
  const db = getDb();
  db.prepare(
    `INSERT INTO images (id, privy_id, prompt, negative_prompt, model, seed, width, height, credits_charged, nsfw, blocked, public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    rec.id, rec.privyId, rec.prompt, rec.negativePrompt || null, rec.model,
    rec.seed ?? null, rec.width ?? null, rec.height ?? null, rec.creditsCharged,
    rec.nsfw ? 1 : 0, rec.isPublic === false ? 0 : 1, new Date().toISOString()
  );
}

export function getImageById(id: string): ImageRecord | null {
  ensureImagesTable();
  const db = getDb();
  return (db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRecord) || null;
}

// Public gallery wall: most recent non-blocked public images.
export function getRecentImages(limit = 60): Array<Pick<ImageRecord, 'id' | 'prompt' | 'model' | 'width' | 'height' | 'created_at'>> {
  ensureImagesTable();
  const db = getDb();
  return db.prepare(
    `SELECT id, prompt, model, width, height, created_at FROM images
     WHERE blocked = 0 AND public = 1 AND nsfw = 0 ORDER BY created_at DESC LIMIT ?`
  ).all(Math.min(200, Math.max(1, limit))) as any[];
}

export function getUserImages(privyId: string, limit = 60): Array<Pick<ImageRecord, 'id' | 'prompt' | 'model' | 'width' | 'height' | 'created_at'>> {
  ensureImagesTable();
  const db = getDb();
  return db.prepare(
    `SELECT id, prompt, model, width, height, created_at FROM images
     WHERE privy_id = ? AND blocked = 0 ORDER BY created_at DESC LIMIT ?`
  ).all(privyId, Math.min(200, Math.max(1, limit))) as any[];
}

// ── Worker Reputation (anti-gaming) ──

// Persistent strike ledger so a kicked/fraudulent worker can't simply reconnect
// to reset its in-memory state. Strikes accumulate across sessions; enough of
// them bans the account from running a worker (it can still use the app normally).
const STRIKES_TO_BAN = 5;

// Canary ban tuning. A canary is a hidden liveness probe; an honest worker passes
// it ~always, a faker (returns canned/garbage text instead of running the model)
// fails ~always. We ban on RECENT behaviour, not a lifetime count, so an honest
// worker that occasionally flubs one never accumulates its way to a permaban:
//   - CONSEC: this many canary fails in a row → ban (a real worker ~never fails
//     several straight; a faker fails every one).
//   - RATIO: over the last WINDOW probes, if there are at least MIN_SAMPLE of them
//     and the fail fraction exceeds MAX_FAIL_RATIO → ban (catches partial fakers).
const CANARY_WINDOW = 20;
const CANARY_MIN_SAMPLE = 8;
const CANARY_MAX_FAIL_RATIO = 0.4;
const CANARY_CONSEC_BAN = 3;

function ensureReputationTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_reputation (
      privy_id TEXT PRIMARY KEY,
      canary_passed INTEGER DEFAULT 0,
      canary_failed INTEGER DEFAULT 0,
      coherence_failed INTEGER DEFAULT 0,
      speed_strikes INTEGER DEFAULT 0,
      total_strikes INTEGER DEFAULT 0,
      banned INTEGER DEFAULT 0,
      ban_reason TEXT,
      banned_at TEXT,
      first_seen TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function ensureReputationRow(privyId: string) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO worker_reputation (privy_id, first_seen, updated_at) VALUES (?, ?, ?) ON CONFLICT(privy_id) DO NOTHING'
  ).run(privyId, now, now);
}

// Per-canary result log, so the ban decision can look at a sliding RECENT window
// instead of a lifetime total. Keeps honest workers from accumulating their way
// to a ban over thousands of jobs.
function ensureCanaryEventsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS canary_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      privy_id TEXT NOT NULL,
      passed INTEGER NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canary_events_privy ON canary_events(privy_id, id);
  `);
}

export function isWorkerBanned(privyId: string): { banned: boolean; reason?: string } {
  ensureReputationTable();
  const db = getDb();
  const row = db.prepare('SELECT banned, ban_reason FROM worker_reputation WHERE privy_id = ?').get(privyId) as any;
  if (!row || !row.banned) return { banned: false };
  return { banned: true, reason: row.ban_reason || undefined };
}

export function recordWorkerStrike(privyId: string, kind: 'canary' | 'coherence' | 'speed'): { totalStrikes: number; banned: boolean } {
  ensureReputationTable();
  ensureReputationRow(privyId);
  const db = getDb();
  const now = new Date().toISOString();
  // canary_failed is incremented by recordCanaryResult; only bump the kind-specific
  // column here for coherence/speed to avoid double-counting canary fails.
  const txn = db.transaction(() => {
    if (kind === 'coherence') {
      db.prepare('UPDATE worker_reputation SET coherence_failed = coherence_failed + 1 WHERE privy_id = ?').run(privyId);
    } else if (kind === 'speed') {
      db.prepare('UPDATE worker_reputation SET speed_strikes = speed_strikes + 1 WHERE privy_id = ?').run(privyId);
    }
    db.prepare('UPDATE worker_reputation SET total_strikes = total_strikes + 1, updated_at = ? WHERE privy_id = ?').run(now, privyId);
    const row = db.prepare('SELECT total_strikes, banned FROM worker_reputation WHERE privy_id = ?').get(privyId) as any;
    let banned = !!row.banned;
    if (!banned && row.total_strikes >= STRIKES_TO_BAN) {
      db.prepare('UPDATE worker_reputation SET banned = 1, ban_reason = ?, banned_at = ? WHERE privy_id = ?')
        .run(`${row.total_strikes} strikes`, now, privyId);
      banned = true;
    }
    return { totalStrikes: row.total_strikes as number, banned };
  });
  return txn();
}

// Records a canary probe result and decides — from RECENT behaviour only — whether
// the worker should be banned. An honest worker that misses one occasionally never
// trips it; a faker that fails repeatedly does. Returns the recent fail stats.
export function recordCanaryResult(privyId: string, passed: boolean): { recentFails: number; recentTotal: number; banned: boolean } {
  ensureReputationTable();
  ensureReputationRow(privyId);
  ensureCanaryEventsTable();
  const db = getDb();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    // Lifetime aggregates, kept for reporting only (no longer drive the ban).
    db.prepare(
      `UPDATE worker_reputation SET ${passed ? 'canary_passed = canary_passed + 1' : 'canary_failed = canary_failed + 1'}, updated_at = ? WHERE privy_id = ?`
    ).run(now, privyId);
    // A clean canary pass also relaxes any lingering coherence/speed strikes, so a
    // worker that's demonstrably alive doesn't carry old strikes forever.
    if (passed) {
      db.prepare('UPDATE worker_reputation SET total_strikes = MAX(0, total_strikes - 1) WHERE privy_id = ?').run(privyId);
    }

    db.prepare('INSERT INTO canary_events (privy_id, passed, at) VALUES (?, ?, ?)').run(privyId, passed ? 1 : 0, now);

    // Look only at the most recent window of probes for this worker.
    const recent = db.prepare(
      'SELECT passed FROM canary_events WHERE privy_id = ? ORDER BY id DESC LIMIT ?'
    ).all(privyId, CANARY_WINDOW) as { passed: number }[];
    const recentTotal = recent.length;
    const recentFails = recent.filter((r) => !r.passed).length;
    let consec = 0; // trailing consecutive fails (recent is newest-first)
    for (const r of recent) { if (!r.passed) consec++; else break; }

    const row = db.prepare('SELECT banned FROM worker_reputation WHERE privy_id = ?').get(privyId) as any;
    let banned = !!row.banned;
    if (!banned) {
      const consecBan = consec >= CANARY_CONSEC_BAN;
      const ratioBan = recentTotal >= CANARY_MIN_SAMPLE && recentFails / recentTotal > CANARY_MAX_FAIL_RATIO;
      if (consecBan || ratioBan) {
        const reason = consecBan ? `${consec} canary fails in a row` : `${recentFails}/${recentTotal} recent canaries failed`;
        db.prepare('UPDATE worker_reputation SET banned = 1, ban_reason = ?, banned_at = ? WHERE privy_id = ?').run(reason, now, privyId);
        banned = true;
      }
    }
    return { recentFails, recentTotal, banned };
  });
  return txn();
}

export function getWorkerReputation(privyId: string): any {
  ensureReputationTable();
  const db = getDb();
  return db.prepare('SELECT * FROM worker_reputation WHERE privy_id = ?').get(privyId) || null;
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

    CREATE TABLE IF NOT EXISTS deposit_progress (
      privy_id TEXT NOT NULL,
      mint TEXT NOT NULL,
      credited_amount REAL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (privy_id, mint)
    );
  `);
}

// How much of a given mint's on-chain balance we've already converted to credits.
export function getDepositProgress(privyId: string, mint: string): number {
  ensureCreditTables();
  const db = getDb();
  const row = db.prepare('SELECT credited_amount FROM deposit_progress WHERE privy_id = ? AND mint = ?').get(privyId, mint) as any;
  return row ? row.credited_amount : 0;
}

export function setDepositProgress(privyId: string, mint: string, creditedAmount: number): void {
  ensureCreditTables();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO deposit_progress (privy_id, mint, credited_amount, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(privy_id, mint) DO UPDATE SET credited_amount = ?, updated_at = ?
  `).run(privyId, mint, creditedAmount, now, creditedAmount, now);
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

// Decrypts a deposit wallet's secret key so the treasury can co-sign a sweep
// of its token balance. Mirrors the AES-256-GCM encryption in
// getOrCreateDepositWallet (format: ivHex:authTagHex:cipherHex).
export function getDepositWalletSecret(privyId: string): Uint8Array | null {
  ensureCreditTables();
  const db = getDb();
  const row = db.prepare('SELECT encrypted_secret FROM deposit_wallets WHERE privy_id = ?').get(privyId) as any;
  if (!row) return null;
  const encKey: string | undefined = process.env.DEPOSIT_WALLET_KEY;
  if (!encKey) throw new Error('[Credits] DEPOSIT_WALLET_KEY not set');
  const cryptoMod = require('crypto');
  const [ivHex, tagHex, dataHex] = (row.encrypted_secret as string).split(':');
  const decipher = cryptoMod.createDecipheriv('aes-256-gcm', Buffer.from(encKey, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return new Uint8Array(decrypted);
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

// ── Free onboarding prompts ──
//
// Each X account gets a fixed allowance of free Pro-tier prompts so a brand-new
// signup (0 credits after the free tier was removed) can try the product before
// topping up USDC. Tracked per privy_id; consumed atomically so concurrent
// submits can't overrun the limit.

function ensureFreePromptTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS free_prompt_usage (
      privy_id TEXT PRIMARY KEY,
      used INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getFreePromptsUsed(privyId: string): number {
  ensureFreePromptTable();
  const db = getDb();
  const row = db.prepare('SELECT used FROM free_prompt_usage WHERE privy_id = ?').get(privyId) as any;
  return row ? row.used : 0;
}

// Atomically consumes one free prompt if the account is under the limit.
// Returns true if a free prompt was used (so the caller should NOT charge credits).
export function consumeFreePrompt(privyId: string, limit: number): boolean {
  ensureFreePromptTable();
  const db = getDb();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    const row = db.prepare('SELECT used FROM free_prompt_usage WHERE privy_id = ?').get(privyId) as any;
    const used = row ? row.used : 0;
    if (used >= limit) return false;

    db.prepare(`
      INSERT INTO free_prompt_usage (privy_id, used, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(privy_id) DO UPDATE SET used = used + 1, updated_at = ?
    `).run(privyId, now, now);
    return true;
  });
  return txn() as boolean;
}

// ── Free image generations (separate pool from free prompts) ──────────────
function ensureFreeImageTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS free_image_usage (
      privy_id TEXT PRIMARY KEY,
      used INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getFreeImagesUsed(privyId: string): number {
  ensureFreeImageTable();
  const db = getDb();
  const row = db.prepare('SELECT used FROM free_image_usage WHERE privy_id = ?').get(privyId) as any;
  return row ? row.used : 0;
}

// Atomically consume one free image if under the limit. Returns true if a free
// image was used (caller should NOT charge credits).
export function consumeFreeImage(privyId: string, limit: number): boolean {
  ensureFreeImageTable();
  const db = getDb();
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT used FROM free_image_usage WHERE privy_id = ?').get(privyId) as any;
    const used = row ? row.used : 0;
    if (used >= limit) return false;
    db.prepare(`
      INSERT INTO free_image_usage (privy_id, used, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(privy_id) DO UPDATE SET used = used + 1, updated_at = ?
    `).run(privyId, now, now);
    return true;
  });
  return txn() as boolean;
}

// Give a free image back (e.g. the render failed after we consumed one).
export function refundFreeImage(privyId: string): void {
  ensureFreeImageTable();
  const db = getDb();
  db.prepare("UPDATE free_image_usage SET used = MAX(0, used - 1) WHERE privy_id = ?").run(privyId);
}

// ── Anonymous (pre-login) free prompts ─────────────────────────────────────
// A visitor can run free prompts before logging in. Two counters guard it:
//   1. Per-session: reuses free_prompt_usage keyed on "anon:<aid>" (the signed
//      anon token's id) — caps each session at ANON_FREE_PROMPT_LIMIT.
//   2. Per-IP/day: anon_ip_daily caps how many free prompts a single IP can
//      dispense per UTC day, so clearing cookies to mint a fresh session is
//      bounded (the IP ceiling still bites). On top of these, the global
//      FREE_SUBSIDY_DAILY_CAP_USD is enforced at payout time in the orchestrator.
function ensureAnonTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS anon_ip_daily (
      ip_hash TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (ip_hash, day)
    );
  `);
}

/** Free prompts still available to this anonymous session (read-only). */
export function getAnonRemaining(aid: string, sessionLimit: number): number {
  ensureFreePromptTable();
  const db = getDb();
  const row = db.prepare('SELECT used FROM free_prompt_usage WHERE privy_id = ?').get('anon:' + aid) as any;
  return Math.max(0, sessionLimit - (row ? row.used : 0));
}

/**
 * Atomically grant one anonymous free prompt if BOTH the per-session limit and
 * the per-IP daily cap allow it. Only increments the counters when granted.
 * Returns the reason for a denial so the UI can show the right popup.
 */
export function anonGrantFreePrompt(
  aid: string,
  ipHash: string,
  sessionLimit: number,
  ipDailyCap: number
): { granted: boolean; reason?: 'session' | 'ip'; remaining: number } {
  ensureFreePromptTable();
  ensureAnonTable();
  const db = getDb();
  const now = new Date().toISOString();
  const day = now.slice(0, 10); // UTC date (YYYY-MM-DD)
  const sessionId = 'anon:' + aid;

  const txn = db.transaction(() => {
    const sRow = db.prepare('SELECT used FROM free_prompt_usage WHERE privy_id = ?').get(sessionId) as any;
    const sUsed = sRow ? sRow.used : 0;
    if (sUsed >= sessionLimit) return { granted: false, reason: 'session' as const, remaining: 0 };

    const iRow = db.prepare('SELECT count FROM anon_ip_daily WHERE ip_hash = ? AND day = ?').get(ipHash, day) as any;
    const iUsed = iRow ? iRow.count : 0;
    if (iUsed >= ipDailyCap) return { granted: false, reason: 'ip' as const, remaining: sessionLimit - sUsed };

    db.prepare(`
      INSERT INTO free_prompt_usage (privy_id, used, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(privy_id) DO UPDATE SET used = used + 1, updated_at = ?
    `).run(sessionId, now, now);
    db.prepare(`
      INSERT INTO anon_ip_daily (ip_hash, day, count)
      VALUES (?, ?, 1)
      ON CONFLICT(ip_hash, day) DO UPDATE SET count = count + 1
    `).run(ipHash, day);
    return { granted: true, remaining: sessionLimit - sUsed - 1 };
  });
  return txn() as { granted: boolean; reason?: 'session' | 'ip'; remaining: number };
}

export function getCreditTransactions(privyId: string, limit = 20): any[] {
  ensureCreditTables();
  const db = getDb();
  return db.prepare('SELECT * FROM credit_transactions WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?').all(privyId, limit);
}
