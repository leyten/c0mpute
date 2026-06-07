// $ZERO tokenomics config — buyback + staking.
//
// Everything is dormant until ZERO_TOKEN_MINT is set (the token isn't launched
// yet). The moment the CA is dropped into the env, the keeper + staking activate.
//
// Money flow (all USDC, see lib/treasury-ledger.ts for the bucket accounting):
//   compute margin  → 100% into the buyback pool
//   trading fees    → 35% into the buyback pool, 65% to leyten's profit
//   the pool        → split 50/50: half buys+burns ZERO, half pays stakers in USDC

// ── ZERO token ──

// Backend reads ZERO_TOKEN_MINT; the frontend reads NEXT_PUBLIC_ZERO_TOKEN_ADDRESS.
// Set both to the pump.fun CA at launch. pump.fun mints are 6 decimals.
export const ZERO_DECIMALS = 6;

export function getZeroMint(): string | null {
  const m = process.env.ZERO_TOKEN_MINT?.trim();
  return m && m.length > 0 ? m : null;
}

export function isZeroLaunched(): boolean {
  return getZeroMint() !== null;
}

// ── Split config (tunable via env, sane defaults baked in) ──

function pct(envKey: string, fallback: number): number {
  const v = process.env[envKey];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

// Fraction of the 30% compute margin that flows into the buyback pool.
export const COMPUTE_MARGIN_TO_POOL_PCT = pct('COMPUTE_MARGIN_BUYBACK_PCT', 1.0);
// Fraction of claimed trading fees that flows into the buyback pool (rest = profit).
export const TRADING_FEE_TO_POOL_PCT = pct('TRADING_FEE_BUYBACK_PCT', 0.35);
// Of the buyback pool, the fraction used to buy+burn ZERO (rest pays stakers in USDC).
export const POOL_BURN_SPLIT = pct('POOL_BURN_SPLIT', 0.5);

// Minimum USD a worker/staker can withdraw in one payout.
export const MIN_WITHDRAWAL_USD = 1.0;

// Free Pro-tier prompts each new X account gets before needing to top up USDC.
// Lets a brand-new signup actually try the product (free tier was removed, so
// they otherwise land with 0 credits). Max/native tier always costs credits.
export const FREE_PROMPT_LIMIT = Number(process.env.FREE_PROMPT_LIMIT || 5);

// Workers are paid their normal 70% cut for serving free-prompt jobs too, but
// that payout is funded by the treasury (the user paid nothing). This caps the
// TOTAL such subsidy per UTC day so a sybil swarm farming free prompts against
// their own worker can't drain the treasury. Private: never surfaced in any UI,
// API response, or docs — a worker only ever sees their earnings. Dial via env.
export const FREE_SUBSIDY_DAILY_CAP_USD = Number(process.env.FREE_SUBSIDY_DAILY_CAP_USD || 25);

// ── Worker revenue share ──

// Base worker share of the USD value of credits spent on their job.
export const WORKER_REVENUE_SHARE = 0.7;
// Boosted share for workers staking >= WORKER_STAKE_THRESHOLD ZERO (held >= 24h).
export const WORKER_STAKED_REVENUE_SHARE = pct('WORKER_STAKED_REVENUE_SHARE', 0.8);

// ── Staking ──

// Minimum whole ZERO a worker must stake to qualify for the boosted share.
// Default 1,000,000 = 0.1% of the 1B pump.fun supply. Retune at launch once
// price is known.
export const WORKER_STAKE_THRESHOLD = Number(process.env.WORKER_STAKE_THRESHOLD || 1_000_000);

// A stake must be held this long before it earns epoch rewards or the worker
// boost. Each deposit ages on its own clock (see lib/staking.ts), so only the
// matured portion counts — you can't stake right before a drop and snipe it.
export const STAKE_MIN_AGE_MS = 24 * 60 * 60 * 1000;

// Minimum whole ZERO for a PARTIAL unstake. A full withdrawal of the entire
// staked balance is always allowed regardless of size (so small testers are
// never locked out); this floor only stops dust-spam unstakes that would drain
// the treasury's SOL on per-destination account-creation rent. Retune at launch.
export const MIN_UNSTAKE_ZERO = Number(process.env.MIN_UNSTAKE_ZERO || 1000);

// Daily buyback + epoch reward distribution fire at this UTC hour
// (15:00 UTC = 11am New York / 5pm Central Europe — peak US+EU overlap).
export const KEEPER_UTC_HOUR = Number(process.env.KEEPER_UTC_HOUR || 15);
