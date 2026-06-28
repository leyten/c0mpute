/**
 * Shard ring pay-split — divide one job's worker pay across the N stage workers.
 *
 * A sharded job is served by a RING of workers, each holding a contiguous block of the
 * model's layers and signing a per-stage receipt (shard/receipt.py). The orchestrator
 * verifies coverage (lib/receipt.ts verifyCoverage) then must pay EVERY stage, not just
 * the coordinator. This module computes each signer's share.
 *
 * Boundary law: pure arithmetic over verified receipts + a total. Knows layers and
 * pubkeys; the caller maps pubkey -> PeerId -> account (lib/receipt.ts pubkeyToPeerId,
 * db.bindPeerId) and moves the credits. No socket, no db, no deps — so it's $0-testable.
 *
 * Default policy: PROPORTIONAL TO LAYER COUNT. A stage holding 40 layers did more
 * forward-compute than one holding 19, so it earns more. Largest-remainder rounding keeps
 * the integer-credit shares summing EXACTLY to the total (no dust lost or minted).
 */
import type { ShardReceipt } from '../receipt';

export type SplitPolicy = 'proportional' | 'equal';

export interface StageShare {
  pubkey: string; // base64 ed25519 — caller maps to PeerId/account
  layerStart: number;
  layerEnd: number;
  nLayers: number;
  payoutCredits: number; // integer credits, shares sum to the input total
}

/**
 * Split `totalCredits` across the receipts' signers.
 *
 * @param receipts  Per-stage receipts (ALREADY signature+coverage verified by the caller).
 * @param totalCredits  Whole job pay basis in integer credits.
 * @param policy  'proportional' (default, by layer count) or 'equal' (per stage).
 * @returns one StageShare per UNIQUE signer, payouts summing exactly to totalCredits.
 *
 * Throws on empty receipts or a signer attesting two disjoint blocks (ambiguous — the
 * ring assembly guarantees one block per node, so this is a tamper/bug signal).
 */
export function splitRingPayout(
  receipts: Pick<ShardReceipt, 'pubkey' | 'layer_start' | 'layer_end'>[],
  totalCredits: number,
  policy: SplitPolicy = 'proportional',
): StageShare[] {
  if (!receipts || receipts.length === 0) {
    throw new Error('splitRingPayout: no receipts');
  }
  if (!Number.isFinite(totalCredits) || totalCredits < 0) {
    throw new Error(`splitRingPayout: bad totalCredits ${totalCredits}`);
  }

  // One stage per unique signer. The ring assigns each node exactly one contiguous block,
  // so a pubkey appearing twice with different spans is a protocol violation — reject it
  // rather than silently pay the wrong amount.
  const bySigner = new Map<string, StageShare>();
  for (const r of receipts) {
    const pub = r.pubkey;
    const lo = r.layer_start;
    const hi = r.layer_end;
    const existing = bySigner.get(pub);
    if (existing) {
      if (existing.layerStart !== lo || existing.layerEnd !== hi) {
        throw new Error(`splitRingPayout: signer ${pub.slice(0, 12)}.. attested two blocks`);
      }
      continue; // exact duplicate receipt — collapse it
    }
    bySigner.set(pub, {
      pubkey: pub,
      layerStart: lo,
      layerEnd: hi,
      nLayers: hi - lo,
      payoutCredits: 0,
    });
  }

  const stages = [...bySigner.values()];
  // Stable order for deterministic largest-remainder rounding: by layer block.
  stages.sort((a, b) => a.layerStart - b.layerStart);

  // Weight per stage: layer count (proportional) or 1 (equal).
  const weights = stages.map((s) => (policy === 'equal' ? 1 : s.nLayers));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    throw new Error('splitRingPayout: zero total weight');
  }

  // Largest-remainder: floor each share, then hand the leftover credits to the stages
  // with the biggest fractional remainder. Guarantees sum(shares) === totalCredits exactly.
  const exact = stages.map((_, i) => (totalCredits * weights[i]) / weightSum);
  const floors = exact.map((x) => Math.floor(x));
  let assigned = floors.reduce((a, b) => a + b, 0);
  let leftover = totalCredits - assigned;
  const order = stages
    .map((_, i) => i)
    .sort((a, b) => (exact[b] - floors[b]) - (exact[a] - floors[a]) || weights[b] - weights[a]);
  for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
    floors[order[k]] += 1;
    leftover -= 1;
  }
  stages.forEach((s, i) => {
    s.payoutCredits = floors[i];
  });
  return stages;
}
