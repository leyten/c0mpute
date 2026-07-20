/**
 * Network-map feed — shape + privacy test (no daemon, no GPU).
 *
 * Boots the real control plane (attachSwarmLoop harness), announces nodes with realistic
 * capabilities (multiaddrs incl. a public IP + a PeerId), auto-forms a ring, then builds the
 * feed via SwarmManager.snapshot() + buildNetworkFeed and asserts:
 *   (1) statuses: swarm stages = serving, an unassigned candidate = standby;
 *   (2) the PUBLIC shape carries NO pubkey / account / IP / multiaddr / subnet anywhere;
 *   (3) the INTERNAL shape (loopback-only route) carries the dial IP for geo lookup;
 *   (4) node handles are truncated PeerIds when multiaddrs exist, opaque otherwise;
 *   (5) counters math: throughput window + tokens/receipts per node.
 *
 * Run:  npx tsx scripts/network-feed-test.ts
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import { buildNetworkFeed, type FeedCounters } from '../lib/orchestrator/network-feed';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }
function done(code: number) { setTimeout(() => process.exit(code), 100); }

class TestSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const n = Math.min(2, r.nodes.length), L = r.model.n_layers, per = Math.floor(L / n);
    const pick = r.nodes.slice(0, n);
    const stages = pick.map((nd, i) => ({ id: nd.id, index: i, lo: i * per, hi: i === n - 1 ? L : (i + 1) * per,
      head: i === 0, tail: i === n - 1, layers: (i === n - 1 ? L : (i + 1) * per) - i * per }));
    return { order: stages.map((s) => s.id), head: stages[0].id, stages,
      dropped: r.nodes.slice(n).map((x) => x.id), step_ms: 100, tok_s_per_g: 10, k: n };
  }
  async verify(_req: unknown): Promise<SettleResult> { return { ok: true, stages: [] } as unknown as SettleResult; }
  async challenge(_r: { a: BlockSketch; b: BlockSketch }) { return { cosine: 1, rel_norm: 0, passed: true }; }
}

const SPEC = { model: 'minimax-m2.5', manifestRef: 'mf:test', minStages: 2,
  profile: { layerCount: 62, prefill_bytes: 1e8, decode_bytes: 1.6e4, decode_steps: 64 } };
const PEER = '12D3KooWQvTestPeerIdAbCdEfGhIjKlMnOpQrStUvWxYz1234';

async function main() {
  const http = createServer();
  const server = new Server(http, { transports: ['websocket'] });
  server.use((s, next) => { (s as unknown as { privyUserId: string }).privyUserId = 'test-acct'; next(); });
  const handle = attachSwarmLoop(server, {
    recordStageEarning: () => {},
    config: { admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers', minCandidates: 2, privacy: null, spotCheckTimeoutMs: 60_000 },
    seam: new TestSeam(),
    resolveModel: (m) => (m === 'minimax-m2.5' ? SPEC : undefined),
    autoFormDebounceMs: 300,
    log: () => {},
  });
  await new Promise<void>((res) => http.listen(0, res));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;

  // 3 nodes: two get assigned (ring), one stays standby. Node 0 announces multiaddrs.
  const nodes: ClientSocket[] = [];
  let readyCount = 0;
  const nodeIds: string[] = [];
  const allReady = new Promise<void>((resolve) => {
    for (let i = 0; i < 3; i++) {
      const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: 'cwt_test' } });
      nodes.push(c);
      c.on('connect', () => {
        nodeIds[i] = c.id as string;
        c.emit('node:announce', { cap: {
          pubkey: `pk-secret-${i}`, gpu: 'RTX 5090', freeVramMb: 32000, totalVramMb: 32768,
          subnet: `85.91.${i}.0/24`, upMbps: 450,
          ...(i === 0 && { addrs: [`/ip4/85.91.153.10/tcp/29600/p2p/${PEER}`, `/ip4/127.0.0.1/tcp/29600/p2p/${PEER}`] }),
        }, model: 'minimax-m2.5', manifestRef: 'mf:test' });
      });
      c.on('swarm:assign', (a: { swarmId: string }) => {
        c.emit('swarm:ready', { swarmId: a.swarmId });
        if (++readyCount === 2) setTimeout(resolve, 200);
      });
    }
  });
  await allReady;

  const snapshot = handle.manager.snapshot();
  check(snapshot.swarms.length === 1 && snapshot.swarms[0].stages.length === 2, 'snapshot: one 2-stage swarm');

  const now = Date.now();
  const counters: FeedCounters = {
    perNode: new Map([[snapshot.swarms[0].stages[0].nodeId, { tokens: 500, receipts: 3 }]]),
    tokensToday: 700,
    recent: [{ at: now - 60_000, tokens: 300 }, { at: now - 20 * 60_000, tokens: 999 }],
  };

  const pub = buildNetworkFeed(snapshot, counters, { layerCount: 62, now });
  const internal = buildNetworkFeed(snapshot, counters, { layerCount: 62, includeDial: true, now });

  check(pub.nodes.length === 3, `feed carries all nodes (${pub.nodes.length})`);
  check(pub.nodes.filter((n) => n.status === 'serving').length === 2, 'ring stages read as serving');
  check(pub.nodes.filter((n) => n.status === 'standby').length === 1, 'the unassigned candidate reads as standby');
  const serving = pub.nodes.find((n) => n.stageIdx === 0)!;
  check(serving.layerLo === 0 && serving.layerHi === 31 && serving.stageN === 2, 'stage geometry mapped (layers, stageN)');
  check(pub.rings.length === 1 && pub.rings[0].order.length === 2, 'ring order emitted');
  check(pub.stats.ringsServing === 1 && pub.stats.gpusOnline === 3, 'stats: rings + gpus');
  check(pub.stats.vramPooledGb === 96, `vram pooled (${pub.stats.vramPooledGb} GB)`);
  check(pub.stats.tokensServedToday === 700, 'tokensServedToday passthrough');
  check(pub.stats.throughputTokS === 1, `throughput = 5-min window only (${pub.stats.throughputTokS} tok/s)`);
  const counted = pub.nodes.find((n) => n.tokensServed === 500);
  check(!!counted && counted.receipts === 3, 'per-node counters attached');

  // privacy: the serialized PUBLIC feed must carry no identity/dial material
  const s = JSON.stringify(pub);
  check(!s.includes('pk-secret'), 'public feed: no pubkeys');
  check(!s.includes('test-acct'), 'public feed: no accounts');
  check(!s.includes('85.91.'), 'public feed: no IPs/subnets');
  check(!s.includes('/ip4/'), 'public feed: no multiaddrs');
  check(!s.includes(PEER), 'public feed: full PeerId never emitted (truncated handle only)');
  const withAddr = pub.nodes.find((n) => n.id === PEER.slice(0, 12));
  check(!!withAddr, 'multiaddr node handle = truncated PeerId');
  check(pub.nodes.every((n) => n.id === PEER.slice(0, 12) || n.id.startsWith('node-')), 'addr-less nodes get opaque handles');

  // internal shape: exactly one node has a dial IP (the one that announced a public multiaddr)
  const dials = internal.nodes.filter((n) => n.dialIp);
  check(dials.length === 1 && dials[0].dialIp === '85.91.153.10', 'internal shape carries the public dial IP');

  nodes.forEach((n) => n.close());
  server.close(); http.close();
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  done(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); done(1); });
