// The daily allowance engine.
//
// One mechanism, several sources. A user can hold more than one daily bucket of
// free-to-them inference at once — a plan grant they prepaid for, the standing
// Free grant, a pro-rata share of the staker pool — and every one of them wants
// the same four properties:
//
//   * metered per user per UTC day, use-or-lose (no carry-over, no accrual)
//   * drawn ATOMICALLY, so two concurrent submits cannot overrun the bucket
//   * refundable AGAINST THE DAY IT WAS DRAWN FROM, because a job charged at
//     23:59 and settled at 00:01 must release against the row it took from
//   * optionally bounded by a global daily ceiling across all users
//
// This is the staker-allowance machinery, lifted out and given a source column.
// It was already the subscription engine; it just had one caller. Building a
// second copy for plans would have meant two atomic draw paths, two midnight
// conventions and two refund bugs to find separately.
//
// The per-user allowance arrives as a THUNK rather than a number because the
// staker source computes its allowance from live stake and has always done so
// inside the draw transaction. Passing a value computed beforehand would open a
// window between "what you are owed" and "what you took".

import Database from 'better-sqlite3';
import path from 'path';

/**
 * Where a day's allowance came from. Each source is a separate bucket with its
 * own ceiling — they never draw from one another.
 *
 *   staker — pro-rata share of the capped staking pool (lib/staker-allowance.ts)
 *   plan   — a paid plan's daily grant; prepaid revenue, no global ceiling
 *   free   — the standing signed-in grant; treasury-subsidized, and gated by
 *            the free-subsidy USD caps at the orchestrator rather than here
 */
export type AllowanceSource = 'staker' | 'plan' | 'free';

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS daily_allowance_usage (
        privy_id TEXT NOT NULL,
        source TEXT NOT NULL,
        day TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (privy_id, source, day)
      );
    `);
    // Carry today's live staker usage over from the single-source table this
    // engine replaces. Without it, the first request after a deploy reads an
    // empty bucket and every staker gets a second full allowance for the day.
    //
    // Only today and later: a draw only ever reads the current day's row, so
    // history is not worth copying, and bounding it keeps this cheap to run on
    // every boot. INSERT OR IGNORE, so it can never overwrite a row this engine
    // has already written -- which is what makes it safe to run every time
    // rather than once behind a marker.
    try {
      _db.prepare(
        `INSERT OR IGNORE INTO daily_allowance_usage (privy_id, source, day, used, updated_at)
         SELECT privy_id, 'staker', day, used, updated_at FROM staker_allowance_usage WHERE day >= ?`
      ).run(utcDay());
    } catch {
      /* staker_allowance_usage not created yet -- nothing to carry over */
    }
  }
  return _db;
}

/** YYYY-MM-DD in UTC. The day boundary for every source. */
export function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DrawOptions {
  /**
   * The user's allowance for today, in credits. Called INSIDE the draw
   * transaction so a live-computed allowance and the usage it is checked
   * against are read atomically.
   */
  resolveAllowance: () => number;
  /**
   * Optional ceiling on what ALL users may draw from this source today. The
   * staker pool has one (it is a fixed treasury budget); plan grants do not,
   * because the plan purchase already paid for them.
   */
  dailyPoolCredits?: number;
}

/**
 * Atomically draw `credits` from a user's daily bucket.
 *
 * Returns the UTC day the draw was written to, or null if it did not fit. A
 * caller that may later refund MUST keep that day and hand it back to
 * refundAllowance -- usage is per-day, and settling against "now" would
 * decrement a row the charge never touched.
 *
 * All-or-nothing: a draw that exceeds what is left takes nothing. Partial draws
 * would mean a job funded half by the grant and half by the balance, and every
 * refund path downstream would have to split the same way.
 */
export function drawAllowance(
  privyId: string,
  source: AllowanceSource,
  credits: number,
  opts: DrawOptions,
): string | null {
  if (credits <= 0) return null;
  const db = getDb();
  const day = utcDay();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    const allowance = opts.resolveAllowance();
    if (allowance <= 0) return false;

    const usedRow = db
      .prepare('SELECT used FROM daily_allowance_usage WHERE privy_id = ? AND source = ? AND day = ?')
      .get(privyId, source, day) as { used: number } | undefined;
    if ((usedRow?.used ?? 0) + credits > allowance) return false;

    if (opts.dailyPoolCredits !== undefined) {
      const poolUsed = (
        db
          .prepare('SELECT COALESCE(SUM(used), 0) AS total FROM daily_allowance_usage WHERE source = ? AND day = ?')
          .get(source, day) as { total: number }
      ).total;
      if (poolUsed + credits > opts.dailyPoolCredits) return false;
    }

    db.prepare(
      `INSERT INTO daily_allowance_usage (privy_id, source, day, used, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(privy_id, source, day) DO UPDATE SET used = used + ?, updated_at = ?`
    ).run(privyId, source, day, credits, now, credits, now);
    return true;
  });

  return (txn() as boolean) ? day : null;
}

/**
 * Give back credits drawn earlier -- an unused reservation released at
 * settlement, or a job that never produced an answer.
 *
 * `day` must be the one drawAllowance returned. Bounded by MAX(0, ...) per row,
 * so it can never hand back allowance that was not drawn.
 */
export function refundAllowance(
  privyId: string,
  source: AllowanceSource,
  credits: number,
  day: string = utcDay(),
): void {
  if (credits <= 0) return;
  getDb()
    .prepare(
      'UPDATE daily_allowance_usage SET used = MAX(0, used - ?), updated_at = ? WHERE privy_id = ? AND source = ? AND day = ?'
    )
    .run(credits, new Date().toISOString(), privyId, source, day);
}

/** What this user has drawn from this source today. */
export function getAllowanceUsed(privyId: string, source: AllowanceSource, day: string = utcDay()): number {
  const row = getDb()
    .prepare('SELECT used FROM daily_allowance_usage WHERE privy_id = ? AND source = ? AND day = ?')
    .get(privyId, source, day) as { used: number } | undefined;
  return row?.used ?? 0;
}

/** What every user together has drawn from this source today. */
export function getSourceUsedToday(source: AllowanceSource, day: string = utcDay()): number {
  return (
    getDb()
      .prepare('SELECT COALESCE(SUM(used), 0) AS total FROM daily_allowance_usage WHERE source = ? AND day = ?')
      .get(source, day) as { total: number }
  ).total;
}
