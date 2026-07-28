/**
 * RTT-aware swarm formation — the placement path, end to end (no daemon, no GPU).
 *
 * The hazard: `autoForm` handed `shard.plan` a CONSTANT 30 ms matrix, which does not make placement
 * approximate — it makes it DEGENERATE. `loop_cost` is then identical for every permutation, so
 * Held-Karp's strict-`<` tie-break keeps whichever index the DP scanned first; `plan.centrality` is
 * `30*(n-1)` for everyone, so the head/coordinator is the first VRAM-capable announcer; and
 * `topology._TRIM = 12` sorts a big pool by an all-equal key, so the cull is a stable sort on index.
 * Ring order, head election AND candidate selection were all announce ARRIVAL ORDER (E0 study,
 * 2026-07-28: on our one real N×N mesh the deployed order cost 1.178x optimal and a random draw cost
 * 1.176x — our stage order carried zero latency information).
 *
 * What this asserts:
 *  (1) RttCache in isolation — an empty cache reproduces the old constant matrix EXACTLY, a two-sided
 *      pair takes max() of the claims, samples expire, a departed node is forgotten, and an unmeasured
 *      pair never reads faster than the placeholder (else declining to measure would be the winning
 *      move: a 30 ms node beats every real EU peer and takes the head seat for free).
 *  (2) measureRttMs — the node half times a live listener and drops what it cannot honestly time
 *      (relay circuits, loopback, a bad announced port) instead of guessing or hanging the round.
 *  (3) the announce path — a mesh injected over `node:rtt` reaches the planner seam intact, and with
 *      no reports the seam receives byte-identically what it used to (the fail-safe).
 *  (4) the REAL planner (`python -m shard.plan`) — the formed ring is loop-OPTIMAL on the one full
 *      mesh we have ever measured and differs from arrival order, and a 14-node pool culls the
 *      worst-offset node instead of the last to announce. Skipped (not failed) without the seam.
 *
 * Run:  npx tsx scripts/rtt-formation-test.ts
 */
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { measureRttMs } from '../c0mpute-worker/src/shard-runner';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import { RttCache, DEFAULT_RTT_MS } from '../lib/orchestrator/rtt-cache';
import { SubprocessSeam } from '../lib/orchestrator/swarm-seam';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }
function skip(msg: string) { console.log(`skip  ${msg}`); }
function section(t: string) { console.log(`\n${t}`); }
function done(code: number) { setTimeout(() => process.exit(code), 100); }

// The one FULL pairwise mesh this project has ever measured: 5-node EU ring, all 20 ordered pairs,
// TCP-connect min-of-5, 2026-06-30 (ES, HU, FR, IT, NO). Asymmetry is real but tiny (max 2.4%).
const EU = ['ES', 'HU', 'FR', 'IT', 'NO'];
const EU_MESH: Record<string, Record<string, number>> = {
  ES: { HU: 66.5, FR: 46.3, IT: 40.3, NO: 57.2 },
  HU: { ES: 68.1, FR: 44.3, IT: 35.3, NO: 43.2 },
  FR: { ES: 45.8, HU: 44.6, IT: 27.9, NO: 33.7 },
  IT: { ES: 40.7, HU: 34.7, FR: 28.5, NO: 32.4 },
  NO: { ES: 56.6, HU: 42.8, FR: 33.6, IT: 32.1 },
};
/** the cache takes max() of the two claims (PLACEMENT_AS_PROTOCOL.md §3), so score the ring against
 *  the same symmetrised numbers the planner is actually handed */
