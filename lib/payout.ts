// Treasury-side USDC payout. Signs and sends an SPL USDC transfer from the
// TREASURY_WALLET_KEY hot wallet to a worker-supplied destination address.
//
// The worker never signs anything: identity is proved by their Privy (X) login
// and the destination is just an address they type in. All trust sits on the
// server holding the treasury key, which is why the withdraw endpoint debits
// the worker's ledger balance atomically *before* calling this.
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { USDC_MINT } from './token-price';

const USDC_DECIMALS = 6;

// Resolve the SPL program that owns a mint. $ZERO is a Token-2022 mint, USDC is
// legacy SPL — assuming the legacy program (the spl-token default) makes ATA
// derivation point at a nonexistent account, which silently read every staker's
// balance as 0. Always detect from the mint's account owner.
async function tokenProgramFor(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (info && info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

export function isTreasuryConfigured(): boolean {
  return !!process.env.TREASURY_WALLET_KEY;
}

export function loadTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_WALLET_KEY;
  if (!raw) throw new Error('TREASURY_WALLET_KEY not set');
  const trimmed = raw.trim();
  // Accept either a JSON byte array (solana-keygen export) or a base58 secret key.
  const secret = trimmed.startsWith('[')
    ? Uint8Array.from(JSON.parse(trimmed))
    : bs58.decode(trimmed);
  return Keypair.fromSecretKey(secret);
}

/**
 * Send `amountUsd` of USDC (1 USDC = $1) from the treasury to `destAddress`.
 * Returns the confirmed transaction signature. Throws on any failure so the
 * caller can mark the payout failed and restore the worker's balance.
 */
export async function sendUsdc(destAddress: string, amountUsd: number): Promise<string> {
  const treasury = loadTreasuryKeypair();
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const mint = new PublicKey(USDC_MINT);
  const dest = new PublicKey(destAddress);
  const baseUnits = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));

  const fromAta = await getAssociatedTokenAddress(mint, treasury.publicKey);
  // Creates the destination ATA if it doesn't exist (treasury pays the rent).
  const toAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    dest,
  );

  const tx = new Transaction().add(
    createTransferInstruction(fromAta, toAccount.address, treasury.publicKey, baseUnits),
  );

  return sendAndConfirmTransaction(connection, tx, [treasury]);
}

/**
 * Sweep the entire balance of `mintAddress` out of a per-user deposit wallet
 * into the treasury. The deposit wallet holds no SOL, so the treasury is the
 * fee payer while the deposit wallet co-signs as the token authority — one
 * atomic transfer, no SOL ever sent to the deposit wallet. Returns the tx
 * signature, or null if there's nothing to sweep. Throws on failure so the
 * caller can leave deposit-progress untouched and retry later.
 */
export async function sweepDepositToken(
  depositSecret: Uint8Array,
  mintAddress: string,
): Promise<string | null> {
  const treasury = loadTreasuryKeypair();
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const depositKeypair = Keypair.fromSecretKey(depositSecret);
  const mint = new PublicKey(mintAddress);
  const fromAta = await getAssociatedTokenAddress(mint, depositKeypair.publicKey);

  let rawAmount: bigint;
  try {
    const bal = await connection.getTokenAccountBalance(fromAta);
    rawAmount = BigInt(bal.value.amount);
  } catch {
    return null; // ATA never created → nothing deposited
  }
  if (rawAmount === BigInt(0)) return null;

  // Treasury's own ATA for this mint (created once, treasury pays the rent).
  const toAccount = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);

  const tx = new Transaction().add(
    createTransferInstruction(fromAta, toAccount.address, depositKeypair.publicKey, rawAmount),
  );
  tx.feePayer = treasury.publicKey;

  return sendAndConfirmTransaction(connection, tx, [treasury, depositKeypair]);
}

/**
 * Read the on-chain UI balance of `mintAddress` held by `walletAddress`.
 * Returns 0 if the ATA doesn't exist yet. Used to sync custodial stake to chain.
 */
