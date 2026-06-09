// On-chain primitives for the buyback/staking keeper.
//
// This module is the ONLY place that moves tokens on-chain for the keeper:
//   - claimCreatorFees() : pull pump.fun creator fees (USDC) into the treasury
//   - findGraduatedPool() : detect whether ZERO has graduated to a PumpSwap pool
//   - buyZeroWithUsdc()  : spend USDC from the treasury to buy ZERO on PumpSwap
//   - burnZero()         : burn an EXACT amount of ZERO from the treasury
//
// It is imported only by scripts/keeper.ts (run via tsx, never by the Next
// bundle) because it pulls in @coral-xyz/anchor + the PumpSwap SDK.
//
// SAFETY: every money-moving call is a no-op when KEEPER_DRY_RUN !== 'false'.
// The keeper defaults to dry-run so nothing moves until a human flips the env.

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  createBurnCheckedInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import * as anchor from '@coral-xyz/anchor';
const { BN } = anchor;
import {
  OnlinePumpAmmSdk,
  PumpAmmSdk,
  canonicalPumpPoolPda,
  coinCreatorVaultAuthorityPda,
  coinCreatorVaultAtaPda,
} from '@pump-fun/pump-swap-sdk';
import { getZeroMint, ZERO_DECIMALS } from '../tokenomics';
import pumpIdl from './pump-idl.json';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Deliberate pause after a claim tx before reading the dev-wallet balance to
// sweep it: gives the freshly-claimed fees time to land AND avoids hammering the
// RPC immediately after the claim (which 429s and stranded fees before). Tunable.
const RPC_SETTLE_MS = Number(process.env.KEEPER_RPC_SETTLE_MS || 60000);
// Slippage tolerance for the daily buyback swap, in pump-swap-sdk units where
// 1 = 1% (NOT a 0.0-1.0 fraction — passing 0.01 here means 0.01% and reverts
// with ExceededSlippage on any price move). Default 5% — the buyback is a small
// daily buy on a young, thin, volatile pool, so it needs real headroom.
const BUYBACK_SLIPPAGE = Number(process.env.BUYBACK_SLIPPAGE || 5);

export function isDryRun(): boolean {
  return process.env.KEEPER_DRY_RUN !== 'false';
}

function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

function loadKeypair(raw: string): Keypair {
  const trimmed = raw.trim();
  const secret = trimmed.startsWith('[') ? Uint8Array.from(JSON.parse(trimmed)) : bs58.decode(trimmed);
  return Keypair.fromSecretKey(secret);
}

function loadTreasury(): Keypair {
  const raw = process.env.TREASURY_WALLET_KEY;
  if (!raw) throw new Error('[Keeper] TREASURY_WALLET_KEY not set');
  return loadKeypair(raw);
}

/** The pump.fun dev wallet — the BondingCurve `creator` / creator-fee recipient. */
function loadDevWallet(): Keypair | null {
  const raw = process.env.PUMP_DEV_WALLET_KEY;
  if (!raw) return null;
  return loadKeypair(raw);
}

function zeroMintPubkey(): PublicKey {
  const m = getZeroMint();
  if (!m) throw new Error('[Keeper] ZERO_TOKEN_MINT not set');
  return new PublicKey(m);
}

/** Detect whether a mint is owned by classic SPL Token or Token-2022. */
async function mintTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`[Keeper] mint ${mint.toBase58()} not found on-chain`);
  return info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

async function tokenBalanceRaw(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): Promise<bigint> {
  const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgram);
  // Retry transient RPC failures (notably 429 rate-limits) with backoff. A
  // missing ATA genuinely means zero, so return 0 for that — but NEVER swallow a
  // rate-limit as 0: the fee-claim sweep keys off this balance, and a false 0
  // once silently stranded a full creator-fee claim in the dev wallet (claimed
  // from the vault but never swept to the treasury). On persistent failure we
  // throw so the caller logs a real error instead of skipping the sweep.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      return BigInt(bal.value.amount);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (/could not find account|account does not exist|Invalid param/i.test(msg)) {
        return BigInt(0);
      }
      lastErr = err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error(`[Keeper] token balance read failed after retries: ${(lastErr as Error)?.message ?? lastErr}`);
}

