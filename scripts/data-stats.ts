// Generates data-site/stats.json for data.c0mpute.ai and records a worker
// snapshot. Run by the c0mpute-datastats systemd timer every 5 minutes.
//
// Privacy rule: aggregates only. No user ids, no wallet addresses, no prompts,
// no per-worker identifiers leave this script.
import { config } from 'dotenv';
import { resolve, join } from 'path';
import { writeFileSync, renameSync } from 'fs';
import Database from 'better-sqlite3';

const ROOT = resolve(__dirname, '..');
config({ path: join(ROOT, '.env.local') });

const db = new Database(join(ROOT, 'data', 'c0mpute.db'));
db.pragma('journal_mode = WAL');

const ORCH_URL = 'http://127.0.0.1:3004';
const SITE_URL = process.env.DATASTATS_SITE_URL || 'https://c0mpute.ai';
const OUT = join(ROOT, 'data-site', 'stats.json');

// Internal/test accounts excluded from public revenue + user numbers.
const EXCLUDED_IDS = ['kloot-imggen-test'];
const excl = `(${EXCLUDED_IDS.map(() => '?').join(',')})`;

type Row = Record<string, any>;
const all = (sql: string, ...params: any[]): Row[] => db.prepare(sql).all(...params) as Row[];
const one = (sql: string, ...params: any[]): Row => db.prepare(sql).get(...params) as Row;

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  // --- live workers from the orchestrator + snapshot for history ---
  const live = await fetchJson(`${ORCH_URL}/api/stats`);
  db.exec(`CREATE TABLE IF NOT EXISTS worker_snapshots (
    at TEXT PRIMARY KEY,
    total INTEGER NOT NULL,
    native INTEGER NOT NULL,
    browser INTEGER NOT NULL,
    image INTEGER NOT NULL,
    busy INTEGER NOT NULL
  )`);
  if (live) {
    db.prepare(
      'INSERT OR REPLACE INTO worker_snapshots (at, total, native, browser, image, busy) VALUES (?,?,?,?,?,?)'
    ).run(live.at, live.workersOnline, live.byType.native, live.byType.browser, live.byType.image, live.busy);
  }
  const workerHistory = all(
    `SELECT at, total, native, browser, image, busy FROM worker_snapshots ORDER BY at`
  );

  // --- jobs / tokens / speed per day, by tier ---
  const jobsDaily = all(`
    SELECT date(completed_at) AS day, tier, COUNT(*) AS jobs, SUM(tokens_generated) AS tokens
    FROM completed_jobs GROUP BY day, tier ORDER BY day`);
  const speedDaily = all(`
    SELECT date(completed_at) AS day,
           ROUND(SUM(tokens_generated) * 1000.0 / NULLIF(SUM(duration_ms), 0), 1) AS tokPerSec
    FROM completed_jobs
    WHERE tier IN ('max','pro') AND duration_ms > 0 AND tokens_generated >= 50
    GROUP BY day ORDER BY day`);
  const jobTotals = one(`
    SELECT COUNT(*) AS jobs, SUM(tokens_generated) AS tokens FROM completed_jobs`);
  const imagesTotal = one(`SELECT COUNT(*) AS n FROM completed_jobs WHERE tier='image'`).n;

  // --- users ---
  const signupsDaily = all(`
    SELECT date(created_at) AS day, COUNT(*) AS users FROM profiles GROUP BY day ORDER BY day`);
  const usersTotal = one(`SELECT COUNT(*) AS n FROM profiles`).n;
  const anonDaily = all(`
    SELECT day, COUNT(DISTINCT ip_hash) AS visitors, SUM(count) AS prompts
    FROM anon_ip_daily GROUP BY day ORDER BY day`);
  const freePrompts = one(`SELECT COALESCE(SUM(used),0) AS used, COUNT(*) AS users FROM free_prompt_usage`);
  const freeImages = one(`SELECT COALESCE(SUM(used),0) AS used, COUNT(*) AS users FROM free_image_usage`);
  const apiKeys = one(`SELECT COUNT(*) AS n FROM api_keys WHERE revoked=0`).n;

  // --- revenue (credits; 1 credit = $0.01) ---
  const depositEvents = all(`
    SELECT date(created_at) AS day, created_at AS at, amount
    FROM credit_transactions
    WHERE type='deposit' AND privy_id NOT IN ${excl}
    ORDER BY created_at`, ...EXCLUDED_IDS);
  const spendDaily = all(`
    SELECT date(created_at) AS day,
           CASE
             WHEN description LIKE 'max%' THEN 'max'
             WHEN description LIKE 'pro%' THEN 'pro'
             WHEN description LIKE 'Image%' THEN 'image'
             ELSE 'other'
           END AS tier,
           SUM(amount) AS credits
    FROM credit_transactions
    WHERE type='spend' AND privy_id NOT IN ${excl}
    GROUP BY day, tier ORDER BY day`, ...EXCLUDED_IDS);
  const payoutEvents = all(`
    SELECT date(created_at) AS day, created_at AS at, ROUND(amount_usd, 2) AS usd
    FROM worker_payouts WHERE status='completed' ORDER BY created_at`);
  const earningsDaily = all(`
    SELECT date(created_at) AS day, ROUND(SUM(earning_usd), 4) AS usd,
           ROUND(SUM(CASE WHEN subsidized=1 THEN earning_usd ELSE 0 END), 4) AS subsidizedUsd
    FROM worker_earnings GROUP BY day ORDER BY day`);

  // --- $ZERO / treasury ---
  // burn meta looks like: "880142.675125 ZERO burned, tx 5BdEW..."
  const burnEvents = all(`
    SELECT date(created_at) AS day, created_at AS at, ROUND(amount_usd, 2) AS usd, meta
    FROM treasury_ledger WHERE event='burn' ORDER BY created_at`).map((r) => {
    const m = /^([\d.]+) ZERO burned, tx (\S+)/.exec(r.meta || '');
    return { day: r.day, at: r.at, usd: r.usd, zero: m ? Math.round(parseFloat(m[1])) : null, tx: m ? m[2] : null };
  });
  const stakerPayoutEvents = all(`
    SELECT date(created_at) AS day, created_at AS at, ROUND(-amount_usd, 2) AS usd
    FROM treasury_ledger WHERE event='staker_payout' ORDER BY created_at`);
  const treasury = await fetchJson(`${SITE_URL}/api/treasury`);
  const stakedLots = all(`SELECT date(since) AS day, SUM(amount) AS amount FROM onchain_stake_lots GROUP BY day ORDER BY day`);

  // --- $ZERO market (solanatracker, same source as state-sync) ---
  let market: Row | null = null;
  const mint = process.env.ZERO_TOKEN_MINT;
  const trackerKey = process.env.SOLANA_TRACKER_API_KEY;
  if (mint && trackerKey) {
    const d = await fetchJson(`https://data.solanatracker.io/tokens/${mint}`, { 'x-api-key': trackerKey });
    const p = d?.pools?.[0];
    if (p) {
      market = {
        priceUsd: p.price?.usd ?? null,
        mcapUsd: Math.round(p.marketCap?.usd ?? 0),
        liquidityUsd: Math.round(p.liquidity?.usd ?? 0),
        change24h: d?.events?.['24h']?.priceChangePercentage ?? null,
      };
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    live,
    workerHistory,
    network: { jobsDaily, speedDaily, totals: { jobs: jobTotals.jobs, tokens: jobTotals.tokens, images: imagesTotal } },
    users: {
      signupsDaily,
      total: usersTotal,
      anonDaily,
      freePrompts: { used: freePrompts.used, users: freePrompts.users },
      freeImages: { used: freeImages.used, users: freeImages.users },
      apiKeys,
    },
    revenue: { depositEvents, spendDaily, payoutEvents, earningsDaily },
    zero: {
      market,
      mint: mint || null,
      treasury: treasury
        ? {
            totalZeroBurned: treasury.totalZeroBurned ?? null,
            totalBuybackUsd: treasury.totalUsdBuybackSpent ?? null,
            totalStakerRewardsUsd: treasury.totalStakerRewardsPaid ?? null,
            totalZeroStaked: treasury.totalStaked ?? null,
            pendingBuyback: treasury.pendingBuyback ?? null,
            pendingStakerRewards: treasury.pendingStakerRewards ?? null,
          }
        : null,
      burnEvents,
      stakerPayoutEvents,
      stakedLots,
    },
  };

  // atomic write so nginx never serves a half-written file
  writeFileSync(OUT + '.tmp', JSON.stringify(out));
  renameSync(OUT + '.tmp', OUT);
  console.log(`[data-stats] wrote ${OUT} (${JSON.stringify(out).length} bytes)`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[data-stats] failed:', e);
  process.exit(1);
});
