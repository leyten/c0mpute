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
  try { owners = (d.prepare('SELECT DISTINCT owner FROM onchain_stake_lots').all() as { owner: string }[]).map((r) => r.owner); } catch {}
  d.close();
  if (!owners.length) return [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const events: { ms: number; delta: number }[] = [];
  for (const owner of owners) {
    const [auth] = PublicKey.findProgramAddressSync([Buffer.from('stake'), new PublicKey(owner).toBuffer()], stakingProgramId());
    const vault = getAssociatedTokenAddressSync(zero, auth, true, TOKEN_2022_PROGRAM_ID);
    const vstr = vault.toBase58();
    let sigs: { signature: string; blockTime?: number | null }[] = [];
    try { sigs = await conn.getSignaturesForAddress(vault, { limit: 1000 }); } catch { continue; }
    for (const s of sigs) {
      if (!s.blockTime) continue;
      let tx;
      try { tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }); } catch { continue; }
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
    .catch(() => { stakedCache.refreshing = false; });
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