/**
 * Return the canonical PumpSwap pool for ZERO/USDC if it exists, else null.
 * The pool only exists after the coin graduates off the bonding curve, so a
 * null here is the keeper's signal to accumulate the buyback budget instead of
 * spending it.
 */
export async function findGraduatedPool(): Promise<PublicKey | null> {
  const connection = getConnection();
  const pool = canonicalPumpPoolPda(zeroMintPubkey(), USDC_MINT);
  const info = await connection.getAccountInfo(pool);
  return info ? pool : null;
}

/**
 * Claim pump.fun creator fees (USDC) using the dev wallet, then sweep them into
 * the treasury. Claims from BOTH the bonding-curve creator vault (pre-grad) and
 * the PumpSwap coin-creator vault (post-grad); whichever holds a balance pays
 * out. Returns the USDC (ui) amount that actually landed in the treasury, ready
 * for realizeFees(). 0 if dry-run or nothing to claim.
 */
export async function claimCreatorFees(): Promise<number> {
  const dev = loadDevWallet();
  if (!dev) {
    console.log('[Keeper] PUMP_DEV_WALLET_KEY not set — skipping fee claim');
    return 0;
  }
  if (isDryRun()) {
    console.log('[Keeper] DRY RUN — would claim creator fees with dev wallet');
    return 0;
  }

  const connection = getConnection();
  const treasury = loadTreasury();
  let claimAttempted = false;

  // Pre-grad: bonding-curve creator fees via the pump program (anchor resolves
  // the derived accounts from the IDL).
  try {
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(dev), { commitment: 'confirmed' });
    const program = new anchor.Program(pumpIdl as unknown as anchor.Idl, provider);
    // IDL is loaded untyped, so reach the generated method through `any`.
    await (program.methods as any)
      .collectCreatorFeeV2()
      .accounts({
        creator: dev.publicKey,
        quoteMint: USDC_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log('[Keeper] Claimed bonding-curve creator fees');
    claimAttempted = true;
  } catch (err) {
    console.log('[Keeper] No bonding-curve creator fees (or already graduated):', (err as Error).message);
  }

  // Post-grad: PumpSwap coin-creator fees via the AMM SDK.
  //
  // The SDK's collectCoinCreatorFeeSolanaState() HARDCODES the quote mint to
  // WSOL — it assumes the standard SOL-quoted pump.fun graduation. The ZERO
  // pool is USDC-quoted, so that path builds a claim against the (empty) WSOL
  // creator vault: the tx confirms, logs "claimed", and collects $0 while the
  // real fees pile up untouched in the USDC creator vault. We build the state
  // ourselves with the USDC quote so the collect targets the right vault.
  // withWsolAccount is a no-op for a non-WSOL mint, so it also won't create the
  // creator's USDC ATA for us — we create it idempotently when missing.
  try {
    const pool = await findGraduatedPool();
    if (pool) {
      const offline = new PumpAmmSdk();
      const quoteTokenProgram = TOKEN_PROGRAM_ID;
      const vaultAuthority = coinCreatorVaultAuthorityPda(dev.publicKey);
      const vaultAta = coinCreatorVaultAtaPda(vaultAuthority, USDC_MINT, quoteTokenProgram);
      const creatorUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, dev.publicKey, true, quoteTokenProgram);
      const [vaultInfo, creatorInfo] = await connection.getMultipleAccountsInfo([vaultAta, creatorUsdcAta]);
      const state = {
        coinCreator: dev.publicKey,
        quoteMint: USDC_MINT,
        quoteTokenProgram,
        coinCreatorVaultAuthority: vaultAuthority,
        coinCreatorVaultAta: vaultAta,
        coinCreatorTokenAccount: creatorUsdcAta,
        coinCreatorVaultAtaAccountInfo: vaultInfo,
        coinCreatorTokenAccountInfo: creatorInfo,
      };
      const ixs = await offline.collectCoinCreatorFee(state, dev.publicKey);
      if (ixs.length > 0) {
        const tx = new Transaction();
        if (!creatorInfo) {
          tx.add(createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, creatorUsdcAta, dev.publicKey, USDC_MINT, quoteTokenProgram));
        }
        tx.add(...ixs);
        tx.feePayer = dev.publicKey;
        await sendAndConfirmTransaction(connection, tx, [dev]);
        console.log('[Keeper] Claimed PumpSwap coin-creator fees (USDC)');
        claimAttempted = true;
      }
    }
  } catch (err) {
    console.log('[Keeper] No PumpSwap coin-creator fees:', (err as Error).message);
  }

  // Sweep the dev wallet's ENTIRE USDC balance, not just this run's delta. The
  // dev wallet is solely the creator-fee recipient, so all of its USDC is
  // creator fees — including any claimed manually outside the keeper (e.g. via
  // the pump.fun UI). Delta-only sweeping would strand those funds.
  // A confirmed claim can briefly lag the RPC's balance view (commitment race),
  // so an immediate read of 0 right after claiming would strand freshly-claimed
  // fees in the dev wallet (observed 2026-06-06: ~$510 claimed but read as 0, so
  // never swept). If we attempted a claim this cycle, poll before concluding 0.
  let claimedRaw: bigint;
  if (claimAttempted) {
    // A confirmed claim can lag the RPC's balance view, and the lagging amount is
    // often the BULK of the fees while a small stale balance reads first — so a
    // tiny leftover (e.g. $19) read too eagerly got swept while the freshly-claimed
    // bulk landed a moment later and was stranded (observed 2026-06-07: swept $19
    // while $1,704 sat behind). Wait a settle period first, then poll until the
    // balance STOPS INCREASING so the full claimed amount is captured.
    await sleep(RPC_SETTLE_MS);
    claimedRaw = await tokenBalanceRaw(connection, dev.publicKey, USDC_MINT, TOKEN_PROGRAM_ID);
    for (let i = 0; i < 8; i++) {
      await sleep(2500);
      const next = await tokenBalanceRaw(connection, dev.publicKey, USDC_MINT, TOKEN_PROGRAM_ID);
      if (next <= claimedRaw) break; // stabilized — no further fees settling in
      claimedRaw = next;
    }
  } else {
    claimedRaw = await tokenBalanceRaw(connection, dev.publicKey, USDC_MINT, TOKEN_PROGRAM_ID);
  }
  if (claimedRaw === BigInt(0)) return 0;

  // Sweep the claimed USDC into the treasury (treasury is fee payer, dev signs
  // as token authority — same pattern as the deposit sweep).
  const fromAta = await getAssociatedTokenAddress(USDC_MINT, dev.publicKey, false, TOKEN_PROGRAM_ID);
  const toAccount = await getOrCreateAssociatedTokenAccount(connection, treasury, USDC_MINT, treasury.publicKey);
  const sweepTx = new Transaction().add(
    createTransferInstruction(fromAta, toAccount.address, dev.publicKey, claimedRaw),
  );
  sweepTx.feePayer = treasury.publicKey;
  await sendAndConfirmTransaction(connection, sweepTx, [treasury, dev]);

  return Number(claimedRaw) / 10 ** USDC_DECIMALS;
}