function sym(a: string, b: string) { return Math.max(EU_MESH[a][b], EU_MESH[b][a]); }
/** the planner's objective: forward hops + the tail→head return leg */
function loopCost(order: string[]) {
  let c = 0;
  for (let i = 0; i < order.length - 1; i += 1) c += sym(order[i], order[i + 1]);
  return c + sym(order[order.length - 1], order[0]);
}
function bestLoopCost(labels: string[]): number {
  let best = Infinity;
  const walk = (used: string[], rest: string[]) => {
    if (!rest.length) { best = Math.min(best, loopCost(used)); return; }
    for (let i = 0; i < rest.length; i += 1) walk([...used, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  walk([], labels);
  return best;
}

/** stub seam: even layer tiling in the order given (so ORDER assertions belong to part 3's real
 *  planner, and part 2 is purely about what the matrix delivered looks like). */
class EvenSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const n = r.nodes.length, L = r.model.n_layers, per = Math.floor(L / n);
    const stages = r.nodes.map((nd, i) => ({ id: nd.id, index: i, lo: i * per, hi: i === n - 1 ? L : (i + 1) * per,
      head: i === 0, tail: i === n - 1, layers: (i === n - 1 ? L : (i + 1) * per) - i * per }));
    return { order: stages.map((s) => s.id), head: stages[0].id, stages, dropped: [], step_ms: 100, tok_s_per_g: 10, k: n };
  }
  async verify(): Promise<SettleResult> { return { ok: true, stages: [] } as unknown as SettleResult; }
  async challenge(_r: { a: BlockSketch; b: BlockSketch }) { return { cosine: 1, rel_norm: 0, passed: true }; }
}

/** spy wrapper (rails-test.ts convention): records the plan request so assertions can read the
 *  matrix the manager actually handed the planner. */
class CapturingSeam implements Seam {
  lastPlanReq: { nodes: { id: string }[]; rtt: number[][] } | null = null;
  constructor(private readonly inner: Seam) {}
  async plan(req: unknown) { this.lastPlanReq = req as { nodes: { id: string }[]; rtt: number[][] }; return this.inner.plan(req); }
  async verify(req: unknown) { return this.inner.verify(req); }
  async challenge(req: { a: BlockSketch; b: BlockSketch }) { return this.inner.challenge(req); }
}

const PROFILE = { layerCount: 62, layer_vram_mb: 900, kv_mb_per_layer: 10, cap_layers: 16 };

interface FormResult {
  order: string[];                 // formed ring, head-first, in LABELS
  head: string;
  planRtt: number[][] | null;      // the matrix the planner seam received
  planIds: string[];               // labels aligned to planRtt
  probed: Set<string>;             // labels that received swarm:probe_peers
}

/**
 * Announce `labels` in order, optionally have each report `mesh` over `node:rtt`, and return what
 * the ring came out as. Arrival order IS `labels` — that is the thing measured RTT has to beat.
 */
async function form(labels: string[], opts: {
  seam: Seam; mesh?: Record<string, Record<string, number>>;
  vram?: (label: string) => number;
}): Promise<FormResult> {
  const capturing = new CapturingSeam(opts.seam);
  const http = createServer();
  const server = new Server(http, { transports: ['websocket'] });
  server.use((s, next) => { (s as unknown as { privyUserId: string }).privyUserId = 'test-acct'; next(); });
  const handle = attachSwarmLoop(server, {
    recordStageEarning: () => {},
    config: { admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers', minCandidates: 2,
      privacy: null, spotCheckTimeoutMs: 60_000 },
    seam: capturing,
    resolveModel: (m) => (m === 'minimax-m2.5'
      ? { model: m, manifestRef: 'mf:test', minStages: 2, profile: PROFILE } : undefined),
    autoFormDebounceMs: 500,
    rttProbePeriodMs: 0,          // the rolling round is not what this test drives; announce is
    log: () => {},
  });
  await new Promise<void>((res) => http.listen(0, res));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;

  const clients: ClientSocket[] = [];
  const idOf = new Map<string, string>();
  const labelOf = new Map<string, string>();
  const probed = new Set<string>();

  // 1) connect everyone first, so every node can name its peers by node id (what a daemon learns
  //    from swarm:probe_peers) before anyone announces.
  await Promise.all(labels.map((label) => new Promise<void>((res) => {
    const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: 'cwt_test' } });
    clients.push(c);
    c.on('swarm:probe_peers', () => probed.add(label));
    c.on('connect', () => { idOf.set(label, c.id!); labelOf.set(c.id!, label); res(); });
  })));

  // 2) announce in `labels` order (the arrival order under test), then report the mesh
  for (const [i, label] of labels.entries()) {
    await new Promise<void>((res) => {
      clients[i].emit('node:announce', {
        cap: { pubkey: `pk-${label}`, gpu: 'RTX 5090', freeVramMb: opts.vram?.(label) ?? 32000,
          subnet: `10.0.${i}.0/24`, addrs: [`/ip4/10.9.9.${i + 1}/tcp/29600/p2p/peer-${label}`] },
        model: 'minimax-m2.5', manifestRef: 'mf:test',
      }, () => res());
    });
  }
  if (opts.mesh) {
    for (const [i, label] of labels.entries()) {
      const rttMs: Record<string, number> = {};
      for (const [peer, ms] of Object.entries(opts.mesh[label] ?? {})) {
        const id = idOf.get(peer);
        if (id) rttMs[id] = ms;
      }
      clients[i].emit('node:rtt', { model: 'minimax-m2.5', rttMs });
    }
  }

  // 3) let the debounce fire and the plan seam return (poll — the real planner on a 14-node pool
  //    takes ~1s, and a fixed sleep either flakes or wastes the whole suite's time)
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !handle.manager.snapshot().swarms.length) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const swarm = handle.manager.snapshot().swarms[0];
  const req = capturing.lastPlanReq;
  clients.forEach((c) => c.close());
  server.close(); http.close();
  return {
    order: (swarm?.order ?? []).map((id) => labelOf.get(id) ?? id),
    head: labelOf.get(swarm?.coordinatorNodeId ?? '') ?? '',
    planRtt: req?.rtt ?? null,
    planIds: (req?.nodes ?? []).map((n) => labelOf.get(n.id) ?? n.id),
    probed,
  };
}

