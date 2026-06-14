// Auto-refund of native SOL accidentally sent to a per-user USDC deposit wallet.
//
// Deposit wallets are meant to receive SPL tokens (USDC) only; they never need to
// hold SOL (the treasury pays all fees and co-signs sweeps). So any native SOL
// balance is a mistake — a user sending SOL instead of USDC. This detects that on
// a deposit check, finds who sent it, and sends it straight back (the deposit
// wallet itself signs and pays the ~5000-lamport fee). Surfaced to the user on the
// deposit page so they know to send USDC instead.
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { getDepositWalletSecret } from './db';

// Ignore dust below this (must comfortably exceed the network fee to be worth it).
const MIN_REFUND_LAMPORTS = 30_000; // ~0.00003 SOL
const LAMPORTS_PER_SOL = 1_000_000_000;

export type StraySolResult =
  | { kind: 'none' }
  | { kind: 'refunded'; sol: number; to: string; signature: string }
  | { kind: 'unknown_sender'; sol: number };

// Find who sent native SOL into `wallet` by scanning recent signatures for the
// most recent system-program transfer whose destination is this wallet. Returns
// the source address, or null if none can be identified (e.g. SOL arrived via a
// program/CPI we can't attribute) — in which case we never guess a destination.
export async function detectStraySolSender(
  connection: Connection,
  wallet: PublicKey,
): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(wallet, { limit: 25 });
  const walletStr = wallet.toBase58();
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getParsedTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const instrs = tx?.transaction.message.instructions ?? [];
    for (const ix of instrs as any[]) {
      if (
        ix.program === 'system' &&
        ix.parsed?.type === 'transfer' &&
        ix.parsed?.info?.destination === walletStr &&
        ix.parsed?.info?.source &&
        ix.parsed.info.source !== walletStr
      ) {
        return ix.parsed.info.source as string;
      }
    }
  }
  return null;
}

// Detect and refund stray native SOL on a deposit wallet. Idempotent: once the
// balance is returned the wallet sits at ~0, so a later check finds nothing.
export async function refundStraySol(
  privyId: string,
  depositAddress: string,
): Promise<StraySolResult> {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'confirmed',
  );
  const wallet = new PublicKey(depositAddress);

  const balance = await connection.getBalance(wallet);
  if (balance < MIN_REFUND_LAMPORTS) return { kind: 'none' };

  const sender = await detectStraySolSender(connection, wallet);
  if (!sender) return { kind: 'unknown_sender', sol: balance / LAMPORTS_PER_SOL };

  const secret = getDepositWalletSecret(privyId);
  if (!secret) return { kind: 'unknown_sender', sol: balance / LAMPORTS_PER_SOL };
  const kp = Keypair.fromSecretKey(secret);
  if (kp.publicKey.toBase58() !== depositAddress) {
    // key/address mismatch — never sign with a wallet we can't verify
    return { kind: 'unknown_sender', sol: balance / LAMPORTS_PER_SOL };
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  // Fee the deposit wallet itself pays; send everything else back.
  const feeProbe = new Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash }).add(
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(sender), lamports: 1 }),
  );
  const fee = (await connection.getFeeForMessage(feeProbe.compileMessage())).value ?? 5000;
  const amount = balance - fee;
  if (amount <= 0) return { kind: 'none' };

  const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash }).add(
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(sender), lamports: amount }),
  );
  tx.sign(kp);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  return { kind: 'refunded', sol: amount / LAMPORTS_PER_SOL, to: sender, signature };
}