/**
 * Spend `usdcUi` USDC from the treasury to buy ZERO on the PumpSwap pool.
 * Returns the EXACT raw ZERO amount received (measured as the treasury's ZERO
 * balance delta, never trusted from the SDK) plus the swap signature. Throws on
 * failure so the caller can refund the buyback bucket.
 */
export async function buyZeroWithUsdc(
  pool: PublicKey,
  usdcUi: number,
): Promise<{ zeroOutRaw: bigint; swapSig: string }> {
  if (isDryRun()) {
    console.log(`[Keeper] DRY RUN — would buy ZERO with $${usdcUi.toFixed(2)} USDC`);
    return { zeroOutRaw: BigInt(0), swapSig: 'dry-run' };
  }
  const connection = getConnection();
  const treasury = loadTreasury();
  const zeroMint = zeroMintPubkey();

  const online = new OnlinePumpAmmSdk(connection);
  const offline = new PumpAmmSdk();
  const state = await online.swapSolanaState(pool, treasury.publicKey);
  const usdcRaw = new BN(Math.round(usdcUi * 10 ** USDC_DECIMALS));
  const ixs = await offline.buyQuoteInput(state, usdcRaw, BUYBACK_SLIPPAGE);

  const tx = new Transaction().add(...ixs);
  tx.feePayer = treasury.publicKey;
  const swapSig = await sendAndConfirmTransaction(connection, tx, [treasury]);

  // Measure ZERO received from the CONFIRMED transaction's own balance changes
  // rather than a post-swap balance query: the latter races RPC commitment and
  // can read the stale pre-swap value (0), which once mis-flagged a real buy as
  // a failed swap — the ZERO got bought but never burned, and the bucket was
  // wrongly refunded. The tx meta is authoritative. Retry briefly in case the
  // parsed tx isn't indexed the instant after confirmation.
  const treasuryStr = treasury.publicKey.toBase58();
  const zeroStr = zeroMint.toBase58();
  let zeroOutRaw = BigInt(0);
  for (let attempt = 0; attempt < 5; attempt++) {
    const parsed = await connection.getParsedTransaction(swapSig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (parsed?.meta) {
      const pre = parsed.meta.preTokenBalances?.find((b) => b.owner === treasuryStr && b.mint === zeroStr);
      const post = parsed.meta.postTokenBalances?.find((b) => b.owner === treasuryStr && b.mint === zeroStr);
      const preAmt = pre ? BigInt(pre.uiTokenAmount.amount) : BigInt(0);
      const postAmt = post ? BigInt(post.uiTokenAmount.amount) : BigInt(0);
      zeroOutRaw = postAmt > preAmt ? postAmt - preAmt : BigInt(0);
      if (zeroOutRaw > BigInt(0)) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { zeroOutRaw, swapSig };
}

/**
 * Burn EXACTLY `zeroOutRaw` base units of ZERO from the treasury. The mint is
 * pinned to ZERO_TOKEN_MINT and the amount is the exact quantity passed in (the
 * delta the swap just produced) — never a balance read — so it is structurally
 * impossible to burn anything other than the ZERO just bought this cycle.
 */
export async function burnZero(zeroOutRaw: bigint): Promise<string> {
  if (zeroOutRaw <= BigInt(0)) throw new Error('[Keeper] refusing to burn a non-positive amount');
  if (isDryRun()) {
    console.log(`[Keeper] DRY RUN — would burn ${zeroOutRaw} raw ZERO`);
    return 'dry-run';
  }
  const connection = getConnection();
  const treasury = loadTreasury();
  const zeroMint = zeroMintPubkey();
  const zeroProgram = await mintTokenProgram(connection, zeroMint);
  const ata = await getAssociatedTokenAddress(zeroMint, treasury.publicKey, false, zeroProgram);

  const tx = new Transaction().add(
    createBurnCheckedInstruction(ata, zeroMint, treasury.publicKey, zeroOutRaw, ZERO_DECIMALS, [], zeroProgram),
  );
  tx.feePayer = treasury.publicKey;
  return sendAndConfirmTransaction(connection, tx, [treasury]);
}

/** UI ZERO amount from raw base units (for ledger/recordBurn). */
export function zeroRawToUi(raw: bigint): number {
  return Number(raw) / 10 ** ZERO_DECIMALS;
}
