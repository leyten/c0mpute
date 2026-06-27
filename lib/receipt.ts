/**
 * Shard receipt verification — the consumer side of the engine's signed per-stage receipts.
 *
 * shard/receipt.py (Python) PRODUCES: each stage chains sha256 of every (input, output)
 * activation it processes and signs the pair of running roots with its node key (ed25519).
 * This module CONSUMES: verifies signatures and checks layer coverage [0:N] no gaps.
 *
 * Pure engine boundary law: shard knows activations/hashes/keys; c0mpute knows accounts/$.
 * The bridge: receipt pubkey -> PeerId -> c0mpute account (lib/identity.ts + db.ts bindPeerId).
 *
 * ZERO NEW DEPS: uses node:crypto (same ed25519 verify path as lib/identity.ts).
 *
 * Canonicalization MUST match shard/receipt.py _canonical() EXACTLY:
 *   JSON.stringify of the receipt minus "sig", with sorted keys and no whitespace.
 *   JS's JSON.stringify with a sorted replacer matches Python's json.dumps(sort_keys=True,
 *   separators=(",",":")) for the shapes these receipts take (flat dict of str/num/None).
 */
import { createPublicKey, verify as edVerify, createHash } from 'node:crypto';

export const RECEIPT_SCHEMA = 'shard-receipt/1';

export class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptError';
  }
}

export interface ShardReceipt {
  schema: string;
  swarm_id: string;
  job_id: string;
  layer_start: number;
  layer_end: number;
  n_chunks: number;
  in_root: string; // hex sha256
  out_root: string; // hex sha256
  pubkey: string; // base64 ed25519 public key (32 bytes raw)
  sig: string; // base64 ed25519 signature
}

/**
 * Deterministic canonical bytes signed over: the receipt minus "sig", sorted keys, compact.
 * Matches Python: json.dumps({k:v for k,v in r.items() if k != "sig"}, sort_keys=True,
 * separators=(",",":"), ensure_ascii=False).encode("utf-8")
 */
function canonical(receipt: Record<string, unknown>): Buffer {
  const m: Record<string, unknown> = {};
  for (const k of Object.keys(receipt).sort()) {
    if (k !== 'sig') m[k] = receipt[k];
  }
  // JSON.stringify with no whitespace. Python's ensure_ascii=False means non-ASCII chars
  // are passed through; JS stringify does this natively (no \uXXXX escaping for BMP chars).
  return Buffer.from(JSON.stringify(m), 'utf-8');
}

/**
 * Verify one receipt's ed25519 signature. Fail closed (throw ReceiptError) on any issue.
 *
 * @param receipt  The receipt dict (must have schema, pubkey, sig)
 * @param expectedPubkey  Optional: the base64 pubkey c0mpute expects for this signer
 *                        (from PeerId binding). If set and mismatched, fail.
 */
export function verifyReceipt(
  receipt: Record<string, unknown>,
  expectedPubkey?: string,
): void {
  const schema = receipt['schema'];
  if (schema !== RECEIPT_SCHEMA) {
    throw new ReceiptError(`unknown receipt schema ${JSON.stringify(schema)}`);
  }
  const pubB64 = receipt['pubkey'];
  const sigB64 = receipt['sig'];
  if (!pubB64 || typeof pubB64 !== 'string') {
    throw new ReceiptError('receipt is unsigned (missing pubkey)');
  }
  if (!sigB64 || typeof sigB64 !== 'string') {
    throw new ReceiptError('receipt is unsigned (missing sig)');
  }
  if (expectedPubkey !== undefined && pubB64 !== expectedPubkey) {
    throw new ReceiptError('receipt signer is not the node assigned this block');
  }
  try {
    const rawPub = Buffer.from(pubB64, 'base64');
    if (rawPub.length !== 32) {
      throw new ReceiptError(`bad pubkey length ${rawPub.length} (expected 32)`);
    }
    // Wrap raw ed25519 key in SPKI DER (same pattern as lib/identity.ts)
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPub]);
    const pub = createPublicKey({ key: der, format: 'der', type: 'spki' });
    const sig = Buffer.from(sigB64, 'base64');
    const msg = canonical(receipt);
    const ok = edVerify(null, msg, pub, sig);
    if (!ok) {
      throw new ReceiptError('signature verification failed');
    }
  } catch (e) {
    if (e instanceof ReceiptError) throw e;
    throw new ReceiptError(`signature verification failed: ${(e as Error).name}`);
  }
}

