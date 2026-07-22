// Reliable transaction sending for the keeper.
//
// Every keeper money-move goes through sendReliably(): priority fee + compute
// budget on every tx, a fresh blockhash per attempt, and — critically — the tx
// is signed LOCALLY and its signature recorded BEFORE broadcast, so every
// attempt that could possibly have reached the chain is trackable. Before any
// resend (and before giving up) the recorded signatures are checked against
// getSignatureStatuses; a resend only happens once a successful status read
// says null AND the chain's block height has passed the attempt's
// lastValidBlockHeight — i.e. the tx is provably dead, not merely in flight or
// invisible to a lagging backend. A post-hoc balance re-read is racy (a lagging
// RPC node once made a landed deposit look failed, which parked it for retry
// and double-paid the staker — verified on-chain 2026-07-22); signature status
// plus the expiry gate is authoritative.
//
// If the chain state cannot be established at all, the helper throws
// OutcomeUnknownError naming the signatures instead of a normal failure —
// callers MUST NOT refund/park/fallback on it as if nothing was spent (that
// assumption is how funds get double-moved); they log it for manual
// reconciliation and, where money is at stake, treat it as spent.
//
// Keeper-only: imported by lib/keeper/onchain.ts (tsx process) and
// lib/keeper/onchain-rewards.ts. Pulls nothing beyond @solana/web3.js + bs58 so
// it stays safe for the Next bundle via the onchain-rewards import chain.

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Read at call time, not module load: static imports hoist above the keeper's
// inline .env.local loader, so a module-level read would miss the env file.
const cuPriceMicroLamports = () => Number(process.env.KEEPER_PRIORITY_FEE_MICROLAMPORTS || 150_000);

/** Thrown when the fate of at least one broadcast attempt cannot be proven
 *  either way. The funds MAY have moved — callers must not assume they didn't. */
export class OutcomeUnknownError extends Error {
  readonly sigs: string[];
  constructor(sigs: string[]) {
    super(
      `[keeper] send OUTCOME UNKNOWN — could not verify signature status for ${sigs.join(', ')}; ` +
      'manual reconciliation required, do NOT assume the funds did not move',
    );
    this.sigs = sigs;
  }
}
export const isOutcomeUnknown = (e: unknown): boolean =>
  e instanceof OutcomeUnknownError || /OUTCOME UNKNOWN/.test((e as Error)?.message || '');

type Attempt = { sig: string; lastValidBlockHeight: number };
type SentState = { state: 'landed'; sig: string } | { state: 'not-landed' } | { state: 'unknown' };

/**
 * Establish whether any prior attempt landed successfully.
 * - retries status reads (a single un-retried read against a lagging/429ing
 *   node is exactly the false-negative that causes double-sends)
 * - a 'processed' observation is STICKY: once a tx has been seen on chain, a
 *   later null from a lagging backend can only mean backend lag or an abandoned
 *   fork — indistinguishable, so the outcome degrades to 'unknown', never to a
 *   resend; a status with non-null err is landed-and-failed (final, safe to
 *   report not-landed-successfully)
 * - null is only trusted as not-landed once the chain's block height exceeds
 *   every attempt's lastValidBlockHeight — before that the tx may simply still
 *   be in flight
 * `patient: true` (the final pre-give-up check) keeps polling long enough for
 * an in-flight tx to either land or expire.
 */
