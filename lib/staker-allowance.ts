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
// Gated by the STAKER_ALLOWANCE_ENABLED env flag. Reuses the same treasury
// subsidy lane as the free-prompt feature: the user pays 0, the worker is still
// paid, funded by the treasury — see the orchestrator billing + completion paths.
//
// The per-day METERING lives in lib/allowance.ts now -- this file kept the only
// copy of it until plan and free grants needed the same thing, so the draw /
// refund / midnight machinery moved there and 'staker' became one source among
// several. Everything this module exports behaves exactly as it did: same
// signatures, same pool ceiling, same active-staker gate, same day-keyed refund.
// What is left here is the part that is genuinely about STAKING -- who is
// eligible, and what their pro-rata share of the pool comes to.
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
import { drawAllowance, refundAllowance, getAllowanceUsed, getSourceUsedToday, utcDay } from './allowance';

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
    _db.pragma('journal_mode = WAL');
    // staker_allowance_usage is NOT created here any more: lib/allowance.ts owns
    // the metering table and carries this one's live rows over on first use.
    // Existing databases keep theirs -- it is the migration's source, and the
    // way back if this release is rolled back.
    //
    // DEPLOY NOTE: restart the orchestrator and the Next.js server together.
    // Both hold this database, and while one is on the old build it keeps
    // writing the old table where the new build cannot see it. The carry-over
    // takes the higher of the two counts so the gap can never re-grant, but it
    // only runs at process start -- a staggered deploy leaves one process
    // metering a stale bucket until it restarts.
    _db.exec(`
      CREATE TABLE IF NOT EXISTS staker_last_request (
        privy_id TEXT PRIMARY KEY,
        last_request_at TEXT NOT NULL
      );
    `);
  }
  return _db;
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
 * Atomically draw `credits` from the user's daily allowance. Returns the UTC day
 * the draw was written to (the usage row's key), or null if the draw failed.
 * Callers that may later refund MUST keep that day and hand it back to
 * refundStakerAllowance — usage is per-day, so a job charged at 23:59 and failed
 * at 00:01 has to be settled against the row it was charged to. Enforces BOTH the
 * per-user allowance and the global daily pool ceiling, so the total subsidy is
 * hard-bounded.
 */
export function drawStakerAllowance(privyId: string, credits: number): string | null {
  if (!STAKER_ALLOWANCE_ENABLED || credits <= 0) return null;
  return drawAllowance(privyId, 'staker', credits, {
    // Resolved inside the engine's transaction, exactly as before: the stake
    // formula reads live rows, and computing it beforehand would leave a gap
    // between what the user is owed and what they take.
    resolveAllowance: () => computeDailyAllowance(privyId),
    dailyPoolCredits: STAKER_ALLOWANCE_DAILY_POOL_CREDITS,
  });
}

/** Boolean form of drawStakerAllowance, for callers that never refund a draw. */
export function consumeStakerAllowance(privyId: string, credits: number): boolean {
  return drawStakerAllowance(privyId, credits) !== null;
}

/**
 * Give back allowance credits drawn earlier (e.g. an image generation that was
 * charged to the allowance then failed). Decrements that day's usage so the
 * staker isn't billed for work that didn't complete.
 *
 * `day` defaults to today, but a caller that crossed midnight UTC between the
 * draw and the failure MUST pass the day drawStakerAllowance returned: keying on
 * "now" would decrement a row the charge was never written to, permanently
 * burning the staker's allowance for an undelivered job while inflating the new
 * day's remaining balance. Bounded by MAX(0, …) per row, so it can never credit
 * back allowance that wasn't drawn.
 */
export function refundStakerAllowance(privyId: string, credits: number, day: string = utcDay()): void {
  // Deliberately NOT gated on STAKER_ALLOWANCE_ENABLED: a draw made while the
  // flag was on must still be refundable after it is turned off.
  refundAllowance(privyId, 'staker', credits, day);
}

/**
 * Network-wide allowance usage today (for the treasury dashboard). creditsToday =
 * free-inference credits drawn by all stakers since 00:00 UTC; subsidyUsd = the
 * treasury's cost for it (the worker's base cut of those credits' list value).
 */
export function getStakerAllowanceTodayTotals(): { creditsToday: number; subsidyUsd: number } {
  if (!STAKER_ALLOWANCE_ENABLED) return { creditsToday: 0, subsidyUsd: 0 };
  const creditsToday = getSourceUsedToday('staker');
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
  const allowance = computeDailyAllowance(privyId);
  const used = getAllowanceUsed(privyId, 'staker');
  return { enabled: true, dailyAllowance: allowance, usedToday: used, remaining: Math.max(0, allowance - used) };
}
