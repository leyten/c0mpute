import { NextRequest, NextResponse } from 'next/server';

// Read-only Solana RPC proxy. The browser can't use the public mainnet RPC (403 on
// browser-origin requests) and we don't want to expose the Helius key in the client
// bundle. The staking page points its Connection here for blockhash + account reads;
// transactions are still signed + broadcast by the user's wallet (Privy), never here.
// Method allowlist keeps this from being a free open relay.
const ALLOWED = new Set([
  'getLatestBlockhash', 'getLatestBlockhashAndContext', 'getRecentBlockhash',
  'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getTokenAccountBalance',
  'getSignatureStatuses', 'getMinimumBalanceForRentExemption', 'getFeeForMessage',
  'getBlockHeight', 'getSlot', 'getEpochInfo', 'getVersion', 'getGenesisHash',
]);

export async function POST(req: NextRequest) {
  const upstream = process.env.SOLANA_RPC_URL;
  if (!upstream) return NextResponse.json({ error: 'RPC not configured' }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const calls = Array.isArray(body) ? body : [body];
  for (const c of calls) {
    const m = (c as { method?: string })?.method;
    if (!m || !ALLOWED.has(m)) {
      return NextResponse.json({ error: `method not allowed: ${m}` }, { status: 403 });
    }
  }

  try {
    const r = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch {
    return NextResponse.json({ error: 'upstream failed' }, { status: 502 });
  }
}
