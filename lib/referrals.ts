// Referral system — Phase 1: attribution.
// A user shares c0mpute.ai/r/<code>; the code is stored client-side and bound
// permanently at signup (new accounts only). Earnings (5% of referred PAID
// usage, netted from treasury's revenue share) are Phase 2 and hang off the
// `referrals` table written here.
import crypto from 'crypto';
import path from 'path';
import Database from 'better-sqlite3';
import { REFERRAL_REVENUE_SHARE } from './tokenomics';

// No look-alike chars (0/O, 1/l/I) — codes get typed from screenshots.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;
export const REFERRAL_CODE_RE = /^[a-z0-9]{4,12}$/;

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

function ensureReferralTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      privy_id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referrals (
      referee_privy_id TEXT PRIMARY KEY,
      referrer_privy_id TEXT NOT NULL,
      code TEXT NOT NULL,
      bound_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_privy_id);
    CREATE TABLE IF NOT EXISTS referral_earnings (
      id TEXT PRIMARY KEY,
      referrer_privy_id TEXT NOT NULL,
      referee_privy_id TEXT NOT NULL,
      job_id TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL,
      usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings(referrer_privy_id);
  `);
}

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function getOrCreateReferralCode(privyId: string): string {
  ensureReferralTables();
  const db = getDb();
  const existing = db.prepare('SELECT code FROM referral_codes WHERE privy_id = ?').get(privyId) as
    | { code: string }
    | undefined;
  if (existing) return existing.code;
  // Retry on the (unlikely) unique collision.
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      db.prepare('INSERT INTO referral_codes (privy_id, code, created_at) VALUES (?, ?, ?)').run(
        privyId,
        code,
        new Date().toISOString()
      );
      return code;
    } catch (e: unknown) {
      // UNIQUE violation on code → retry; on privy_id → another request won the race
      const raced = db.prepare('SELECT code FROM referral_codes WHERE privy_id = ?').get(privyId) as
        | { code: string }
        | undefined;
      if (raced) return raced.code;
    }
  }
  throw new Error('could not allocate referral code');
}

export function getReferrerByCode(code: string): string | null {
  ensureReferralTables();
  if (!REFERRAL_CODE_RE.test(code)) return null;
  const db = getDb();
  const row = db.prepare('SELECT privy_id FROM referral_codes WHERE code = ?').get(code) as
    | { privy_id: string }
    | undefined;
  return row?.privy_id ?? null;
}

/**
 * Bind a referee to a referrer at signup. Caller is responsible for the
 * "new account only" check (we never rebind: PRIMARY KEY on referee).
 * Returns true if a binding was written.
 */
export function bindReferral(refereePrivyId: string, code: string): boolean {
  ensureReferralTables();
  const referrer = getReferrerByCode(code.toLowerCase().trim());
  if (!referrer) return false;
  if (referrer === refereePrivyId) return false; // no self-referral
  const db = getDb();
  try {
    db.prepare(
      'INSERT INTO referrals (referee_privy_id, referrer_privy_id, code, bound_at) VALUES (?, ?, ?, ?)'
    ).run(refereePrivyId, referrer, code.toLowerCase().trim(), new Date().toISOString());
    return true;
  } catch {
    return false; // already bound — first binding wins, permanent
  }
}

export function getReferrerOf(refereePrivyId: string): string | null {
  ensureReferralTables();
  const db = getDb();
  const row = db
    .prepare('SELECT referrer_privy_id FROM referrals WHERE referee_privy_id = ?')
    .get(refereePrivyId) as { referrer_privy_id: string } | undefined;
  return row?.referrer_privy_id ?? null;
}

/**
 * Phase 2 — the 5%. Called from recordEarning for every PAID job (revenue > 0;
 * subsidized free/allowance jobs carry zero revenue and never reach here).
 * Returns the referral USD booked (0 when the payer has no referrer), which
 * the caller nets out of treasury's margin — worker pay is untouched.
 */
export function recordReferralEarning(data: {
  payerPrivyId: string;
  jobId: string;
  tier: string;
  revenueUsd: number;
}): number {
  ensureReferralTables();
  if (data.revenueUsd <= 0) return 0;
  const referrer = getReferrerOf(data.payerPrivyId);
  if (!referrer) return 0;
  const usd = data.revenueUsd * REFERRAL_REVENUE_SHARE;
  const db = getDb();
  try {
    db.prepare(
      'INSERT INTO referral_earnings (id, referrer_privy_id, referee_privy_id, job_id, tier, usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), referrer, data.payerPrivyId, data.jobId, data.tier, usd, new Date().toISOString());
    return usd;
  } catch {
    return 0; // UNIQUE(job_id) — never book the same job twice
  }
}

export function getReferralEarningsTotal(privyId: string): number {
  ensureReferralTables();
  const db = getDb();
  const row = db
    .prepare('SELECT COALESCE(SUM(usd), 0) AS total FROM referral_earnings WHERE referrer_privy_id = ?')
    .get(privyId) as { total: number };
  return row.total;
}

export function getReferralStats(privyId: string) {
  ensureReferralTables();
  const db = getDb();
  const code = getOrCreateReferralCode(privyId);
  const referred = db
    .prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_privy_id = ?')
    .get(privyId) as { n: number };
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const earnedMonth = db
    .prepare('SELECT COALESCE(SUM(usd), 0) AS total FROM referral_earnings WHERE referrer_privy_id = ? AND created_at >= ?')
    .get(privyId, monthStart.toISOString()) as { total: number };
  const recent = db
    .prepare('SELECT tier, usd, created_at FROM referral_earnings WHERE referrer_privy_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(privyId) as Array<{ tier: string; usd: number; created_at: string }>;
  return {
    code,
    link: `https://c0mpute.ai/r/${code}`,
    referredCount: referred.n,
    earnedUsd: getReferralEarningsTotal(privyId),
    earnedUsdThisMonth: earnedMonth.total,
    recent,
  };
}
