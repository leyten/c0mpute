/**
 * RttCache — the measured pairwise latency auto-form places on.
 *
 * Auto-form used to hand `shard.plan` a CONSTANT 30 ms matrix. That does not merely make placement
 * approximate, it makes it DEGENERATE: `topology.optimal_loop` scores every permutation identically
 * (loop_cost is a constant), `_held_karp` breaks the tie with a strict `<` so the survivor is
 * whichever index the DP scanned first, `plan.centrality(i)` is `30*(n-1)` for every node so the
 * head/coordinator is the first VRAM-capable announcer, and `topology`'s `_TRIM = 12` funnel sorts
 * by an all-equal key and so culls a big pool by arrival order. Ring order, head election and
 * candidate selection were all decided by ANNOUNCE ARRIVAL ORDER — verified by executing the path
 * (E0 ordering study, 2026-07-28). On the one full N×N mesh we have ever measured, the order we
 * deployed cost 1.178x the optimum and a random permutation cost 1.176x: our stage order carried
 * zero latency information.
 *
 * So nodes measure each other and report; this holds what they reported and hands `autoForm` a
 * matrix synchronously (the seam at swarm-loop.ts must not `await` between sizing the candidate
 * pool and slicing the matrix, or an announce mid-flight changes the pool and the form bails).
 *
 * FAIL-SAFE, in the strict sense: with nothing reported, `matrix()` returns exactly the constant
 * matrix the loop built before — 0 on the diagonal, DEFAULT_RTT_MS everywhere else — so a network
 * where no node ever measures anything forms rings byte-identically to today.
 *
 * The samples are SELF-REPORTED and unverified, like the announced `addrs` next to them. The
 * profitable lie is UNDERSTATING — an understated RTT that wins a seat is otherwise free — so a pair
 * measured from both ends takes `max(claim_ij, claim_ji)`, the rule PLACEMENT_AS_PROTOCOL.md §3
 * settled on: one honest end is enough to cancel the other's inflation. An absent measurement never
 * reads FASTER than the old placeholder either (see `fillFor`), so declining to measure is not a
 * cheaper way to look central. Two-sided PROOF (receiver-signed observations, nonce dial-back via
 * `shard.probe --serve`) is the level-2 refinement in that doc, not this one.
 *
 * But `max` alone hands the WORST claim the last word, and that made the mirror-image lie free:
 * a node reports 2000 ms for a rival it has never dialled, the pair reads 2000 ms in both
 * directions, and the rival's `centrality` — the key the head election and the `_TRIM` funnel sort
 * on — is wrecked by one message, with no cooperation from the victim and nothing at stake for the
 * liar. So a claim is now believed only as far as something else supports it (`matrix`): the higher
 * claim still wins, but it may exceed the pool's ordinary pair only in proportion to what the OTHER
 * end of the same path also admits (`CLAIM_AGREEMENT_RATIO`). Both ends agreeing puts the pair back
 * on exactly the old `max` — including a genuinely 400 ms leg both ends confirm. One end alone, or
 * two ends contradicting each other, is held to `UNCORROBORATED_RTT_CAP` times the typical pair.
 *
 * That bound is deliberately anchored to what CORROBORATED pairs look like, not to the claims at
 * large. Anchoring it to the claims lets the liar set its own ceiling: on a 3-4 node ring (`
 * minCandidates` is 2) one reporter owns half the pairs and IS the median, and in the seconds
 * between an announce and the debounced form it is often the only reporter at all. And the ceiling
 * has to be applied BEFORE the pool median is taken for `fillFor`, or a flooder shrinks its own
 * pairs by inflating everyone else's fill — the cap would hand it the centrality it was denied.
 */

/** What auto-form assumed for every pair before any node measured anything. An unmeasured pair
 *  still reads at least this — never better — so silence is not rewarded. */
export const DEFAULT_RTT_MS = 30;

/** How long a reported sample stays usable. Long enough that a quiet pool keeps its matrix across
 *  several form attempts, short enough that a node that moved (or a peer that changed path) ages
 *  out rather than pinning placement to a stale mesh. */
export const RTT_TTL_MS = 10 * 60_000;

/** Sanity band for one sample. Above the ceiling we DROP rather than record: shard treats >= 9000 ms
 *  as "no usable path" and drops the node, and we cannot verify a claim that severe — an unmeasured
 *  pair (which falls back to the pool fill) is the safe reading, not an unreachable one. */
const MIN_RTT_MS = 0.05;
const MAX_RTT_MS = 2000;

/** Most a single report may carry, so one node cannot flood the cache. */
const MAX_SAMPLES_PER_REPORT = 64;