/** the matrix autoForm used to build by hand — the exact thing the no-data path must reproduce */
function constantMatrix(n: number) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : DEFAULT_RTT_MS)));
}

async function shardSeamAvailable(seam: Seam): Promise<boolean> {
  try {
    await seam.plan({ nodes: [{ id: 'a', free_vram_mb: 32000, subnet: '10.0.0.0/24' }],
      rtt: [[0]], model: { n_layers: 1, layer_vram_mb: 900, kv_mb_per_layer: 10, cap_layers: 16 } });
    return true;
  } catch { return false; }
}

async function main() {
  // ── 1. the cache itself ──────────────────────────────────────────────────────────────────────
  section('RttCache');
  const empty = new RttCache();
  check(JSON.stringify(empty.matrix(['a', 'b', 'c'])) === JSON.stringify(constantMatrix(3)),
    'an empty cache returns EXACTLY the old constant matrix (the fail-safe)');

  const c1 = new RttCache();
  c1.report('a', { b: 10, c: 50 });
  c1.report('b', { a: 20 });
  const m1 = c1.matrix(['a', 'b', 'c']);
  check(m1[0][1] === 20 && m1[1][0] === 20,
    'a two-sided pair takes the LARGER claim (10 vs 20 → 20; understating buys nothing)');
  check(m1[0][2] === 50 && m1[2][0] === 50, 'a one-directional sample is used in both directions');
  check(m1[0][0] === 0 && m1[1][1] === 0 && m1[2][2] === 0, 'the diagonal stays 0');
  check(m1[1][2] === Math.max(DEFAULT_RTT_MS, 35) && m1[1][2] >= DEFAULT_RTT_MS,
    `an unmeasured pair takes max(placeholder, pool median) = ${m1[1][2]} — never better than silence`);

  const fast = new RttCache();
  fast.report('a', { b: 4, c: 5 });
  fast.report('b', { c: 5 });
  check(fast.matrix(['a', 'b', 'c']).every((row, i) => row.every((v, j) => i === j || v <= DEFAULT_RTT_MS
    || v === DEFAULT_RTT_MS)), 'a genuinely fast pool keeps its measured intra-metro legs');

  check(c1.report('x', { y: -5, z: 99999, x: 10 }) === 0, 'garbage samples (negative, absurd, self) are dropped');

  let clock = 0;
  const aging = new RttCache({ ttlMs: 1000, now: () => clock });
  aging.report('a', { b: 7 });
  check(aging.matrix(['a', 'b'])[0][1] === 7, 'a fresh sample is used');
  clock = 5000;
  check(aging.matrix(['a', 'b'])[0][1] === DEFAULT_RTT_MS, 'an expired sample falls back to the placeholder');

  const forgetting = new RttCache();
  forgetting.report('a', { b: 7 });
  forgetting.report('b', { a: 7 });
  forgetting.forget('a');
  check(forgetting.size === 0, 'forget(node) drops every sample touching a departed node');

  // ── 1b. the node-side measurement ────────────────────────────────────────────────────────────
  section('measureRttMs (the worker half)');
  const listener = createTcpServer(() => {});
  await new Promise<void>((r) => listener.listen(0, '0.0.0.0', r));
  const lp = (listener.address() as { port: number }).port;
  // 127.x is skipped as a peer addr by design (it is never a real ringmate), so reach the same
  // listener over this box's own LAN address — the shape a real announce carries.
  const lan = Object.values(networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  const t0 = Date.now();
  const timings = await measureRttMs([
    ...(lan ? [{ nodeId: 'reachable', addrs: [`/ip4/${lan}/tcp/${lp}/p2p/x`] }] : []),
    { nodeId: 'loopback-only', addrs: [`/ip4/127.0.0.1/tcp/${lp}/p2p/l`] },
    { nodeId: 'circuit-only', addrs: [`/ip4/1.2.3.4/tcp/4001/p2p-circuit/p2p/y`] },
    { nodeId: 'absurd-port', addrs: [`/ip4/1.2.3.4/tcp/99999999/p2p/z`] },
    { nodeId: 'dead', addrs: [`/ip4/10.255.255.2/tcp/1/p2p/w`] },
  ], { attempts: 1, timeoutMs: 250 });
  listener.close();
  if (lan) {
    check(typeof timings.reachable === 'number' && timings.reachable >= 0,
      `a live listener is timed (${timings.reachable}ms to ${lan}:${lp})`);
  } else { skip('no non-loopback IPv4 on this box — the positive timing case not run'); }
  check(!('loopback-only' in timings), 'a loopback-only peer is skipped (never a real ringmate)');
  check(!('circuit-only' in timings), 'a relay-circuit-only peer is not timed (that would measure the relay)');
  check(!('absurd-port' in timings), 'an out-of-range announced port is skipped, not thrown');
  check(!('dead' in timings), 'an unreachable peer is omitted rather than guessed');
  check(Date.now() - t0 < 5000, `the round is bounded by its timeouts (${Date.now() - t0}ms)`);

  // ── 2. the announce path ─────────────────────────────────────────────────────────────────────
  section('announce → node:rtt → planner seam');
  const noData = await form(EU, { seam: new EvenSeam() });
  check(noData.planRtt !== null, 'a ring formed with no RTT reports at all');
  check(JSON.stringify(noData.planRtt) === JSON.stringify(constantMatrix(EU.length)),
    'NO DATA: the planner receives byte-identically the constant matrix it used to (fail-safe)');
  check(JSON.stringify(noData.planIds) === JSON.stringify(EU),
    'NO DATA: pool order is still announce arrival order');

  const measured = await form(EU, { seam: new EvenSeam(), mesh: EU_MESH });
  check(measured.probed.size === EU.length, `every candidate was handed probe targets (${measured.probed.size}/${EU.length})`);
  const delivered = measured.planRtt!;
  const pos = (l: string) => measured.planIds.indexOf(l);
  check(delivered[pos('ES')][pos('HU')] === sym('ES', 'HU') && delivered[pos('IT')][pos('FR')] === sym('IT', 'FR'),
    'MEASURED: the injected mesh reaches the planner intact (symmetrised, aligned to the pool)');
  check(delivered.every((row, i) => row.every((v, j) => i === j || v !== DEFAULT_RTT_MS)),
    'MEASURED: no pair is left at the placeholder — the objective is no longer degenerate');

  // ── 3. the real planner ──────────────────────────────────────────────────────────────────────
  section('shard.plan — ordering, head election, trim');
  const shard = new SubprocessSeam();
  if (!(await shardSeamAvailable(shard))) {
    skip('python3 -m shard.plan unavailable (set SHARD_REPO) — ordering/trim assertions not run');
  } else {
    const blind = await form(EU, { seam: shard });
    const aware = await form(EU, { seam: shard, mesh: EU_MESH });
    const optimal = bestLoopCost(EU);
    check(blind.order.length === EU.length && aware.order.length === EU.length, 'both rings formed all 5 stages');
    check(JSON.stringify(blind.order) !== JSON.stringify(aware.order),
      `RED→GREEN: measured RTT changes the ring (blind ${blind.order.join('→')} vs aware ${aware.order.join('→')})`);
    check(Math.abs(loopCost(aware.order) - optimal) < 0.01,
      `MEASURED: the formed ring is loop-OPTIMAL (${loopCost(aware.order).toFixed(1)}ms == brute-force ${optimal.toFixed(1)}ms)`);
    check(loopCost(aware.order) < loopCost(blind.order),
      `MEASURED beats RTT-blind on the wire (${loopCost(aware.order).toFixed(1)} < ${loopCost(blind.order).toFixed(1)}ms)`);
    check(aware.head !== blind.head,
      `head is elected on measured centrality, not arrival order (${aware.head} vs ${blind.head})`);

    // TRIM: 14 candidates > topology._TRIM (12). n00 announces FIRST and sits 400ms from everyone;
    // it is also the leanest card, so it is never held by the feasibility cover. Under a constant
    // matrix the trim key is all-equal and the stable sort keeps it on index; with data it is the
    // most expensive node in the pool and must be the one that goes.
    const many = Array.from({ length: 14 }, (_, i) => `n${String(i).padStart(2, '0')}`);
    const farMesh: Record<string, Record<string, number>> = {};
    for (const a of many) {
      farMesh[a] = {};
      for (const b of many) if (a !== b) farMesh[a][b] = (a === 'n00' || b === 'n00') ? 400 : 12;
    }
    const vram = (l: string) => (l === 'n00' ? 20000 : 32000);
    const trimBlind = await form(many, { seam: shard, vram });
    const trimAware = await form(many, { seam: shard, mesh: farMesh, vram });
    check(trimBlind.order.includes('n00'),
      'RED: with no RTT data the worst node still makes the ring (trim + head are arrival order)');
    check(trimBlind.head === 'n00', 'RED: it even takes the head seat — first capable announcer wins');
    check(!trimAware.order.includes('n00'),
      `GREEN: with data the worst-offset node is culled (ring ${trimAware.order.join('→')})`);
    check(trimAware.head !== 'n00', `GREEN: the head is a central node instead (${trimAware.head})`);
  }

  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  done(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); done(1); });
