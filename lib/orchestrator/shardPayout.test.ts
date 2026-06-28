/**
 * Offline proof for splitRingPayout — $0, no socket, no GPU, no db.
 *   npx tsx lib/orchestrator/shardPayout.test.ts
 *
 * Asserts the ring pay-split is correct: proportional-by-layers default, equal mode,
 * exact integer conservation (shares sum to the total, no dust), duplicate-receipt
 * collapse, and rejection of a signer attesting two blocks.
 */
import { splitRingPayout, type SplitPolicy } from './shardPayout';

let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) {
    console.error(`  FAIL ${name} ${detail}`);
    process.exit(1);
  }
  passed++;
  console.log(`  OK ${name}${detail ? ' ' + detail : ''}`);
}

function rcpt(pubkey: string, lo: number, hi: number) {
  return { pubkey, layer_start: lo, layer_end: hi };
}

// ── proportional split: 78-layer GLM across 40/19/19 ──
{
  const receipts = [rcpt('A', 0, 40), rcpt('B', 40, 59), rcpt('C', 59, 78)];
  const shares = splitRingPayout(receipts, 1000, 'proportional');
  const sum = shares.reduce((a, s) => a + s.payoutCredits, 0);
  check('proportional sums to total', sum === 1000, `sum=${sum}`);
  const byPub = Object.fromEntries(shares.map((s) => [s.pubkey, s.payoutCredits]));
  // 40/78*1000=512.8, 19/78*1000=243.6 each. floors 512/243/243=998, +2 leftover by
  // largest remainder -> A(.82) first, then one of the two .59 ties -> 513/244/243.
  check('fat stage earns most', byPub['A'] > byPub['B'] && byPub['A'] > byPub['C'],
        JSON.stringify(byPub));
  // two identical-size stages can differ by at most 1 credit (odd leftover, integer
  // conservation) — exact-equal is impossible without minting/dropping a credit.
  check('equal blocks within 1 credit', Math.abs(byPub['B'] - byPub['C']) <= 1,
        JSON.stringify(byPub));
  check('proportional fat share is 513', byPub['A'] === 513, JSON.stringify(byPub));
}

// ── equal split: each stage same regardless of block size ──
{
  const receipts = [rcpt('A', 0, 40), rcpt('B', 40, 59), rcpt('C', 59, 78)];
  const shares = splitRingPayout(receipts, 999, 'equal');
  const sum = shares.reduce((a, s) => a + s.payoutCredits, 0);
  check('equal sums to total', sum === 999, `sum=${sum}`);
  const vals = shares.map((s) => s.payoutCredits).sort();
  // 999/3 = 333 exactly
  check('equal three-way 333 each', vals.join(',') === '333,333,333', vals.join(','));
}

// ── conservation under nasty rounding: 100 credits / 3 unequal stages ──
{
  const receipts = [rcpt('A', 0, 1), rcpt('B', 1, 2), rcpt('C', 2, 100)];
  const shares = splitRingPayout(receipts, 100, 'proportional');
  const sum = shares.reduce((a, s) => a + s.payoutCredits, 0);
  check('rounding conserves exactly', sum === 100, `sum=${sum}`);
  // the 98-layer stage should dominate
  const c = shares.find((s) => s.pubkey === 'C')!;
  check('dominant stage ~98%', c.payoutCredits >= 96, `C=${c.payoutCredits}`);
}

// ── zero total -> all zero, no throw ──
{
  const shares = splitRingPayout([rcpt('A', 0, 40), rcpt('B', 40, 78)], 0);
  const sum = shares.reduce((a, s) => a + s.payoutCredits, 0);
  check('zero total -> zero shares', sum === 0 && shares.length === 2);
}

// ── duplicate exact receipt collapses to one stage ──
{
  const shares = splitRingPayout(
    [rcpt('A', 0, 40), rcpt('A', 0, 40), rcpt('B', 40, 78)], 1000);
  check('duplicate collapses', shares.length === 2, `n=${shares.length}`);
  const sum = shares.reduce((a, s) => a + s.payoutCredits, 0);
  check('duplicate still conserves', sum === 1000, `sum=${sum}`);
}

// ── signer attesting two different blocks -> reject (tamper signal) ──
{
  let threw = false;
  try {
    splitRingPayout([rcpt('A', 0, 40), rcpt('A', 40, 78)], 1000);
  } catch {
    threw = true;
  }
  check('two-block signer rejected', threw);
}

// ── empty receipts -> throw ──
{
  let threw = false;
  try { splitRingPayout([], 1000); } catch { threw = true; }
  check('empty receipts rejected', threw);
}

// ── single-stage (degenerate ring) gets everything ──
{
  const shares = splitRingPayout([rcpt('solo', 0, 78)], 1000);
  check('single stage takes all', shares.length === 1 && shares[0].payoutCredits === 1000);
}

console.log(`\nALL ${passed} PASS`);
