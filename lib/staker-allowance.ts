// Staker inference allowance — the Venice "stake → daily free inference" model.
//
// Matured-stake holders draw a daily, pro-rata allowance of FREE inference from
// a HARD-CAPPED daily pool before they pay USDC. The pool is the only cost knob:
// worst-case daily worker subsidy = POOL credits × worker share ÷ CREDITS_PER_USD,
// fully bounded no matter how many people stake (so it can never blow up like the
// retired 2x-credit bonus). A staker only counts toward (and only draws from) the
// pool if they've made a request in the last STAKER_ALLOWANCE_ACTIVE_DAYS — idle
// farmers don't dilute active users (Venice's active-staker gate).
//
// FLAGGED OFF by default (STAKER_ALLOWANCE_ENABLED). Reuses the same treasury
// subsidy lane as the free-prompt feature: the user pays 0, the worker is still
// paid, funded by the treasury — see the orchestrator billing + completion paths.
//
// Mirrors the codebase pattern of a per-module sqlite handle on data/c0mpute.db
// (WAL, so multiple connections to the same file are fine).

import Database from 'better-sqlite3';
import path from 'path';
import { getEligibleStakers, getMaturedStake } from './staking';
import {
  STAKER_ALLOWANCE_ENABLED,
  STAKER_ALLOWANCE_DAILY_POOL_CREDITS,
  STAKER_ALLOWANCE_MAX_SHARE,
  STAKER_ALLOWANCE_ACTIVE_DAYS,
  STAKER_ALLOWANCE_REQUIRE_ACTIVE,
  STAKER_ALLOWANCE_ALLOWLIST,
  STAKE_MIN_AGE_MS,
  WORKER_REVENUE_SHARE,
} from './tokenomics';
import { CREDITS_PER_USD } from './token-price';

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS staker_allowance_usage (
        privy_id TEXT NOT NULL,
        day TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (privy_id, day)
      );
      CREATE TABLE IF NOT EXISTS staker_last_request (
        privy_id TEXT PRIMARY KEY,
        last_request_at TEXT NOT NULL
      );
    `);
  }
  return _db;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Record that a user made a request — drives the active-staker gate. */
export function recordStakerRequest(privyId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO staker_last_request (privy_id, last_request_at) VALUES (?, ?)
     ON CONFLICT(privy_id) DO UPDATE SET last_request_at = ?`
  ).run(privyId, now, now);
}

function eligibleByAllowlist(privyId: string): boolean {
  return STAKER_ALLOWANCE_ALLOWLIST.length === 0 || STAKER_ALLOWANCE_ALLOWLIST.includes(privyId);
}

function isActive(privyId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT last_request_at FROM staker_last_request WHERE privy_id = ?').get(privyId) as
    | { last_request_at: string }
    | undefined;
  if (!row) return false;
  return Date.now() - new Date(row.last_request_at).getTime() <= STAKER_ALLOWANCE_ACTIVE_DAYS * 86_400_000;
}

/** matured stake per privy_id across custodial + on-chain self-custody stakers. */
function stakersMaturedByPrivy(): Map<string, number> {
  const db = getDb();
  const map = new Map<string, number>();
  // Custodial matured (getEligibleStakers already returns only the matured portion).
  for (const s of getEligibleStakers()) {
    map.set(s.privyId, (map.get(s.privyId) ?? 0) + s.stakedAmount);
  }
  // On-chain matured (keyed by owner wallet → resolve to privy_id via profiles).
  try {
    const rows = db.prepare('SELECT owner, amount, since FROM onchain_stake_lots').all() as {
      owner: string;
      amount: number;
      since: string;
    }[];
    const cutoff = Date.now() - STAKE_MIN_AGE_MS;
    const byOwner = new Map<string, number>();
    for (const r of rows) {
      if (new Date(r.since).getTime() <= cutoff) byOwner.set(r.owner, (byOwner.get(r.owner) ?? 0) + r.amount);
    }
    for (const [owner, mature] of byOwner) {
      const prof = db.prepare('SELECT privy_id FROM profiles WHERE wallet_address = ?').get(owner) as
        | { privy_id: string }
        | undefined;
      if (prof) map.set(prof.privy_id, (map.get(prof.privy_id) ?? 0) + mature);
    }
  } catch {
    /* onchain_stake_lots not created yet */
  }
  return map;
}

/** Total matured stake among ACTIVE stakers (the pro-rata denominator). */
function activeStakersTotalMatured(): number {
  let total = 0;
  for (const [pid, mature] of stakersMaturedByPrivy()) {
    if (mature > 0 && (!STAKER_ALLOWANCE_REQUIRE_ACTIVE || isActive(pid)) && eligibleByAllowlist(pid)) total += mature;
  }
  return total;
}