/** Most distinct peers one reporter may hold live samples about. The per-report cap bounds a
 *  MESSAGE, not a socket: reports overwrite by key, so a node that walks fabricated peer ids grows
 *  the cache for as long as it stays connected. An honest reporter cannot reach this — swarm-loop
 *  hands out PROBE_FANOUT (16) targets on a 60 s round and a sample lives 10 minutes, so its live
 *  set tops out around 160 — and eviction is oldest-first, which is the order the TTL would have
 *  taken them in anyway. */
const MAX_PEERS_PER_REPORTER = 256;

/** How far the two ends of one path may disagree and still count as measuring the same thing, and
 *  equally: how far ONE end may carry a pair past what the other end concedes. The one full mesh we
 *  have measured is asymmetric by 2.4%; the rest of any honest gap is jitter, and 2x is a wide band
 *  for that on a home line. It works in both lie directions because it is anchored to the lower
 *  claim: an overstater is pulled down toward what its counterpart admits, and an understater still
 *  cannot pull the pair below what the honest end reported. */
const CLAIM_AGREEMENT_RATIO = 2;

/** Ceiling on a claim nothing else supports, as a multiple of the typical CORROBORATED pair (never
 *  below the 30 ms placeholder — so it is at least 120 ms whatever the pool looks like). It bounds
 *  what one unverified voice can do to a peer's centrality, while staying above any real leg in a
 *  regional pool (our measured mesh spans 28-67 ms) and well above the transatlantic hop. What it
 *  compresses is a genuinely intercontinental pair that only one end has ever measured: that costs
 *  some ordering accuracy among the pool's worst pairs, and buys the guarantee that no unanswered
 *  claim can declare a node unplaceable. Both ends confirming it lifts the ceiling entirely. */