export async function getTokenUiBalance(
  walletAddress: string,
  mintAddress: string,
  opts?: { throwOnError?: boolean },
): Promise<number> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(walletAddress);
  // Retry transient RPC failures (notably 429 rate-limits) with backoff. A
  // genuinely-missing ATA means zero. On PERSISTENT failure: legacy display
  // callers get 0, but pass { throwOnError: true } to get a throw instead — so
  // the keeper resync SKIPS a wallet rather than silently zeroing its stake when
  // the RPC is rate-limiting.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const program = await tokenProgramFor(connection, mint);
      const ata = await getAssociatedTokenAddress(mint, owner, false, program);
      const bal = await connection.getTokenAccountBalance(ata);
      return bal.value.uiAmount ?? 0;
    } catch (err) {
      const msg = (err as Error).message || '';
      if (/could not find account|account does not exist|Invalid param/i.test(msg)) return 0;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  if (opts?.throwOnError) {
    throw new Error(`[payout] token balance read failed after retries: ${(lastErr as Error)?.message ?? lastErr}`);
  }
  return 0;
}

/**
 * Batch version of getTokenUiBalance: one getMultipleAccountsInfo call per 100
 * wallets instead of one round-trip (plus throttle sleep) per wallet — the
 * per-wallet loop was 27 of the keeper cycle's 32 minutes at 1,041 stakers.
 * Returns wallet -> UI balance; a missing ATA is a real 0, but a wallet whose
 * chunk failed after retries maps to null and the caller must SKIP it (same
 * never-zero-a-staker-on-RPC-failure rule as { throwOnError: true } above).
 */
export async function getTokenUiBalancesBatch(
  walletAddresses: string[],
  mintAddress: string,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (walletAddresses.length === 0) return out;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(mintAddress);

  // Retry the two mint-metadata reads: a single transient 429 here would abort
  // the whole batch (and with it the day's resync), where the old per-wallet
  // path only skipped one wallet.
  const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await fn(); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
    }
    throw lastErr;
  };
  const program = await withRetry(() => tokenProgramFor(connection, mint));
  const mintInfo = await withRetry(() => connection.getParsedAccountInfo(mint));
  const decimals = (mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } })?.parsed?.info?.decimals;
  if (typeof decimals !== 'number') throw new Error(`[payout] could not read decimals for mint ${mintAddress}`);

  // Derive each wallet's ATA; a malformed address just maps to null (skipped).
  const entries: { wallet: string; ata: PublicKey }[] = [];
  for (const wallet of walletAddresses) {
    try {
      entries.push({ wallet, ata: await getAssociatedTokenAddress(mint, new PublicKey(wallet), false, program) });
    } catch {
      out.set(wallet, null);
    }
  }

  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    let infos: ({ data: Buffer } | null)[] | null = null;
    for (let attempt = 0; attempt < 4 && !infos; attempt++) {
      try {
        infos = await connection.getMultipleAccountsInfo(chunk.map((e) => e.ata));
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    for (let j = 0; j < chunk.length; j++) {
      if (!infos) { out.set(chunk[j].wallet, null); continue; } // chunk read failed — skip, never 0
      const info = infos[j];
      // SPL token account layout (legacy + Token-2022 base): amount u64 LE at
      // offset 64. An account at the ATA address that is NOT a token account
      // (anyone can send 1 lamport there and create a 0-byte system account)
      // holds no tokens — treat as 0, don't let a short buffer throw and kill
      // the whole resync.
      out.set(chunk[j].wallet, info && info.data.length >= 72 ? Number(info.data.readBigUInt64LE(64)) / 10 ** decimals : 0);
    }
  }
  return out;
}

/**
 * Transfer `uiAmount` of `mintAddress` (with `decimals`) out of a per-user
 * staking wallet to `destAddress` (an unstake). Like the deposit sweep, the
 * staking wallet holds no SOL, so the treasury is fee payer while the staking
 * wallet co-signs as token authority. Treasury pays the destination ATA rent if
 * needed. Returns the tx signature. Throws on failure so the caller can leave
 * the stake untouched.
 */
export async function sendTokenFromWallet(
  walletSecret: Uint8Array,
  mintAddress: string,
  destAddress: string,
  uiAmount: number,
  decimals: number,
): Promise<string> {
  const treasury = loadTreasuryKeypair();
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const wallet = Keypair.fromSecretKey(walletSecret);
  const mint = new PublicKey(mintAddress);
  const dest = new PublicKey(destAddress);
  const baseUnits = BigInt(Math.round(uiAmount * 10 ** decimals));

  const program = await tokenProgramFor(connection, mint);
  const fromAta = await getAssociatedTokenAddress(mint, wallet.publicKey, false, program);
  const toAccount = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, dest, false, undefined, undefined, program);

  const tx = new Transaction().add(
    createTransferInstruction(fromAta, toAccount.address, wallet.publicKey, baseUnits, [], program),
  );
  tx.feePayer = treasury.publicKey;

  return sendAndConfirmTransaction(connection, tx, [treasury, wallet]);
}
