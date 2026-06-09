import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { getZeroMint, WORKER_STAKE_THRESHOLD, WORKER_STAKED_REVENUE_SHARE } from '@/lib/tokenomics';
import { getWorkerRevenueShare, getStakePosition } from '@/lib/staking';
import { syncOnchainStake, seedOnchainLotIfEmpty } from '@/lib/keeper/onchain-rewards';
import { getStakerAllowanceStatus } from '@/lib/staker-allowance';
import Database from 'better-sqlite3';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount,
} from '@solana/spl-token';

const STAKE_MIN_AGE_MS = 24 * 60 * 60 * 1000;

function stakingProgramId(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || 'BU3JcQJBsFZwNV2DHSPeu3hKLsfarLS2AU5RuVhJrYKM');
}
function rewardsProgramId(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_REWARDS_PROGRAM_ID || 'EfW8KpmWGwBcDVcq4Qj6F3EYeMMGEcrS4BnKnDyQqvqW');
}
function usdcMint(): PublicKey | null {
  const m = process.env.NEXT_PUBLIC_ONCHAIN_USDC_MINT || process.env.ONCHAIN_USDC_MINT;
  return m ? new PublicKey(m) : null;
}
function linkedWalletFor(privyId: string): string | null {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
  const row = db.prepare('SELECT wallet_address FROM profiles WHERE privy_id = ?').get(privyId) as { wallet_address: string | null } | undefined;
  db.close();
  return row?.wallet_address?.trim() || null;
}
// Maturity from the server-preserved lots (migrated stake keeps its original date),
// keyed by the owner wallet. Returns { mature, cooling, nextMatureAt } in UI units.
function lotsMaturity(owner: string): { mature: number; cooling: number; nextMatureAt: number | null } {
  const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
  let rows: { amount: number; since: string }[] = [];
  try { rows = db.prepare('SELECT amount, since FROM onchain_stake_lots WHERE owner = ?').all(owner) as any[]; } catch {}
  db.close();
  let mature = 0, cooling = 0, nextMatureAt: number | null = null;
  for (const r of rows) {
    if (Date.now() - new Date(r.since).getTime() >= STAKE_MIN_AGE_MS) mature += r.amount;
    else { cooling += r.amount; const m = new Date(r.since).getTime() + STAKE_MIN_AGE_MS; if (nextMatureAt === null || m < nextMatureAt) nextMatureAt = m; }
  }
  return { mature, cooling, nextMatureAt };
}

// The wallet's REAL stake time = the earliest transaction on its stake vault
// (the deposit that funded it). Used to date a first-seen staker's lot correctly
// instead of stamping "now". Returns null if history can't be read (caller falls
// back to now).
async function firstStakeTimeIso(conn: Connection, vault: PublicKey): Promise<string | null> {
  try {
    const sigs = await conn.getSignaturesForAddress(vault, { limit: 1000 });
    const oldest = sigs[sigs.length - 1];
    return oldest?.blockTime ? new Date(oldest.blockTime * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

// GET /api/staking/onchain-status — reliable on-chain staking view for the caller:
// staked = live stake-vault balance (read via server RPC, never the flaky public one);
// mature/cooling = preserved server lots; claimable = live reward-vault balance.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const privyId = await verifyPrivyToken(auth.slice(7));
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const owner = linkedWalletFor(privyId);
  const zero = getZeroMint();
  if (!owner || !zero) return NextResponse.json({ staked: 0, mature: 0, cooling: 0, nextMatureAt: null, claimable: 0, address: owner });

  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const conn = new Connection(rpc, 'confirmed');
  const ownerPk = new PublicKey(owner);
  const zeroMint = new PublicKey(zero);

  const [stakeAuth] = PublicKey.findProgramAddressSync([Buffer.from('stake'), ownerPk.toBuffer()], stakingProgramId());
  const vault = getAssociatedTokenAddressSync(zeroMint, stakeAuth, true, TOKEN_2022_PROGRAM_ID);
  let staked = 0;
  let stakedReadOk = false;
  try {
    staked = Number((await getAccount(conn, vault, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount) / 1e6;
    stakedReadOk = true;
  } catch (e) {
    // A missing vault ATA genuinely means 0 staked. ANY other error (RPC 429 /
    // network) is NOT a real zero — never treat it as one, or the reconcile below
    // would DELETE the user's stake lots and reset their 24h clock. This was the
    // mass "timer reset" bug: a flaky-RPC read of 0 wiped+recreated lots dated now.
    if (/could not find account|account does not exist|Invalid param/i.test((e as Error).message || '')) stakedReadOk = true;
  }

  let claimable = 0;
  const usdc = usdcMint();
  if (usdc) {
    const [rewardAuth] = PublicKey.findProgramAddressSync([Buffer.from('reward'), ownerPk.toBuffer()], rewardsProgramId());
    const rVault = getAssociatedTokenAddressSync(usdc, rewardAuth, true, TOKEN_PROGRAM_ID);
    try { claimable = Number((await getAccount(conn, rVault, 'confirmed', TOKEN_PROGRAM_ID)).amount) / 1e6; } catch {}
  }

  // Track DIRECT on-chain stakers too (not just migrated ones). FIRST time we see
  // a wallet's stake, seed its lot dated at the REAL on-chain stake time (the
  // vault's earliest tx) — NOT "now" — so the 24h clock reflects when they truly
  // staked and doesn't reset to when they first open the page. After that, the
  // normal reconcile handles increases (new lot dated now) and unstakes.
  // Reconcile ONLY when the on-chain balance read is trustworthy. On an RPC error
  // we must NOT touch the lots (a false 0 would delete the stake + reset the clock).
  if (stakedReadOk) {
    try {
      const seeded = staked > 0
        ? seedOnchainLotIfEmpty(owner, staked, (await firstStakeTimeIso(conn, vault)) ?? new Date().toISOString())
        : false;
      if (!seeded) syncOnchainStake(owner, staked);
    } catch { /* best-effort */ }
  }
  const { mature, cooling, nextMatureAt } = lotsMaturity(owner);
  // If the chain read failed, show the stake from the DB lots (never 0 from a hiccup).
  if (!stakedReadOk) staked = mature + cooling;
  // worker boost: combined (custodial + on-chain) mature stake vs threshold — same
  // check the orchestrator uses to pay 80% vs 70%.
  const matureForBoost = mature + getStakePosition(privyId).matureAmount;
  const workerBoostActive = getWorkerRevenueShare(privyId) >= WORKER_STAKED_REVENUE_SHARE;

  // Stake-to-use: daily free-inference allowance from the matured stake (Phase 2).
  const allowance = getStakerAllowanceStatus(privyId);

  return NextResponse.json({
    staked, mature, cooling, nextMatureAt, claimable, address: owner,
    workerThreshold: WORKER_STAKE_THRESHOLD, workerBoostActive, matureForBoost,
    allowance,
  });
}