const UNCORROBORATED_RTT_CAP = 4;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class RttCache {
  // reporter → (peer → sample). Nested rather than flat-keyed so a reporter's own footprint is one
  // bounded map: insertion order gives it oldest-first eviction, and `forget` drops a departed
  // node's whole side in O(1) plus one keyed delete per remaining reporter, instead of a scan over
  // every sample in the process.
  private samples = new Map<string, Map<string, { ms: number; at: number }>>();
  private readonly ttl: number;
  private readonly now: () => number;

  constructor(opts: { ttlMs?: number; now?: () => number } = {}) {
    this.ttl = opts.ttlMs ?? RTT_TTL_MS;
    this.now = opts.now ?? Date.now;
  }

  /** Record one node's round of measurements (`node:rtt`). Returns how many samples were kept —
   *  the caller logs it; a report of pure garbage is silently a no-op, never an error the reporter
   *  can distinguish, because probing the cache for what it accepts is not a useful capability. */
  report(from: string, rttMs: Record<string, number> | undefined): number {
    if (!from || !rttMs || typeof rttMs !== 'object') return 0;
    let kept = 0;
    let mine = this.samples.get(from);
    for (const [to, raw] of Object.entries(rttMs)) {
      if (kept >= MAX_SAMPLES_PER_REPORT) break;
      if (!to || to === from) continue;                 // a node's RTT to itself is not information
      const ms = Number(raw);
      if (!Number.isFinite(ms) || ms < MIN_RTT_MS || ms > MAX_RTT_MS) continue;
      // created only once a sample is actually accepted, so a report of pure garbage leaves no trace
      if (!mine) { mine = new Map(); this.samples.set(from, mine); }
      mine.delete(to);                                  // re-insert, so Map order stays oldest-write-first
      mine.set(to, { ms, at: this.now() });
      // Expiry alone cannot bound this. `live` is the only thing that drops a stale entry and it
      // only ever asks about pairs a real form is placing, so keys nobody asks about — the ones a
      // flooder invents — are never even looked at, let alone TTL'd. Evict the reporter's oldest.
      while (mine.size > MAX_PEERS_PER_REPORTER) {
        const oldest = mine.keys().next().value;
        if (oldest === undefined) break;
        mine.delete(oldest);
      }
      kept += 1;
    }
    return kept;
  }

  /** Drop everything touching a node that left. Its samples describe a path that no longer exists,
   *  and its socket id is reused by nobody — keeping them would place the NEXT pool on a dead mesh. */
  forget(nodeId: string): void {
    this.samples.delete(nodeId);
    for (const [from, mine] of this.samples) {
      if (mine.delete(nodeId) && mine.size === 0) this.samples.delete(from);
    }
  }

  /** A live (non-expired) directional sample, or undefined. Expired entries are dropped on read —
   *  the cache is only ever walked here, so this is the whole expiry story (`report` owns the
   *  per-reporter bound, which is what keeps unread keys from accumulating behind it). */
  private live(from: string, to: string): number | undefined {
    const mine = this.samples.get(from);
    if (!mine) return undefined;
    const s = mine.get(to);
    if (!s) return undefined;
    if (this.now() - s.at > this.ttl) { mine.delete(to); return undefined; }
    return s.ms;
  }

  /**
   * What an unmeasured pair reads as. NOT the raw placeholder: at 30 ms flat, a node nobody has
   * measured yet would look FASTER than every measured EU peer (our measured pairs run 28-67 ms),
   * win `centrality` outright, and take the head seat plus a guaranteed place through the `_TRIM`
   * funnel — i.e. not reporting would be the winning move. `max(placeholder, pool median)` keeps
   * an unmeasured pair no better than typical, mirroring shard's own convention for absent
   * measurements (`topology._up`: unmeasured == assume bad, so it can't sneak onto a hot path).
   * With nothing measured at all the fill IS the placeholder, which is what makes the no-data case
   * byte-identical to the old constant matrix.
   */
  private fillFor(measured: number[]): number {
    return measured.length ? Math.max(DEFAULT_RTT_MS, median(measured)) : DEFAULT_RTT_MS;
  }

  /**
   * The N×N one-way ms matrix for `ids`, aligned to the order given — which MUST be the candidate
   * insertion order `formSwarm` slices against (`SwarmManager.candidateIds(model)`), or the form
   * bails on the length/alignment check.
   *
   * A pair reported from both ends takes the LARGER claim (PLACEMENT_AS_PROTOCOL.md §3: max() kills
   * one-sided understatement, and our WAN is near-symmetric anyway — 2.4% max asymmetry on the one
   * real mesh, so max costs almost nothing in accuracy), bounded by what supports it:
   *
   *     value = min(higher claim, max(lower claim x CLAIM_AGREEMENT_RATIO, cap))
   *
   * with no lower claim at all (one end silent) the anchor is absent and only `cap` remains. Two
   * ends that agree satisfy `higher <= lower x RATIO` by definition, so they come out at exactly
   * `max()` — today's rule, today's accuracy, however slow the leg is. What the form removes is the
   * unsupported extreme in EITHER direction: an overstater is pulled back toward what its
   * counterpart concedes, and an understater still cannot pull the pair below the honest end's
   * claim, because that claim is the `higher` one and the bound is a ceiling, never a floor.
   * Missing pairs take `fillFor`.
   *
   * `cap` is a multiple of the typical pair BOTH ends confirmed, and the pool median for `fillFor`
   * is taken from the values that survived the ceiling. Neither is negotiable: anchor the cap to
   * unverified claims and one reporter sets its own ceiling on a small or freshly-formed pool, and
   * take the fill before the cap and a flooder inflates every OTHER pair while its own stay capped
   * — buying exactly the centrality the cap is there to deny it.
   */
  matrix(ids: string[]): number[][] {
    const n = ids.length;
    const pairs: (number | null)[][] = Array.from({ length: n }, () => Array<number | null>(n).fill(null));
    // per pair: the most the higher claim may be believed up to, from the other end alone (0 = the
    // other end said nothing, so only the pool ceiling supports it)
    const anchor: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
    const corroborated: number[] = [];
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const ab = this.live(ids[i], ids[j]);
        const ba = this.live(ids[j], ids[i]);
        if (ab === undefined && ba === undefined) continue;
        const hi = Math.max(ab ?? 0, ba ?? 0);
        const both = ab !== undefined && ba !== undefined ? Math.min(ab, ba) * CLAIM_AGREEMENT_RATIO : 0;
        pairs[i][j] = hi;
        pairs[j][i] = hi;
        anchor[i][j] = both;
        anchor[j][i] = both;
        if (hi <= both) corroborated.push(hi);
      }
    }
    const typical = corroborated.length ? Math.max(DEFAULT_RTT_MS, median(corroborated)) : DEFAULT_RTT_MS;
    const cap = typical * UNCORROBORATED_RTT_CAP;
    const measured: number[] = [];
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const v = pairs[i][j];
        if (v === null) continue;
        const bounded = Math.min(v, Math.max(anchor[i][j], cap));
        pairs[i][j] = bounded;
        pairs[j][i] = bounded;
        measured.push(bounded);
      }
    }
    const fill = this.fillFor(measured);
    return pairs.map((row, i) => row.map((v, j) => (i === j ? 0 : v ?? fill)));
  }

  /** live sample count (logging / tests) */
  get size(): number {
    let n = 0;
    for (const mine of this.samples.values()) n += mine.size;
    return n;
  }
}
