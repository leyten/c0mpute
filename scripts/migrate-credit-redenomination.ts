/**
 * Credit redenomination: 1 credit goes from $0.01 to $0.001.
 *
 * CREDITS_PER_USD moved 100 -> 1000 in the same release (lib/token-price.ts).
 * That constant is the ONLY thing standing between a stored credit figure and a
 * dollar, so flipping it without this script silently devalues every balance,
 * every allowance and every line of history tenfold. This multiplies all of them
 * by 10 so their DOLLAR value is unchanged and only the unit is finer.
 *
 * WHAT MOVES (everything in the database denominated in credits):
 *   user_credits.balance / .total_deposited / .total_spent
 *   credit_transactions.amount            — history too, or a user's own ledger
 *                                            stops adding up to their balance
 *   images.credits_charged
 *   staker_allowance_usage.used
 *
 * WHAT DELIBERATELY DOES NOT:
 *   deposit_progress.credited_amount      — despite the name this is the on-chain
 *                                            TOKEN amount already converted, not
 *                                            credits. Scaling it would re-credit
 *                                            or strand real USDC.
 *   worker_earnings.earning_usd, worker_payouts.amount_usd, referral_earnings.usd,
 *   staking_rewards.*, treasury_buckets.balance_usd, treasury_ledger.amount_usd
 *                                         — USD. Already the right number.
 *   completed_jobs.earning_points, worker_stats.total_earning_points
 *                                         — points (tokens x tier), not money.
 *   staking_*.amount, onchain_stake_lots.amount
 *                                         — $ZERO tokens.
 *
 * NOT COVERED, because it is not in the database — set these by hand with the
 * deploy, or the lanes they gate shrink tenfold:
 *   STAKER_ALLOWANCE_DAILY_POOL_CREDITS   in .env.local (x10)
 *   IMAGE_CREDITS                         in .env.local (20 -> 10, if overridden)
 *
 * Runs in ONE transaction and writes a marker row, so a second run is a no-op
 * rather than a hundredfold. Refuses to touch anything until it has read the
 * whole before-state, and prints it next to the after-state.
 *
 *   npx tsx scripts/migrate-credit-redenomination.ts --dry-run
 *   npx tsx scripts/migrate-credit-redenomination.ts [--db path/to.db]
 */
import Database from 'better-sqlite3';
import path from 'path';

const MARKER = 'credit-redenomination-x10';
const FACTOR = 10;

/** Every (table, column) pair that stores a credit amount. */
const CREDIT_COLUMNS: { table: string; columns: string[] }[] = [
  { table: 'user_credits', columns: ['balance', 'total_deposited', 'total_spent'] },
  { table: 'credit_transactions', columns: ['amount'] },
  { table: 'images', columns: ['credits_charged'] },
  { table: 'staker_allowance_usage', columns: ['used'] },
];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

// Accepts `--db path` and `--db=path`. A bare trailing `--db` is an error rather
// than a silent fall back to the default, because every wrong-path failure here
// has to be loud — see the fileMustExist note below.
function parseDbArg(): string | null {
  const eq = argv.find((a) => a.startsWith('--db='));
  if (eq) {
    const v = eq.slice('--db='.length);
    if (!v) { console.error('[redenomination] --db= given with no path.'); process.exit(1); }
    return v;
  }
  const i = argv.indexOf('--db');
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('-')) { console.error('[redenomination] --db given with no path.'); process.exit(1); }
  return v;
}

const explicitDb = parseDbArg();
const dbPath = explicitDb ? path.resolve(explicitDb) : path.join(process.cwd(), 'data', 'c0mpute.db');

