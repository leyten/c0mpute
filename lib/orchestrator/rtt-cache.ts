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

/** pair-key separator; socket.io ids are base64url, so this cannot appear inside one */
const SEP = '|';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class RttCache {
  private samples = new Map<string, { ms: number; at: number }>();   // `${from}\0${to}` → sample
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
    for (const [to, raw] of Object.entries(rttMs)) {
      if (kept >= MAX_SAMPLES_PER_REPORT) break;
      if (!to || to === from) continue;                 // a node's RTT to itself is not information
      const ms = Number(raw);
      if (!Number.isFinite(ms) || ms < MIN_RTT_MS || ms > MAX_RTT_MS) continue;
      this.samples.set(`${from}${SEP}${to}`, { ms, at: this.now() });
      kept += 1;
    }
    return kept;
  }

  /** Drop everything touching a node that left. Its samples describe a path that no longer exists,
   *  and its socket id is reused by nobody — keeping them would place the NEXT pool on a dead mesh. */
  forget(nodeId: string): void {
    for (const key of [...this.samples.keys()]) {
      const i = key.indexOf(SEP);
      if (key.slice(0, i) === nodeId || key.slice(i + 1) === nodeId) this.samples.delete(key);
    }
  }

  /** A live (non-expired) directional sample, or undefined. Expired entries are dropped on read —
   *  the cache is only ever walked here, so this is the whole eviction story. */
  private live(from: string, to: string): number | undefined {
    const key = `${from}${SEP}${to}`;
    const s = this.samples.get(key);
    if (!s) return undefined;
    if (this.now() - s.at > this.ttl) { this.samples.delete(key); return undefined; }
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
   * real mesh, so max costs almost nothing in accuracy). One-directional pairs are used as-is in
   * both directions; missing pairs take `fillFor`.
   */
  matrix(ids: string[]): number[][] {
    const n = ids.length;
    const pairs: (number | null)[][] = Array.from({ length: n }, () => Array<number | null>(n).fill(null));
    const measured: number[] = [];
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const ab = this.live(ids[i], ids[j]);
        const ba = this.live(ids[j], ids[i]);
        const v = ab !== undefined && ba !== undefined ? Math.max(ab, ba) : ab ?? ba ?? null;
        if (v === null) continue;
        pairs[i][j] = v;
        pairs[j][i] = v;
        measured.push(v);
      }
    }
    const fill = this.fillFor(measured);
    return pairs.map((row, i) => row.map((v, j) => (i === j ? 0 : v ?? fill)));
  }

  /** live sample count (logging / tests) */
  get size(): number { return this.samples.size; }
}
