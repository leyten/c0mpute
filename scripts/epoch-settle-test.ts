/**
 * Assignment-EPOCH settlement — the P1-#2 correctness-bomb test (no daemon, no GPU).
 *
 * The hazard: a job is dispatched, then the ring CHURNS before the coordinator completes (any
 * ring-mate's socket blip marks the swarm degraded — including the daemon's own deliberate
 * socket-recycle on teardown). Pre-fix, settleJob's live-status guard rejected the settlement:
 * honestly-served work unpaid; and any future in-place re-place would fail receipt-verify against
 * the mutated assignment map and hand the coordinator a receipt_invalid (fraud) mark.
 *
 * The fix under test: serveRequest freezes a JobSettleSnapshot at dispatch; swarm:job_complete
 * settles against that epoch. Asserts: (1) mid-job churn → job still streams + completes,
 * (2) settlement pays the FROZEN stage set even though the swarm is degraded at settle time,
 * (3) replayed completes stay rejected, (4) the no-snapshot path still enforces the live guard.
 *
 * Run:  npx tsx scripts/epoch-settle-test.ts
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch, StageEarning } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }
function done(code: number) { setTimeout(() => process.exit(code), 100); }

class TestSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const n = r.nodes.length, L = r.model.n_layers, per = Math.floor(L / n);
    const stages = r.nodes.map((nd, i) => ({ id: nd.id, index: i, lo: i * per, hi: i === n - 1 ? L : (i + 1) * per,
      head: i === 0, tail: i === n - 1, layers: (i === n - 1 ? L : (i + 1) * per) - i * per }));
    return { order: stages.map((s) => s.id), head: stages[0].id, stages, dropped: [], step_ms: 100, tok_s_per_g: 10, k: n };
  }
  async verify(req: unknown): Promise<SettleResult> {
    const a = (req as { assignments: Record<string, [number, number]> }).assignments;
    const stages = Object.entries(a).map(([pubkey, [lo, hi]]) => ({ pubkey, lo, hi, layers: hi - lo }));
    return { ok: true, stages } as unknown as SettleResult;
  }
  async challenge(_r: { a: BlockSketch; b: BlockSketch }) { return { cosine: 1, rel_norm: 0, passed: true }; }
}

const SPEC = { model: 'minimax-m2.5', manifestRef: 'mf:test', minStages: 2,
  profile: { layerCount: 62, prefill_bytes: 1e8, decode_bytes: 1.6e4, decode_steps: 64 } };

async function main() {
  const http = createServer();
  const server = new Server(http, { transports: ['websocket'] });
  server.use((s, next) => { (s as unknown as { privyUserId: string }).privyUserId = 'test-acct'; next(); });

  const earnings: StageEarning[] = [];
  const handle = attachSwarmLoop(server, {
    recordStageEarning: (e) => { earnings.push(e as StageEarning); },
    config: { admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers', minCandidates: 2, privacy: null, spotCheckTimeoutMs: 60_000 },
    seam: new TestSeam(),
    resolveModel: (m) => (m === 'minimax-m2.5' ? SPEC : undefined),
    autoFormDebounceMs: 300,
    log: () => {},
  });

  await new Promise<void>((res) => http.listen(0, res));
  const port = (http.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;

  // two fake nodes; the TAIL will be yanked mid-job. The coordinator delays its complete so the
  // churn lands in the dispatch→complete window, then REPLAYS the complete (must stay rejected).
  const nodes: ClientSocket[] = [];
  let tailSock: ClientSocket | null = null;
  let coordSock: ClientSocket | null = null;
  let swarmIdSeen = '';
  let readyCount = 0;
  const allReady = new Promise<void>((resolve) => {
    for (let i = 0; i < 2; i++) {
      const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: 'cwt_test' } });
      nodes.push(c);
      c.on('connect', () => {
        c.emit('node:announce', { cap: { pubkey: `pk-${i}-${c.id}`, gpu: 'RTX 5090', freeVramMb: 32000, subnet: `10.0.${i}.0/24` }, model: 'minimax-m2.5', manifestRef: 'mf:test' });
      });
      c.on('swarm:assign', (a: { swarmId: string; isHead: boolean; isTail: boolean }) => {
        swarmIdSeen = a.swarmId;
        c.emit('swarm:ready', { swarmId: a.swarmId });
        if (a.isTail) tailSock = c;
        if (a.isHead) {
          coordSock = c;
          c.on('swarm:job', (job: { swarmId: string; jobId: string; nonce: string }) => {
            // stream a couple of deltas, then YANK the tail (churn), then complete
            c.emit('swarm:job_token', { jobId: job.jobId, delta: 'served ' });
            setTimeout(() => { tailSock?.close(); }, 60);           // ← the churn, mid-job
            setTimeout(() => {
              c.emit('swarm:job_token', { jobId: job.jobId, delta: 'anyway' });
              const complete = { swarmId: job.swarmId, jobId: job.jobId, nonce: job.nonce,
                tokensGenerated: 2, response: 'served anyway', receipts: [{ stub: true }] };
              c.emit('swarm:job_complete', complete);
              setTimeout(() => c.emit('swarm:job_complete', complete), 150);   // replay: must NOT double-pay
            }, 300);
          });
        }
        if (++readyCount === 2) setTimeout(resolve, 150);
      });
    }
  });

  await allReady;
  check(!!handle.manager.swarmForModel('minimax-m2.5'), 'a ready swarm auto-formed');

  const streamed: string[] = [];
  const result = await new Promise<{ response: string; tokens: number } | { error: string }>((resolve) => {
    const r = handle.serveRequest({
      model: 'minimax-m2.5',
      messages: [{ role: 'user', content: 'churn survivor?' }],
      onToken: (d) => streamed.push(d),
      onDone: (response, tokens) => resolve({ response, tokens }),
      onError: (error) => resolve({ error }),
    });
    check(r !== null, 'serveRequest dispatched');
  });

  check(!('error' in result), `job completed despite mid-job churn (${JSON.stringify(result)})`);
  await new Promise((r) => setTimeout(r, 400));               // let settle + the replay land

  const degraded = handle.manager.swarmForModel('minimax-m2.5') === undefined;
  check(degraded, 'the swarm was OUT of serving rotation at settle time (churn registered)');
  check(earnings.length === 2, `settlement paid the FROZEN stage set anyway (${earnings.length} earnings)`);
  const paidLayers = earnings.reduce((a, e) => a + e.layers, 0);
  check(paidLayers === 62, `the frozen epoch tiles the full model (${paidLayers} layers paid)`);
  check(earnings.reduce((a, e) => a + e.tokens, 0) === 2, 'token split sums to tokensGenerated');
  check(earnings.length === 2 /* replay added nothing */, 'replayed swarm:job_complete did not double-pay');

  // the no-snapshot path keeps the live guard: settling a fresh job id on the degraded swarm fails
  const direct = await handle.manager.settleJob(swarmIdSeen, 'job-no-snap', coordSock ? (coordSock as unknown as { id: string }).id : 'x',
    'deadbeef', 1, [{ stub: true }]);
  check(direct === null, 'no-snapshot settle on a degraded swarm still rejects (live guard intact)');

  nodes.forEach((n) => n.close());
  server.close(); http.close();
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  done(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); done(1); });
