// Client helpers for the on-chain $ZERO staking + rewards programs.
// Builds the exact instructions proven in zero-staking/test/*.mjs and packs them into
// an unsigned transaction for Privy's signAndSendTransaction (user signs with Phantom).
//
// Self-custody: stake/unstake live in the staking program (ZERO, Token-2022); reward
// claims live in the rewards program (USDC, classic SPL). No server key moves funds.
import {
  Connection, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from '@solana/spl-token';

// ── config (env-driven; devnet defaults so the test page works out of the box) ──
export const RPC_URL = process.env.NEXT_PUBLIC_ONCHAIN_RPC || 'https://api.devnet.solana.com';
export const SOLANA_CHAIN = process.env.NEXT_PUBLIC_SOLANA_CHAIN || 'solana:devnet';
export const STAKING_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || 'BU3JcQJBsFZwNV2DHSPeu3hKLsfarLS2AU5RuVhJrYKM');
export const REWARDS_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_REWARDS_PROGRAM_ID || 'EfW8KpmWGwBcDVcq4Qj6F3EYeMMGEcrS4BnKnDyQqvqW');
// Mints have no safe default (no devnet $ZERO/USDC); must be set per environment.
export const ZERO_MINT = process.env.NEXT_PUBLIC_STAKE_MINT || '';
export const USDC_MINT = process.env.NEXT_PUBLIC_ONCHAIN_USDC_MINT || '';
export const ZERO_DECIMALS = 6;
export const USDC_DECIMALS = 6;

export const connection = () => new Connection(RPC_URL, 'confirmed');

const u64le = (n: bigint): Buffer => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b;
};
export const toBase = (uiAmount: number, decimals: number): bigint =>
  BigInt(Math.round(uiAmount * 10 ** decimals));
export const fromBase = (raw: bigint | number, decimals: number): number =>
  Number(raw) / 10 ** decimals;

// ── PDA + ATA derivation (must match the on-chain programs) ──
export function stakeAuthority(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('stake'), owner.toBuffer()], STAKING_PROGRAM_ID)[0];
}
export function rewardAuthority(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('reward'), owner.toBuffer()], REWARDS_PROGRAM_ID)[0];
}
export function stakeVault(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, stakeAuthority(owner), true, TOKEN_2022_PROGRAM_ID);
}
export function rewardVault(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, rewardAuthority(owner), true, TOKEN_PROGRAM_ID);
}

// ── instruction builders (account order/flags mirror the tested programs) ──
function stakeIx(owner: PublicKey, mint: PublicKey, amount: bigint): TransactionInstruction {
  const auth = stakeAuthority(owner);
  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: false, isWritable: false },                 // beneficiary
      { pubkey: auth, isSigner: false, isWritable: false },                  // stake_authority PDA
      { pubkey: stakeVault(owner, mint), isSigner: false, isWritable: true },// stake_vault
      { pubkey: owner, isSigner: true, isWritable: false },                  // depositor (signer)
      { pubkey: getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0]), u64le(amount)]),
  });
}
function unstakeIx(owner: PublicKey, mint: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },                  // owner (signer)
      { pubkey: stakeAuthority(owner), isSigner: false, isWritable: false }, // stake_authority PDA
      { pubkey: stakeVault(owner, mint), isSigner: false, isWritable: true },// stake_vault
      { pubkey: getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([1]), u64le(amount)]),
  });
}
function claimIx(owner: PublicKey, mint: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: REWARDS_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },                   // owner (signer)
      { pubkey: rewardAuthority(owner), isSigner: false, isWritable: false }, // reward_authority PDA
      { pubkey: rewardVault(owner, mint), isSigner: false, isWritable: true },// reward_vault
      { pubkey: getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([1]), u64le(amount)]),
  });
}

// ── tx assembly: returns an UNSIGNED serialized tx (Uint8Array) for Privy ──
async function buildTx(owner: PublicKey, ixs: TransactionInstruction[]): Promise<Uint8Array> {
  const conn = connection();
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.feePayer = owner;
  tx.recentBlockhash = blockhash;
  ixs.forEach((ix) => tx.add(ix));
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

export async function buildStakeTx(owner: PublicKey, uiAmount: number): Promise<Uint8Array> {
  const mint = new PublicKey(ZERO_MINT);
  // ensure the user's stake vault ATA exists (idempotent; owner pays rent)
  const ensureVault = createAssociatedTokenAccountIdempotentInstruction(
    owner, stakeVault(owner, mint), stakeAuthority(owner), mint, TOKEN_2022_PROGRAM_ID);
  return buildTx(owner, [ensureVault, stakeIx(owner, mint, toBase(uiAmount, ZERO_DECIMALS))]);
}
export async function buildUnstakeTx(owner: PublicKey, uiAmount: number): Promise<Uint8Array> {
  const mint = new PublicKey(ZERO_MINT);
  const ensureDest = createAssociatedTokenAccountIdempotentInstruction(
    owner, getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID), owner, mint, TOKEN_2022_PROGRAM_ID);
  return buildTx(owner, [ensureDest, unstakeIx(owner, mint, toBase(uiAmount, ZERO_DECIMALS))]);
}
export async function buildClaimTx(owner: PublicKey, uiAmount: number): Promise<Uint8Array> {
  const mint = new PublicKey(USDC_MINT);
  const ensureDest = createAssociatedTokenAccountIdempotentInstruction(
    owner, getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID), owner, mint, TOKEN_PROGRAM_ID);
  return buildTx(owner, [ensureDest, claimIx(owner, mint, toBase(uiAmount, USDC_DECIMALS))]);
}

// ── read on-chain balances ──
async function vaultBalance(vault: PublicKey, tokenProgram: PublicKey, decimals: number): Promise<number> {
  try {
    const acc = await getAccount(connection(), vault, 'confirmed', tokenProgram);
    return fromBase(acc.amount, decimals);
  } catch { return 0; } // ATA not created yet = 0
}
export const readStaked = (owner: PublicKey) =>
  ZERO_MINT ? vaultBalance(stakeVault(owner, new PublicKey(ZERO_MINT)), TOKEN_2022_PROGRAM_ID, ZERO_DECIMALS) : Promise.resolve(0);
export const readClaimable = (owner: PublicKey) =>
  USDC_MINT ? vaultBalance(rewardVault(owner, new PublicKey(USDC_MINT)), TOKEN_PROGRAM_ID, USDC_DECIMALS) : Promise.resolve(0);

export const mintsConfigured = () => Boolean(ZERO_MINT && USDC_MINT);