/**
 * Verify a job's full set of per-stage receipts and check layer coverage.
 *
 * (1) Each receipt's signature must verify.
 * (2) The layer blocks must tile [0, layerCount) with no gap or overlap.
 * (3) Optionally, each signer's pubkey must match the block c0mpute assigned it.
 *
 * Matches shard/receipt.py verify_coverage() exactly.
 *
 * @param receipts       Array of receipt dicts from the coordinator
 * @param layerCount     Total layers in the model (e.g. 62 for MiniMax-M2.5, 78 for GLM-5.2)
 * @param expectedBySigner  Optional: Map<pubkey, [layerStart, layerEnd]> for pinning
 */
export function verifyCoverage(
  receipts: Record<string, unknown>[],
  layerCount: number,
  expectedBySigner?: Map<string, [number, number]>,
): void {
  const spans: [number, number][] = [];
  for (const r of receipts) {
    verifyReceipt(r, undefined);
    const lo = r['layer_start'] as number;
    const hi = r['layer_end'] as number;
    if (!(0 <= lo && lo < hi && hi <= layerCount)) {
      throw new ReceiptError(`receipt block [${lo}:${hi}] outside [0:${layerCount}]`);
    }
    if (expectedBySigner) {
      const pub = r['pubkey'] as string;
      const want = expectedBySigner.get(pub);
      if (want && (want[0] !== lo || want[1] !== hi)) {
        throw new ReceiptError(
          `signer ${pub.slice(0, 12)}.. attested [${lo}:${hi}], assigned [${want[0]}:${want[1]}]`,
        );
      }
    }
    spans.push([lo, hi]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [lo, hi] of spans) {
    if (lo !== cursor) {
      throw new ReceiptError(
        `layer coverage broken at ${cursor}: next block starts ${lo} (gap or overlap)`,
      );
    }
    cursor = hi;
  }
  if (cursor !== layerCount) {
    throw new ReceiptError(`layer coverage ends at ${cursor}, expected ${layerCount}`);
  }
}

/**
 * Extract the raw 32-byte ed25519 public key from a base64 receipt pubkey,
 * then encode it as a libp2p PeerId (for db lookup -> account attribution).
 *
 * The receipt pubkey is raw 32 bytes (base64). The PeerId framing is:
 * [0x00 identity-mh][0x24 len=36][0x08 0x01 (Ed25519)][0x12 0x20 (32 bytes)][key], base58.
 * This is the INVERSE of lib/identity.ts ed25519PubFromPeerId.
 */
export function pubkeyToPeerId(pubB64: string): string {
  const rawPub = Buffer.from(pubB64, 'base64');
  if (rawPub.length !== 32) throw new ReceiptError(`bad pubkey length ${rawPub.length}`);
  const framing = Buffer.from([0x00, 0x24, 0x08, 0x01, 0x12, 0x20]);
  const bytes = Buffer.concat([framing, rawPub]);
  return base58encode(bytes);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58encode(buf: Buffer): string {
  let digits: number[] = [];
  for (let bi = 0; bi < buf.length; bi++) {
    let carry = buf[bi];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  // leading zero bytes -> leading '1'
  let leading = 0;
  for (let bi = 0; bi < buf.length; bi++) {
    if (buf[bi] === 0) leading++;
    else break;
  }
  let out = '1'.repeat(leading);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}
