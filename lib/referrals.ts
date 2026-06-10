// Referral system — Phase 1: attribution.
// A user shares c0mpute.ai/r/<code>; the code is stored client-side and bound
// permanently at signup (new accounts only). Earnings (5% of referred PAID
// usage, netted from treasury's revenue share) are Phase 2 and hang off the
// `referrals` table written here.
import crypto from 'crypto';
import path from 'path';
import Database from 'better-sqlite3';

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

export function getReferralStats(privyId: string) {
  ensureReferralTables();
  const db = getDb();
  const code = getOrCreateReferralCode(privyId);
  const referred = db
    .prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_privy_id = ?')
    .get(privyId) as { n: number };
  return { code, link: `https://c0mpute.ai/r/${code}`, referredCount: referred.n };
}
