/**
 * Leg 8 serve path — integration test for the SERVER half (no daemon, no GPU).
 *
 * Spins up attachSwarmLoop on a real socket.io server, connects fake node clients that announce +
 * auto-form a ring, then calls handle.serveRequest and asserts the whole dispatch→stream→settle
 * loop: the coordinator receives swarm:job, streams swarm:job_token deltas + a swarm:job_complete,
 * the orchestrator relays them to the request's callbacks, and settleJob runs (SimSeam.verify
 * stub-passes so the mock reaches the earning). Exits 0 on success, 1 on any failed assertion.
 *
 * Run:  npx tsx scripts/leg8-serve-test.ts
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }
function done(code: number) { setTimeout(() => process.exit(code), 100); }

// stub seam: plan splits layers evenly over N nodes; verify/challenge pass (the crypto has its own tests)
class TestSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const n = r.nodes.length, L = r.model.n_layers, per = Math.floor(L / n);
    const stages = r.nodes.map((nd, i) => ({ id: nd.id, index: i, lo: i * per, hi: i === n - 1 ? L : (i + 1) * per,
      head: i === 0, tail: i === n - 1, layers: (i === n - 1 ? L : (i + 1) * per) - i * per }));
    return { order: stages.map((s) => s.id), head: stages[0].id, stages, dropped: [], step_ms: 100, tok_s_per_g: 10, k: n };
  }
  async verify(req: unknown): Promise<SettleResult> {
    // mirror shard.verify's success shape: per-stage {pubkey, lo, hi, layers} drives the earning split
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

  let earned = 0;
  const handle = attachSwarmLoop(server, {
    recordStageEarning: () => { earned++; },
    config: { admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers', minCandidates: 2, privacy: null, spotCheckTimeoutMs: 60_000 },
    seam: new TestSeam(),
    resolveModel: (m) => (m === 'minimax-m2.5' ? SPEC : undefined),
    autoFormDebounceMs: 300,
    log: () => {},
  });

  await new Promise<void>((res) => http.listen(0, res));
  const port = (http.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;

  // two fake nodes: announce, ack assign with ready; stage 0 (coordinator) also serves swarm:job.
  const nodes: ClientSocket[] = [];
  let readyCount = 0;
  const allReady = new Promise<void>((resolve) => {
    for (let i = 0; i < 2; i++) {
      const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: 'cwt_test' } });
      nodes.push(c);
      c.on('connect', () => {
        c.emit('node:announce', { cap: { pubkey: `pk-${i}-${c.id}`, gpu: 'RTX 5090', freeVramMb: 32000, subnet: `10.0.${i}.0/24` }, model: 'minimax-m2.5', manifestRef: 'mf:test' });
      });
      c.on('swarm:assign', (a: { swarmId: string; isHead: boolean }) => {
        c.emit('swarm:ready', { swarmId: a.swarmId });
        if (++readyCount === 2) setTimeout(resolve, 150);
        // the coordinator (head) serves inference jobs
        if (a.isHead) {
          c.on('swarm:job', (job: { swarmId: string; jobId: string; nonce: string; messages: unknown[] }) => {
            check(Array.isArray(job.messages) && job.messages.length > 0, 'coordinator got swarm:job with messages');
            check(typeof job.nonce === 'string' && job.nonce.length > 0, 'swarm:job carries a settlement nonce');
            const words = ['a', ' scattered', ' ring', ' served', ' this', '.'];
            let full = '';
            words.forEach((w, k) => setTimeout(() => { full += w; c.emit('swarm:job_token', { jobId: job.jobId, delta: w }); }, 20 * (k + 1)));
            setTimeout(() => c.emit('swarm:job_complete', {
              swarmId: job.swarmId, jobId: job.jobId, nonce: job.nonce, tokensGenerated: words.length,
              response: full, receipts: [{ stub: true }],
            }), 20 * (words.length + 2));
          });
        }
      });
    }
  });

  await allReady;
  check(!!handle.manager.swarmForModel('minimax-m2.5'), 'a ready swarm exists for the model (auto-formed)');

  // the request → serveRequest → coordinator → stream back
  const streamed: string[] = [];
  const result = await new Promise<{ response: string; tokens: number } | { error: string }>((resolve) => {
    const r = handle.serveRequest({
      model: 'minimax-m2.5',
      messages: [{ role: 'user', content: 'who served this?' }],
      onToken: (d) => streamed.push(d),
      onDone: (response, tokens) => resolve({ response, tokens }),
      onError: (error) => resolve({ error }),
    });
    check(r !== null && typeof r.jobId === 'string', 'serveRequest dispatched (returned a jobId)');
  });

  check(!('error' in result), `job completed without error (${JSON.stringify(result)})`);
  if (!('error' in result)) {
    check(streamed.length > 0, `tokens streamed to the client (${streamed.length} deltas)`);
    check(result.response === streamed.join(''), 'final response equals the streamed deltas joined');
    check(result.tokens > 0, `token count reported (${result.tokens})`);
  }
  // settle runs async after job_complete; give it a tick
  await new Promise((r) => setTimeout(r, 200));
  check(earned > 0, `settlement ran and credited the stages (${earned} earnings)`);

  // no-swarm path
  const none = handle.serveRequest({ model: 'unknown-model', messages: [], onToken: () => {}, onDone: () => {}, onError: () => {} });
  check(none === null, 'a model with no ready swarm returns null + onError');

  nodes.forEach((n) => n.close());
  server.close(); http.close();
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  done(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); done(1); });
