// Boot guard: refuse to serve a ledger denominated in the wrong credit.
//
// CREDITS_PER_USD moved 100 -> 1000 in the per-token repricing, and every stored
// balance predates it. scripts/migrate-credit-redenomination.ts multiplies the
// ledger by 10 to match. If the code ships without the migration, every user's
// balance is silently worth a tenth of what it was; if the code is rolled back
// after the migration ran, every balance is worth ten times too much. Both are
// quiet — nothing throws, the numbers just stop meaning what they say.
//
// So make it loud, once, at startup. This is a cheap read of one row that
// collapses both failure modes into a refusal to boot with the fix in the
// message.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CREDITS_PER_USD } from './token-price';

const MARKER = 'credit-redenomination-x10';

/**
 * Exits the process if this build's credit denomination does not match the
 * database's. Safe to call before anything else is wired up.
 *
 * A database with no ledger in it passes: a fresh installation has no balances
 * to be wrong about, and blocking a first deploy would be a worse failure than
 * the one this prevents. The check is about DATA in the old denomination, not
 * about the marker as paperwork.
 */
export function assertCreditDenomination(dbPath = path.join(process.cwd(), 'data', 'c0mpute.db')): void {
  // Only the redenominated build can be ahead of its ledger. An older build
  // (CREDITS_PER_USD = 100) against a migrated database is the rollback case,
  // which this cannot detect from here — the old build does not contain this
  // file. deploy.sh is where that direction is handled.
  if (CREDITS_PER_USD !== 1000) return;
  if (!fs.existsSync(dbPath)) return; // nothing has ever been stored

  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return; // unreadable here is not this guard's business to diagnose
  }

  try {
    const hasLedger = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_credits'")
      .get() as { name: string } | undefined;
    if (!hasLedger) return;

    const balances = db.prepare('SELECT COUNT(*) AS c FROM user_credits').get() as { c: number };
    if (balances.c === 0) return; // no balances, nothing to denominate

    const hasMigrations = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get() as { name: string } | undefined;
    const applied = hasMigrations
      ? (db.prepare('SELECT applied_at FROM schema_migrations WHERE name = ?').get(MARKER) as
          | { applied_at: string }
          | undefined)
      : undefined;
    if (applied) return;

    console.error(
      '\n[FATAL] This build prices a credit at $0.001 (CREDITS_PER_USD = 1000), but this\n' +
        `        database has ${balances.c} credit balance(s) and has never been redenominated.\n` +
        '        Serving it would make every stored balance worth a tenth of what it says.\n\n' +
        '        Run the migration against this database, then start again:\n' +
        '          npx tsx scripts/migrate-credit-redenomination.ts --dry-run\n' +
        '          npx tsx scripts/migrate-credit-redenomination.ts\n\n' +
        '        If you meant to roll back instead, deploy the build that prices a credit\n' +
        '        at $0.01 — but note the migration is one-way, so a rolled-back build will\n' +
        `        read every balance as ten times too large.\n        (database: ${dbPath})\n`
    );
    process.exit(1);
  } finally {
    try { db.close(); } catch { /* closing a read-only handle cannot lose data */ }
  }
}
