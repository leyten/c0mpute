/**
 * Offline proof for planRing — $0, stubbed fetch, no live scheduler, no socket.
 *   npx tsx lib/orchestrator/ringScheduler.test.ts
 *
 * Asserts: eligible-worker filtering, the request body sent to scheduler_svc, mapping the
 * plan's stages back onto worker transport identities in ring order, and graceful "not
 * enough capacity" / "scheduler down" handling (job stays queued, no throw).
 */
import { planRing, type SchedulerPlan, type PlanInput } from './ringScheduler';
import type { WorkerInfo } from './types';

let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { console.error(`  FAIL ${name} ${detail}`); process.exit(1); }
  passed++;
  console.log(`  OK ${name}${detail ? ' ' + detail : ''}`);
}

function shardWorker(id: string, vramGb: number): WorkerInfo {
  return {
    id, socketId: `sock-${id}`, model: 'GLM-5.2', type: 'shard',
    capabilities: {}, status: 'idle', connectedAt: new Date(),
    jobsCompleted: 0, tokensGenerated: 0, tokPerSec: 30,
    privyUserId: `user-${id}`, vramGb, peerId: `Peer-${id}`,
    multiaddr: `/ip4/10.0.0.1/tcp/29600/p2p/Peer-${id}`,
  };
}

const input: PlanInput = {
  model: 'GLM-5.2', totalLayers: 78, gbPerLayer: 1.05, kvGbPerLayer: 0.04,
  rttMesh: { A: { B: 30, C: 40 }, B: { A: 30, C: 25 }, C: { A: 40, B: 25 } },
};

// fake scheduler_svc: returns a fixed valid plan, records the request body
function stubFetch(plan: SchedulerPlan, status = 200) {
  let lastBody: any = null;
  const f = (async (_url: string, opts: any) => {
    lastBody = JSON.parse(opts.body);
    return { ok: status < 400, status, json: async () => plan } as Response;
  }) as unknown as typeof fetch;
  return { f, getBody: () => lastBody };
}

async function main() {
// ── happy path: 3 workers -> planned ring in order ──
await (async () => {
  const workers = [shardWorker('A', 48), shardWorker('B', 24), shardWorker('C', 24)];
  const plan: SchedulerPlan = {
    ok: true, model: 'GLM-5.2', coordinator: 'B', ring_order: ['B', 'C', 'A'],
    stages: [
      { stage: 0, node_id: 'B', lo: 0, hi: 19, n_layers: 19 },
      { stage: 1, node_id: 'C', lo: 19, hi: 38, n_layers: 19 },
      { stage: 2, node_id: 'A', lo: 38, hi: 78, n_layers: 40 },
    ],
  };
  const { f, getBody } = stubFetch(plan);
  const r = await planRing(workers, input, 'http://sched:8088', f);
  check('plan ok', r.ok === true);
  if (!r.ok) return;
  // request body carried vram + rtt for all 3
  const body = getBody();
  check('request total_layers', body.total_layers === 78);
  check('request has 3 nodes', body.nodes.length === 3);
  check('request vram passed', body.nodes.find((n: any) => n.node_id === 'A').vram_gb === 48);
  check('request rtt passed', body.nodes.find((n: any) => n.node_id === 'B').rtt_ms.C === 25);
  // ring mapped in stage order with transport identity
  check('ring order B,C,A', r.ring.map((w) => w.workerId).join(',') === 'B,C,A');
  check('coordinator B', r.coordinator === 'B');
  check('head block [0:19]', r.ring[0].lo === 0 && r.ring[0].hi === 19);
  check('fat tail block [38:78]', r.ring[2].lo === 38 && r.ring[2].hi === 78);
  check('peer identity carried', r.ring[0].peerId === 'Peer-B' && r.ring[2].multiaddr.includes('Peer-A'));
})();

// ── not enough capacity: scheduler 400 -> ok:false, no throw, job stays queued ──
await (async () => {
  const workers = [shardWorker('A', 24), shardWorker('B', 24)];
  const plan: SchedulerPlan = {
    ok: false, model: 'GLM-5.2', coordinator: '', ring_order: [], stages: [],
    error: 'insufficient VRAM: capacity 40 layers < model 78',
  };
  const { f } = stubFetch(plan, 400);
  const r = await planRing(workers, input, 'http://sched:8088', f);
  check('insufficient capacity -> ok:false', r.ok === false);
  if (!r.ok) check('reason surfaced', r.reason.includes('insufficient'));
})();

// ── scheduler unreachable -> ok:false with reason, no throw ──
await (async () => {
  const workers = [shardWorker('A', 48)];
  const f = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
  const r = await planRing(workers, input, 'http://sched:8088', f);
  check('scheduler down -> ok:false', r.ok === false);
  if (!r.ok) check('down reason surfaced', r.reason.includes('unreachable'));
})();

// ── filters out non-shard / busy / identity-less workers ──
await (async () => {
  const ok = shardWorker('A', 48);
  const busy = shardWorker('B', 24); busy.status = 'busy';
  const noPeer = shardWorker('C', 24); noPeer.peerId = undefined;
  const native = shardWorker('D', 24); (native as any).type = 'native';
  const plan: SchedulerPlan = {
    ok: true, model: 'GLM-5.2', coordinator: 'A', ring_order: ['A'],
    stages: [{ stage: 0, node_id: 'A', lo: 0, hi: 78, n_layers: 78 }],
  };
  const { f, getBody } = stubFetch(plan);
  const r = await planRing([ok, busy, noPeer, native], input, 'http://s', f);
  check('only eligible worker sent', getBody().nodes.length === 1 && getBody().nodes[0].node_id === 'A');
  check('eligible plan ok', r.ok === true);
})();

// ── empty pool -> ok:false, never calls fetch ──
await (async () => {
  let called = false;
  const f = (async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
  const r = await planRing([], input, 'http://s', f);
  check('empty pool -> ok:false', r.ok === false && !called);
})();

console.log(`\nALL ${passed} PASS`);
}

main().catch((e) => { console.error(e); process.exit(1); });
