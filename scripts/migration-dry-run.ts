// READ-ONLY migration dry-run report. No funds move. Lists every custodial staker,
// their live on-chain ZERO, and whether they have a linked wallet to receive it.
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    const k = t.slice(0, i); if (k && !process.env[k]) process.env[k] = t.slice(i + 1);
  }
} catch {}
import Database from 'better-sqlite3';
import path from 'path';
import { getZeroMint } from '../lib/tokenomics';
import { getTokenUiBalance } from '../lib/payout';

const db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'), { readonly: true });
const mint = getZeroMint();
if (!mint) { console.error('ZERO mint not set'); process.exit(1); }

const wallets = db.prepare('SELECT privy_id, public_key FROM staking_wallets').all() as { privy_id: string; public_key: string }[];
const profiles = new Map<string, { wallet_address: string | null; x_username: string | null }>();
for (const p of db.prepare('SELECT privy_id, wallet_address, x_username FROM profiles').all() as any[]) profiles.set(p.privy_id, p);

async function main() {
  let migZero = 0, gatedZero = 0, empty = 0, mig = 0, gated = 0;
  for (const w of wallets) {
    const bal = await getTokenUiBalance(w.public_key, mint!);
    const prof = profiles.get(w.privy_id);
    const linked = prof?.wallet_address && prof.wallet_address.trim() !== '';
    if (bal <= 0.000001) { empty++; continue; }
    if (linked) { mig++; migZero += bal; }
    else { gated++; gatedZero += bal; }
  }
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  console.log('=== MIGRATION DRY-RUN (mainnet, read-only) ===');
  console.log(`total custodial staking wallets: ${wallets.length}`);
  console.log(`MIGRATABLE NOW (has linked wallet): ${mig} stakers, ${fmt(migZero)} ZERO`);
  console.log(`GATED (no linked wallet, needs connect): ${gated} stakers, ${fmt(gatedZero)} ZERO`);
  console.log(`EMPTY (0 balance, skip): ${empty}`);
  console.log(`TOTAL staked across all: ${fmt(migZero + gatedZero)} ZERO`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
