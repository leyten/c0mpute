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

// Onboarding free IMAGE generations per account (separate pool from free text
// prompts above). Treasury-subsidized like free prompts; bounded by the same
// global daily subsidy cap below.
export const FREE_IMAGE_LIMIT = Number(process.env.FREE_IMAGE_LIMIT || 3);

// Workers are paid their normal 70% cut for serving free-prompt jobs too, but
// that payout is funded by the treasury (the user paid nothing). This caps the
// TOTAL such subsidy per UTC day so a sybil swarm farming free prompts against
// their own worker can't drain the treasury. Private: never surfaced in any UI,
// API response, or docs — a worker only ever sees their earnings. Dial via env.
export const FREE_SUBSIDY_DAILY_CAP_USD = Number(process.env.FREE_SUBSIDY_DAILY_CAP_USD || 50);

// Anonymous (pre-login) free prompts. A visitor gets ANON_FREE_PROMPT_LIMIT free
// prompts per session before being asked to sign in. ANON_IP_DAILY_CAP bounds how
// many free prompts a single IP can dispense per UTC day, so clearing cookies to
// reset the session is capped. The global FREE_SUBSIDY_DAILY_CAP_USD above is the
// hard ceiling on total spend regardless.
export const ANON_FREE_PROMPT_LIMIT = Number(process.env.ANON_FREE_PROMPT_LIMIT || FREE_PROMPT_LIMIT);
export const ANON_IP_DAILY_CAP = Number(process.env.ANON_IP_DAILY_CAP || 30);

// ── Staker inference allowance (Venice-style "stake → daily free inference") ──
// FLAGGED OFF by default. When on, matured-stake holders draw a daily pro-rata
// allowance of FREE inference from the capped pool below before paying USDC.
// See lib/staker-allowance.ts for the engine.
export const STAKER_ALLOWANCE_ENABLED = (process.env.STAKER_ALLOWANCE_ENABLED || '').toLowerCase() === 'true';
// Total free-inference credits handed to ALL stakers per UTC day — the hard cost
// ceiling (worst-case worker subsidy = POOL × share ÷ CREDITS_PER_USD). Start
// small per D3; raise via env as revenue grows.
export const STAKER_ALLOWANCE_DAILY_POOL_CREDITS = Number(process.env.STAKER_ALLOWANCE_DAILY_POOL_CREDITS || 5000);
// No single account may draw more than this fraction of the daily pool.
export const STAKER_ALLOWANCE_MAX_SHARE = pct('STAKER_ALLOWANCE_MAX_SHARE', 0.25);
// A staker only counts toward / draws from the pool if they've made a request
// within this many days (Venice's active-staker gate).
export const STAKER_ALLOWANCE_ACTIVE_DAYS = Number(process.env.STAKER_ALLOWANCE_ACTIVE_DAYS || 7);
// Whether to apply the active-staker gate above. OFF by default: every matured
// staker gets their allowance regardless of recent usage (you don't have to have
// used the network before to get free credits). Flip to true to re-require it.
export const STAKER_ALLOWANCE_REQUIRE_ACTIVE = (process.env.STAKER_ALLOWANCE_REQUIRE_ACTIVE || '').toLowerCase() === 'true';
// Optional beta allowlist — comma-separated privy_ids. When non-empty, ONLY these
// accounts are eligible (lets us prove the feature on one wallet before opening
// it to everyone). Empty = all matured active stakers.
export const STAKER_ALLOWANCE_ALLOWLIST = (process.env.STAKER_ALLOWANCE_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Worker revenue share ──

// Base worker share of the USD value of credits spent on their job.
export const WORKER_REVENUE_SHARE = 0.7;
// Boosted share for workers staking >= WORKER_STAKE_THRESHOLD ZERO (held >= 24h).
export const WORKER_STAKED_REVENUE_SHARE = pct('WORKER_STAKED_REVENUE_SHARE', 0.8);
// Referrer's cut of a referred user's SELF-PAID usage, netted from treasury's
// side (split becomes 70/25/5 base, 80/15/5 boosted). Subsidized jobs (free
// prompts, staker allowance) have zero revenue and never pay referrals.
export const REFERRAL_REVENUE_SHARE = pct('REFERRAL_REVENUE_SHARE', 0.05);

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
