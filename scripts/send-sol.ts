// One-off: send native SOL from the treasury hot wallet to a destination.
//   tsx scripts/send-sol.ts <dest> <solAmount>            # dry check only
//   tsx scripts/send-sol.ts <dest> <solAmount> --send     # actually send
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i);
    if (k && !process.env[k]) process.env[k] = t.slice(i + 1);
  }
} catch {}

function loadTreasury(): Keypair {
  const raw = process.env.TREASURY_WALLET_KEY;
  if (!raw) throw new Error('TREASURY_WALLET_KEY not set');
  const trimmed = raw.trim();
  const secret = trimmed.startsWith('[') ? Uint8Array.from(JSON.parse(trimmed)) : bs58.decode(trimmed);
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const dest = process.argv[2];
  const sol = Number(process.argv[3]);
  const doSend = process.argv.includes('--send');
  if (!dest || !Number.isFinite(sol) || sol <= 0) {
    console.error('usage: tsx scripts/send-sol.ts <dest> <solAmount> [--send]');
    process.exit(1);
  }

  let destPk: PublicKey;
  try {
    destPk = new PublicKey(dest);
    if (!PublicKey.isOnCurve(destPk.toBytes())) {
      console.error('Destination is a valid base58 key but NOT on the ed25519 curve (likely not a wallet). Aborting.');
      process.exit(1);
    }
  } catch {
    console.error('Invalid Solana address — aborting.');
    process.exit(1);
  }

  const treasury = loadTreasury();
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const lamports = Math.round(sol * LAMPORTS_PER_SOL);
  const bal = await connection.getBalance(treasury.publicKey);
  console.log(`Treasury:   ${treasury.publicKey.toBase58()}`);
  console.log(`Balance:    ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`Dest:       ${destPk.toBase58()}`);
  console.log(`Send:       ${sol} SOL (${lamports} lamports)`);

  if (bal < lamports + 5000) {
    console.error('Insufficient treasury SOL balance (need amount + fee). Aborting.');
    process.exit(1);
  }

  if (!doSend) {
    console.log('DRY CHECK ok — re-run with --send to transfer.');
    return;
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: destPk, lamports }),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [treasury]);
  console.log(`SENT — signature: ${sig}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