/**
 * A user's daily allowance in credits = (their matured stake ÷ matured stake of
 * all active stakers) × pool, capped at STAKER_ALLOWANCE_MAX_SHARE of the pool.
 * 0 if disabled, no matured stake, or not an active staker.
 */
export function computeDailyAllowance(privyId: string): number {
  if (!STAKER_ALLOWANCE_ENABLED) return 0;
  if (!eligibleByAllowlist(privyId)) return 0;
  const mine = getMaturedStake(privyId);
  if (mine <= 0) return 0;
  if (STAKER_ALLOWANCE_REQUIRE_ACTIVE && !isActive(privyId)) return 0;
  const totalActive = activeStakersTotalMatured();
  if (totalActive <= 0) return 0;
  let share = (mine / totalActive) * STAKER_ALLOWANCE_DAILY_POOL_CREDITS;
  const cap = STAKER_ALLOWANCE_MAX_SHARE * STAKER_ALLOWANCE_DAILY_POOL_CREDITS;
  if (share > cap) share = cap;
  return Math.floor(share);
}

/**
 * Atomically draw `credits` from the user's daily allowance. Returns true if the
 * draw succeeded (caller must then charge the user 0 and pay the worker from the
 * subsidy lane). Enforces BOTH the per-user allowance and the global daily pool
 * ceiling, so the total subsidy is hard-bounded.
 */
export function consumeStakerAllowance(privyId: string, credits: number): boolean {
  if (!STAKER_ALLOWANCE_ENABLED || credits <= 0) return false;
  const db = getDb();
  const day = utcDay();
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const allowance = computeDailyAllowance(privyId);
    if (allowance <= 0) return false;
    const usedRow = db.prepare('SELECT used FROM staker_allowance_usage WHERE privy_id = ? AND day = ?').get(privyId, day) as
      | { used: number }
      | undefined;
    const used = usedRow?.used ?? 0;
    if (used + credits > allowance) return false; // exceeds this user's allowance
    const globalUsed = (db.prepare('SELECT COALESCE(SUM(used), 0) AS total FROM staker_allowance_usage WHERE day = ?').get(day) as {
      total: number;
    }).total;
    if (globalUsed + credits > STAKER_ALLOWANCE_DAILY_POOL_CREDITS) return false; // global pool exhausted
    db.prepare(
      `INSERT INTO staker_allowance_usage (privy_id, day, used, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(privy_id, day) DO UPDATE SET used = used + ?, updated_at = ?`
    ).run(privyId, day, credits, now, credits, now);
    return true;
  });
  return txn() as boolean;
}

/**
 * Give back allowance credits drawn earlier today (e.g. an image generation that
 * was charged to the allowance then failed). Decrements today's usage so the
 * staker isn't billed for work that didn't complete.
 */
export function refundStakerAllowance(privyId: string, credits: number): void {
  if (credits <= 0) return;
  const db = getDb();
  db.prepare(
    'UPDATE staker_allowance_usage SET used = MAX(0, used - ?), updated_at = ? WHERE privy_id = ? AND day = ?'
  ).run(credits, new Date().toISOString(), privyId, utcDay());
}

/**
 * Network-wide allowance usage today (for the treasury dashboard). creditsToday =
 * free-inference credits drawn by all stakers since 00:00 UTC; subsidyUsd = the
 * treasury's cost for it (the worker's base cut of those credits' list value).
 */
export function getStakerAllowanceTodayTotals(): { creditsToday: number; subsidyUsd: number } {
  if (!STAKER_ALLOWANCE_ENABLED) return { creditsToday: 0, subsidyUsd: 0 };
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(used), 0) AS used FROM staker_allowance_usage WHERE day = ?').get(utcDay()) as {
    used: number;
  };
  const creditsToday = row.used;
  const subsidyUsd = (creditsToday / CREDITS_PER_USD) * WORKER_REVENUE_SHARE;
  return { creditsToday, subsidyUsd };
}

/** Allowance status for the UI / status endpoints. */
export function getStakerAllowanceStatus(privyId: string): {
  enabled: boolean;
  dailyAllowance: number;
  usedToday: number;
  remaining: number;
} {
  if (!STAKER_ALLOWANCE_ENABLED) return { enabled: false, dailyAllowance: 0, usedToday: 0, remaining: 0 };
  const db = getDb();
  const allowance = computeDailyAllowance(privyId);
  const row = db.prepare('SELECT used FROM staker_allowance_usage WHERE privy_id = ? AND day = ?').get(privyId, utcDay()) as
    | { used: number }
    | undefined;
  const used = row?.used ?? 0;
  return { enabled: true, dailyAllowance: allowance, usedToday: used, remaining: Math.max(0, allowance - used) };
}
