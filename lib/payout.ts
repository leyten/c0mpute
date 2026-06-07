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

function loadTreasuryKeypair(): Keypair {
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
export async function getTokenUiBalance(walletAddress: string, mintAddress: string): Promise<number> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(walletAddress);
  const program = await tokenProgramFor(connection, mint);
  const ata = await getAssociatedTokenAddress(mint, owner, false, program);
  try {
    const bal = await connection.getTokenAccountBalance(ata);
    return bal.value.uiAmount ?? 0;
  } catch {
    return 0;
  }
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