async function checkSent(conn: Connection, sent: Attempt[], patient = false): Promise<SentState> {
  if (sent.length === 0) return { state: 'not-landed' };
  const sigs = sent.map((a) => a.sig);
  const maxLvbh = Math.max(...sent.map((a) => a.lastValidBlockHeight));
  const tries = patient ? 24 : 4;
  // Sticky per sig: once a sig has been seen at 'processed', a later null can
  // only mean backend lag or an abandoned fork — so it blocks 'not-landed'
  // until it either confirms (landed) or reports a definitive on-chain err
  // (final failure, cleared).
  const processedPending = new Set<string>();
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1500 * attempt, 5000));
    try {
      const statuses = (await conn.getSignatureStatuses(sigs, { searchTransactionHistory: true })).value;
      for (let i = 0; i < sigs.length; i++) {
        const st = statuses[i];
        if (!st) continue; // unseen (null blocks nothing by itself; height gate decides)
        if (st.err !== null) { processedPending.delete(sigs[i]); continue; } // landed-and-failed: final
        if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') {
          return { state: 'landed', sig: sigs[i] };
        }
        processedPending.add(sigs[i]); // on chain at 'processed' — wait for it to firm up
      }
      if (processedPending.size > 0) continue; // only 'landed' or 'unknown' while any sig is pending
      // Nothing visibly on chain: trust "not landed" only once every attempt is
      // past its expiry height — before that a null can just mean in-flight.
      const height = await conn.getBlockHeight('confirmed');
      if (height > maxLvbh) return { state: 'not-landed' };
    } catch {
      // status read failed — back off and retry, never conclude from a failed read
    }
  }
  return { state: 'unknown' };
}

/** Deterministic on-chain failures (program errors, slippage, bad funds) never
 *  fix themselves on a resend — don't burn attempts on them. Everything else —
 *  expiry, network flakes, 429s, and notably the transient preflight
 *  "Blockhash not found" (which web3.js also wraps as "Simulation failed") —
 *  is worth retrying. */
function isRetryable(err: unknown): boolean {
  const msg = (err as Error)?.message || '';
  return !/custom program error|insufficient funds|ExceededSlippage|failed on-chain/i.test(msg);
}

/**
 * Send a keeper transaction so it either lands exactly once or throws.
 * `buildIxs` is called fresh per attempt (so quotes/derived state can refresh);
 * the fee payer is always `signers[0]`. Throws OutcomeUnknownError when a
 * broadcast attempt's fate cannot be proven — see class docs for caller rules.
 */
export async function sendReliably(
  conn: Connection,
  buildIxs: () => TransactionInstruction[] | Promise<TransactionInstruction[]>,
  signers: Keypair[],
  opts?: { cuLimit?: number; attempts?: number },
): Promise<string> {
  const attempts = opts?.attempts ?? 4;
  const cuLimit = opts?.cuLimit ?? 200_000;
  const sent: Attempt[] = [];
  let lastErr: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // A prior "failed" attempt may have landed after its error was raised.
    const prior = await checkSent(conn, sent);
    if (prior.state === 'landed') return prior.sig;
    if (prior.state === 'unknown') break; // cannot prove not-landed → resending is unsafe

    try {
      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPriceMicroLamports() }),
        ...(await buildIxs()),
      );
      tx.feePayer = signers[0].publicKey;
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.sign(...signers);
      // Record the signature BEFORE broadcast: any error after this line — even
      // a dropped HTTP response — leaves the attempt trackable via checkSent,
      // so it can never be silently duplicated or falsely refunded.
      const sig = bs58.encode(tx.signature!);
      const raw = tx.serialize();
      sent.push({ sig, lastValidBlockHeight });
      try {
        await conn.sendRawTransaction(raw);
      } catch (sendErr) {
        // An RPC ERROR RESPONSE (SendTransactionError) is proof the tx was
        // rejected, never broadcast — drop the attempt so a transient preflight
        // flake doesn't hold the height gate hostage for its full validity
        // window. Ambiguous transport throws keep the attempt tracked.
        if (sendErr instanceof SendTransactionError) sent.pop();
        throw sendErr;
      }
      const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      if (conf.value.err !== null) {
        throw new Error(`transaction ${sig} failed on-chain: ${JSON.stringify(conf.value.err)}`);
      }
      return sig;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) break;
      if (attempt < attempts - 1) await sleep(1200);
    }
  }

  // Give up — but never report failure while an attempt might have landed.
  const final = await checkSent(conn, sent, true);
  if (final.state === 'landed') return final.sig;
  if (final.state === 'unknown') throw new OutcomeUnknownError(sent.map((a) => a.sig));
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
