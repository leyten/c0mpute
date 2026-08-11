import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const dynamic = 'force-dynamic';

function db() {
  return new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
}

// ── total $ZERO staked over time ────────────────────────────────────────────
// Built from each stake vault's on-chain deposit/withdraw history (rises on
// stakes, dips on unstakes). RPC-heavy, so computed in the background and cached
// (stale-while-revalidate) — never blocks a page load.
type StakePoint = { t: string; zero: number };
let stakedCache: { at: number; data: StakePoint[]; refreshing: boolean } = { at: 0, data: [], refreshing: false };
const STAKED_TTL = 10 * 60 * 1000;

function stakingProgramId(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || 'BU3JcQJBsFZwNV2DHSPeu3hKLsfarLS2AU5RuVhJrYKM');
}

async function computeStakedHistory(): Promise<StakePoint[]> {
  const zeroStr = process.env.ZERO_TOKEN_MINT || process.env.NEXT_PUBLIC_ZERO_TOKEN_ADDRESS;
  if (!zeroStr) return [];
  const zero = new PublicKey(zeroStr);
  const conn = new Connection(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_ONCHAIN_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');

  // every stake vault we know about (current on-chain stakers)
  const d = db();
  let owners: string[] = [];
  try {
    owners = (d.prepare('SELECT DISTINCT owner FROM onchain_stake_lots').all() as { owner: string }[]).map((r) => r.owner);
  } catch (e) {
    // Swallowing this returned an empty series indistinguishable from "nobody
    // has staked yet", so the chart blanked with nothing anywhere to say why.
    console.warn(`[treasury/history] stake-lot query failed: ${(e as Error).message}`);
  }
  d.close();
  if (!owners.length) return [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const events: { ms: number; delta: number }[] = [];
  // An RPC failure below skips a vault and the series is still returned and
  // cached, so a partial walk renders as a COMPLETE staked history that simply
  // reads low — wrong numbers on a public treasury page, presented as fact.
  // Counted so the log says which, rather than leaving it invisible.
  let skippedVaults = 0;
  let skippedTxs = 0;
  for (const owner of owners) {
    const [auth] = PublicKey.findProgramAddressSync([Buffer.from('stake'), new PublicKey(owner).toBuffer()], stakingProgramId());
    const vault = getAssociatedTokenAddressSync(zero, auth, true, TOKEN_2022_PROGRAM_ID);
    const vstr = vault.toBase58();
    let sigs: { signature: string; blockTime?: number | null }[] = [];
    try { sigs = await conn.getSignaturesForAddress(vault, { limit: 1000 }); } catch { skippedVaults++; continue; }
    for (const s of sigs) {
      if (!s.blockTime) continue;
      let tx;
      try { tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }); } catch { skippedTxs++; continue; }
      if (!tx?.meta) continue;
      const keys = (tx.transaction.message.staticAccountKeys || (tx.transaction.message as { accountKeys?: PublicKey[] }).accountKeys || []).map((k) => (k.toBase58 ? k.toBase58() : String(k)));
      const idx = keys.indexOf(vstr);
      if (idx < 0) continue;
      const pre = tx.meta.preTokenBalances?.find((b) => b.accountIndex === idx)?.uiTokenAmount?.uiAmount ?? 0;
      const post = tx.meta.postTokenBalances?.find((b) => b.accountIndex === idx)?.uiTokenAmount?.uiAmount ?? 0;
      const delta = (post ?? 0) - (pre ?? 0);
      if (Math.abs(delta) > 1e-9) events.push({ ms: s.blockTime * 1000, delta });
      await sleep(120);
    }
    await sleep(150);
  }
  if (skippedVaults || skippedTxs) {
    console.warn(
      `[treasury/history] staked series is INCOMPLETE — skipped ${skippedVaults}/${owners.length} vaults ` +
        `and ${skippedTxs} transactions on RPC errors; the chart will read low`,
    );
  } else {
    console.log(`[treasury/history] staked series rebuilt from ${owners.length} vaults, ${events.length} events`);
  }
  events.sort((a, b) => a.ms - b.ms);
  let cum = 0;
  return events.map((e) => { cum += e.delta; return { t: new Date(e.ms).toISOString(), zero: Math.max(0, cum) }; });
}

function refreshStakedIfStale() {
  if (stakedCache.refreshing) return;
  if (Date.now() - stakedCache.at < STAKED_TTL && stakedCache.data.length) return;
  stakedCache.refreshing = true;
  computeStakedHistory()
    .then((data) => { stakedCache = { at: Date.now(), data, refreshing: false }; })
    .catch((e) => {
      // The whole rebuild failing left the chart blank with no trace anywhere.
      console.error(`[treasury/history] staked history rebuild failed: ${(e as Error)?.message ?? e}`);
      stakedCache.refreshing = false;
    });
}

// GET /api/treasury/history — time-series for the dashboard charts.
export async function GET() {
  let burnRows: { amount_usd: number; meta: string | null; created_at: string }[] = [];
  let payoutRows: { amount_usd: number; created_at: string }[] = [];
  try {
    const d = db();
    burnRows = d.prepare("SELECT amount_usd, meta, created_at FROM treasury_ledger WHERE event='burn' ORDER BY created_at").all() as typeof burnRows;
    payoutRows = d.prepare("SELECT amount_usd, created_at FROM treasury_ledger WHERE event='staker_payout' ORDER BY created_at").all() as typeof payoutRows;
    d.close();
  } catch { /* table missing / pre-launch */ }

  let cumZero = 0, cumBurnUsd = 0;
  const burn = burnRows.map((r) => {
    cumZero += parseFloat(String(r.meta ?? '').trim()) || 0;
    cumBurnUsd += r.amount_usd || 0;
    return { t: r.created_at, zero: cumZero, usd: cumBurnUsd };
  });

  const merged = [
    ...burnRows.map((r) => ({ t: r.created_at, usd: r.amount_usd || 0 })),
    ...payoutRows.map((r) => ({ t: r.created_at, usd: Math.abs(r.amount_usd || 0) })),
  ].sort((a, b) => (a.t < b.t ? -1 : 1));
  let cumR = 0;
  const returns = merged.map((e) => { cumR += e.usd; return { t: e.t, usd: cumR }; });

  refreshStakedIfStale(); // background; serves cached (or empty until first compute lands)

  return NextResponse.json({ burn, returns, staked: stakedCache.data });
}