// fileMustExist, and it is the most important line in this file. Without it
// better-sqlite3 CREATES an empty database at whatever path it is handed; every
// table then reads as "not present", and the run prints a wall of skips followed
// by "Done. Marker written." That is the worst outcome available: the deploy
// proceeds with CREDITS_PER_USD at 1000 against an unscaled ledger, every stored
// balance quietly loses 90% of its value, and the marker turns the retry into a
// no-op. The default path is gitignored and absent from a fresh worktree, so
// this is the likely mistake rather than an exotic one.
let db: Database.Database;
try {
  db = new Database(dbPath, { fileMustExist: true });
} catch {
  console.error(`\n[redenomination] ABORT — no database at ${dbPath}`);
  console.error('  Nothing was created and nothing was written. Point --db at the live');
  console.error('  database and re-run.\n');
  process.exit(1);
}
db.pragma('journal_mode = WAL');

function tableExists(name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

/** SUM + row count for one column, or null when the table isn't in this DB. */
function totals(table: string, column: string): { rows: number; sum: number } | null {
  if (!tableExists(table)) return null;
  const row = db.prepare(
    `SELECT COUNT(*) AS rows, COALESCE(SUM(${column}), 0) AS sum FROM ${table}`
  ).get() as { rows: number; sum: number };
  return { rows: row.rows, sum: row.sum };
}

function snapshot(): Record<string, { rows: number; sum: number } | null> {
  const out: Record<string, { rows: number; sum: number } | null> = {};
  for (const { table, columns } of CREDIT_COLUMNS) {
    for (const column of columns) out[`${table}.${column}`] = totals(table, column);
  }
  return out;
}

/**
 * images.credits_charged is an INTEGER column. x10 keeps an integer integral, so
 * the only way it could stop being one is if a fractional value was already
 * stored there (SQLite's dynamic typing allows it). Check rather than assume —
 * silently writing a float into an INTEGER column is exactly the kind of thing
 * that surfaces months later as a rendering bug.
 */
function nonIntegralIntegerColumns(): string[] {
  const bad: string[] = [];
  for (const [table, column] of [['images', 'credits_charged'], ['staker_allowance_usage', 'used']] as const) {
    if (!tableExists(table)) continue;
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != CAST(${column} AS INTEGER)`
    ).get() as { n: number };
    if (row.n > 0) bad.push(`${table}.${column} (${row.n} fractional row(s))`);
  }
  return bad;
}

function ensureMarkerTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      note TEXT
    );
  `);
}

function alreadyApplied(): { applied_at: string } | undefined {
  if (!tableExists('schema_migrations')) return undefined;
  return db.prepare('SELECT applied_at FROM schema_migrations WHERE name = ?').get(MARKER) as
    | { applied_at: string }
    | undefined;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });

function report(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>) {
  const width = Math.max(...Object.keys(before).map((k) => k.length));
  console.log('');
  console.log(`  ${'column'.padEnd(width)}  ${'rows'.padStart(8)}  ${'before'.padStart(16)}  ${'after'.padStart(16)}`);
  console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(8)}  ${'-'.repeat(16)}  ${'-'.repeat(16)}`);
  for (const key of Object.keys(before)) {
    const b = before[key];
    const a = after[key];
    if (!b) {
      console.log(`  ${key.padEnd(width)}  ${'—'.padStart(8)}  ${'(no table)'.padStart(16)}  ${'—'.padStart(16)}`);
      continue;
    }
    console.log(
      `  ${key.padEnd(width)}  ${fmt(b.rows).padStart(8)}  ${fmt(b.sum).padStart(16)}  ${fmt(a?.sum ?? b.sum * FACTOR).padStart(16)}`
    );
  }
  console.log('');
}

function main() {
  console.log(`\n[redenomination] ${dbPath}`);
  console.log(`[redenomination] x${FACTOR} — 1 credit: $0.01 -> $0.001 (CREDITS_PER_USD 100 -> 1000)`);
  if (dryRun) console.log('[redenomination] DRY RUN — nothing will be written.\n');

  const prior = alreadyApplied();
  if (prior) {
    console.log(`[redenomination] Already applied at ${prior.applied_at}. Nothing to do.`);
    console.log('[redenomination] Running again would multiply the ledger a hundredfold; refusing.\n');
    return;
  }

  // A real database has a ledger in it. If NONE of the credit tables exist we
  // are pointed at the wrong file — a fresh, a partially-initialised, or some
  // other service's database. Skipping every table and then reporting success
  // is how a deploy proceeds against an unscaled ledger, so refuse instead. An
  // installation that genuinely has no credit tables has nothing to migrate and
  // loses nothing by being told to check the path.
  const present = CREDIT_COLUMNS.filter(({ table }) => tableExists(table)).map(({ table }) => table);
  if (present.length === 0) {
    console.error('[redenomination] ABORT — this database has none of the credit tables:');
    for (const { table } of CREDIT_COLUMNS) console.error(`    ${table}`);
    console.error('  Almost certainly the wrong --db path. Nothing was written.\n');
    process.exitCode = 1;
    return;
  }
  const missing = CREDIT_COLUMNS.filter(({ table }) => !tableExists(table)).map(({ table }) => table);
  if (missing.length > 0) {
    console.warn(`[redenomination] NOTE — absent (will be skipped): ${missing.join(', ')}`);
  }

  const fractional = nonIntegralIntegerColumns();
  if (fractional.length > 0) {
    console.error('[redenomination] ABORT — integer credit columns hold fractional values:');
    for (const f of fractional) console.error(`    ${f}`);
    console.error('  x10 would leave them fractional in an INTEGER column. Resolve these first.\n');
    process.exitCode = 1;
    return;
  }

  const before = snapshot();

  if (dryRun) {
    report(before, {});
    console.log('[redenomination] Dry run only — re-run without --dry-run to apply.');
    console.log('[redenomination] Remember the two env values this script cannot reach:');
    console.log('    STAKER_ALLOWANCE_DAILY_POOL_CREDITS  x10');
    console.log('    IMAGE_CREDITS                        20 -> 10 (only if overridden)\n');
    return;
  }

  ensureMarkerTable();

  // One transaction: either every credit figure in the database is redenominated
  // or none is. A partial run would leave balances and their own history
  // disagreeing by a factor of ten, with no way to tell which rows moved.
  const migrate = db.transaction(() => {
    // Re-check inside the transaction. Two operators running this at once is
    // unlikely and catastrophic; the marker insert below is the real guard, but
    // this makes the window it has to cover as small as possible.
    if (alreadyApplied()) throw new Error('migration marker appeared mid-run — aborting');
    for (const { table, columns } of CREDIT_COLUMNS) {
      if (!tableExists(table)) {
        console.log(`[redenomination] skip ${table} — not present in this database`);
        continue;
      }
      const sets = columns.map((c) => `${c} = ${c} * ${FACTOR}`).join(', ');
      const info = db.prepare(`UPDATE ${table} SET ${sets}`).run();
      console.log(`[redenomination] ${table}: ${info.changes} row(s) x${FACTOR} (${columns.join(', ')})`);
    }
    // The note records the factor and the denomination it puts the ledger in.
    // There is no down-migration: rolling lib/token-price.ts back to 100 without
    // dividing the ledger makes every balance worth 10x, and an operator finding
    // only "already applied" has no way to tell which side of the change the
    // data is on. This line is what tells them.
    db.prepare('INSERT INTO schema_migrations (name, applied_at, note) VALUES (?, ?, ?)').run(
      MARKER,
      new Date().toISOString(),
      `multiplied every credit-denominated column by ${FACTOR}; ledger is now denominated `
        + `at CREDITS_PER_USD=1000 (1 credit = $0.001). Rolling the code back to 100 REQUIRES `
        + `dividing these same columns by ${FACTOR} and deleting this row.`
    );
  });

  migrate();

  report(before, snapshot());
  console.log('[redenomination] Done. Marker written — a second run is now a no-op.');
  console.log('[redenomination] STILL TO DO BY HAND (not in the database):');
  console.log('    STAKER_ALLOWANCE_DAILY_POOL_CREDITS  x10   in .env.local');
  console.log('    IMAGE_CREDITS                        20 -> 10   in .env.local (only if overridden)\n');
}

try {
  main();
} finally {
  db.close();
}
