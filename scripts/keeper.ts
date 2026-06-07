// Buyback + staking keeper.
//
// Runs once per day at KEEPER_UTC_HOUR (default 15:00 UTC). Each tick:
//   1. claim pump.fun creator fees (USDC) into the treasury and realise them
//      (TRADING_FEE_BUYBACK_PCT into the pool, the rest is profit)
//   2. buyback: if ZERO has graduated to a PumpSwap pool, spend the buyback
//      bucket on ZERO and burn EXACTLY what was bought; pre-graduation the
//      budget just accumulates in the bucket
//   3. staker rewards: distribute the staker-reward bucket pro-rata to everyone
//      staking >= 24h (paid as USDC, claimed later via the app)
//
// Everything is dormant until ZERO_TOKEN_MINT is set, and every on-chain
// money-move is a no-op unless KEEPER_DRY_RUN=false. Start it with dry-run on,
// watch a cycle in the logs, then flip the env once it looks right.

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local the same way server/index.ts does (tsx doesn't auto-load it).
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (key && !process.env[key]) process.env[key] = value;
  }
} catch {
  console.warn('[Keeper] Could not load .env.local — relying on environment variables');
}

import { isZeroLaunched, KEEPER_UTC_HOUR, getZeroMint } from '../lib/tokenomics';
import {
  getBucket,
  reserveBuyback,
  creditBuyback,
  reserveStakerRewards,
  creditStakerRewards,
  recordBurn,
  recordStakerPayout,
  realizeFees,
} from '../lib/treasury-ledger';
import { distributeEpochRewards, getEligibleStakers, getAllStakingWallets, syncStake } from '../lib/staking';
import { getTokenUiBalance } from '../lib/payout';
import {
  isDryRun,
  findGraduatedPool,
  claimCreatorFees,
  buyZeroWithUsdc,
  burnZero,
  zeroRawToUi,
} from '../lib/keeper/onchain';

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Keeper] ${label} failed:`, err);
    return undefined;
  }
}

async function claimAndRealizeFees(): Promise<void> {
  const claimedUsd = await claimCreatorFees();
  if (claimedUsd > 0) {
    realizeFees(claimedUsd, 'keeper_fee_claim');
    console.log(`[Keeper] Realised $${claimedUsd.toFixed(2)} of creator fees`);
  }
}

async function runBuyback(): Promise<void> {
  const pool = await findGraduatedPool();
  if (!pool) {
    console.log(`[Keeper] ZERO not graduated yet — accumulating buyback budget ($${getBucket('buyback').toFixed(2)})`);
    return;
  }

  const budget = getBucket('buyback');
  if (budget <= 0) {
    console.log('[Keeper] Buyback bucket empty — nothing to buy');
    return;
  }

  // Atomically pull the budget out of the bucket BEFORE spending so a crash
  // can't double-spend; refund the exact amount on any failure.
  const reserved = reserveBuyback(budget);
  if (reserved <= 0) return;

  try {
    const { zeroOutRaw, swapSig } = await buyZeroWithUsdc(pool, reserved);
    if (isDryRun()) {
      creditBuyback(reserved, 'dry_run_refund'); // dry run didn't really spend
      return;
    }
    if (zeroOutRaw <= BigInt(0)) throw new Error('swap returned 0 ZERO');

    const burnSig = await burnZero(zeroOutRaw);
    const zeroUi = zeroRawToUi(zeroOutRaw);
    recordBurn(reserved, zeroUi, burnSig);
    console.log(`[Keeper] Bought + burned ${zeroUi} ZERO for $${reserved.toFixed(2)} (swap ${swapSig}, burn ${burnSig})`);
  } catch (err) {
    creditBuyback(reserved, 'buyback_failed');
    console.error('[Keeper] Buyback failed, budget refunded to bucket:', err);
  }
}

/**
 * Re-read every staking wallet's on-chain ZERO balance and fold it into the DB
 * before we pay, so distribution always reflects live balances (not a snapshot
 * left stale by a user who never opened the staking page). Bookkeeping only — no
 * money moves — so it runs even in dry-run.
 */
async function resyncStakesFromChain(): Promise<void> {
  const mint = getZeroMint();
  if (!mint) return;
  const wallets = getAllStakingWallets();
  for (const w of wallets) {
    const bal = await getTokenUiBalance(w.publicKey, mint);
    syncStake(w.privyId, bal);
  }
  if (wallets.length > 0) console.log(`[Keeper] Re-synced ${wallets.length} staking positions from chain`);
}

async function runStakerRewards(): Promise<void> {
  await resyncStakesFromChain();
  const pool = getBucket('staker_rewards');
  if (pool <= 0) {
    console.log('[Keeper] Staker-reward bucket empty');
    return;
  }
  if (getEligibleStakers().length === 0) {
    console.log(`[Keeper] No eligible stakers — rolling $${pool.toFixed(2)} to next epoch`);
    return;
  }
  if (isDryRun()) {
    // Distribution credits real claimable balances (withdrawable as USDC), so
    // treat it as a money-move and skip it in dry-run.
    console.log(`[Keeper] DRY RUN — would distribute $${pool.toFixed(2)} to ${getEligibleStakers().length} stakers`);
    return;
  }

  // Reserve the whole bucket, distribute it, refund any rounding dust.
  const reserved = reserveStakerRewards(pool);
  if (reserved <= 0) return;

  const distributed = distributeEpochRewards(reserved);
  if (distributed < reserved) {
    creditStakerRewards(reserved - distributed, 'epoch_rounding');
  }
  recordStakerPayout(distributed);
  console.log(`[Keeper] Distributed $${distributed.toFixed(2)} to stakers`);
}

async function runCycle(): Promise<void> {
  if (!isZeroLaunched()) {
    console.log('[Keeper] ZERO_TOKEN_MINT not set — keeper dormant');
    return;
  }
  console.log(`[Keeper] === Cycle start ${new Date().toISOString()} (dry-run: ${isDryRun()}) ===`);
  await step('claim+realize fees', claimAndRealizeFees);
  await step('buyback', runBuyback);
  await step('staker rewards', runStakerRewards);
  console.log('[Keeper] === Cycle complete ===');
}

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(KEEPER_UTC_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function scheduleLoop(): Promise<void> {
  // Optional: run one cycle immediately on boot (handy for the dry-run test).
  if (process.env.KEEPER_RUN_ON_START === 'true') {
    await runCycle();
  }
  const tick = async () => {
    const wait = msUntilNextRun();
    console.log(`[Keeper] Next cycle in ${(wait / 3_600_000).toFixed(2)}h (at ${KEEPER_UTC_HOUR}:00 UTC)`);
    setTimeout(async () => {
      await runCycle();
      tick();
    }, wait);
  };
  tick();
}

// `tsx scripts/keeper.ts once` runs a single cycle and exits (cron/manual use).
if (process.argv[2] === 'once') {
  runCycle().then(() => process.exit(0));
} else {
  scheduleLoop();
  console.log('[Keeper] Started — scheduling daily cycles');
}
