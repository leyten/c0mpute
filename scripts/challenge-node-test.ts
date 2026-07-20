/**
 * Node-side spot-check wiring (P0-#1) — both halves, no GPU:
 *
 *  A. the daemon's probe CLIENT (probeStage/answerChallenge in shard-runner): speaks the engine's
 *     tensor-free frame codec ([8B BE body][4B BE hlen][JSON]) against a fixture door; busy is
 *     retried until the deadline and the LAST reply is reported (an honest node never goes silent).
 *  B. the orchestrator's check hygiene (swarm.ts): challenge seeds are crypto-random (the old
 *     `${swarmId}:${checkId}` was predictable from public state), the assignment carries the
 *     commit-first projSeed + deadline, a structured `busy` flakes-without-failing the suspect,
 *     and other structured errors drop the check with no strike.
 *
 * Run:  npx tsx scripts/challenge-node-test.ts
 */
import { createServer as createNetServer, type Socket as NetSocket } from 'node:net';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { probeStage, answerChallenge } from '../c0mpute-worker/src/shard-runner.js';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch, SpotCheckAssignment } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }

// ── A. the probe client vs a fixture door speaking the engine codec ─────────────────────────────

function frameOf(obj: unknown): Buffer {
  const head = Buffer.from(JSON.stringify(obj), 'utf8');
  const body = Buffer.alloc(12 + head.length);
  body.writeBigUInt64BE(BigInt(4 + head.length), 0);
  body.writeUInt32BE(head.length, 8);
  head.copy(body, 12);
  return body;
}

/** A fixture probe door: replies from `script` in order (one conn each), recording requests. */
function fixtureDoor(script: unknown[]): Promise<{ port: number; seen: any[]; close: () => void }> {
  const seen: any[] = [];
  let i = 0;
  const srv = createNetServer((sock: NetSocket) => {
    const chunks: Buffer[] = [];
    sock.on('data', (d) => {
      chunks.push(d);
      const buf = Buffer.concat(chunks);
      if (buf.length < 8 || buf.length < 8 + Number(buf.readBigUInt64BE(0))) return;
      const hlen = buf.readUInt32BE(8);
      seen.push(JSON.parse(buf.subarray(12, 12 + hlen).toString('utf8')));
      sock.end(frameOf(script[Math.min(i++, script.length - 1)]));
    });
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({
    port: (srv.address() as { port: number }).port, seen, close: () => srv.close(),
  })));
}

async function testClient() {
  const sketch = { n: 64, norm: 1.5, proj: [0.1, 0.2], seed: 'ps1' };
  // happy path: request framed correctly, reply parsed
  const d1 = await fixtureDoor([{ ok: 1, lo: 12, hi: 24, sketch, t_ms: 3.2 }]);
  const r1 = await probeStage({ token: 't', proj_seed: 'ps1', n_tokens: 8, lo: 12, hi: 24, seed: 's' }, { port: d1.port });
  check(r1.ok === 1 && r1.sketch?.seed === 'ps1', 'probeStage round-trips the codec and parses the sketch');
  check(d1.seen[0]?.op === 'challenge' && d1.seen[0]?.proj_seed === 'ps1', 'request carries op + commit-first proj_seed');
  d1.close();

  // busy is retried until a non-busy reply lands
  const d2 = await fixtureDoor([{ error: 'busy' }, { error: 'busy' }, { ok: 1, lo: 0, hi: 1, sketch }]);
  const r2 = await answerChallenge({ token: 't', proj_seed: 'p', n_tokens: 8, lo: 0, hi: 1, seed: 's' },
    Date.now() + 30_000, { port: d2.port, retryMs: 50 });
  check(r2.ok === 1 && d2.seen.length === 3, 'answerChallenge retries busy and returns the eventual sketch');
  d2.close();

  // a deadline that expires mid-busy reports busy (never silence)
  const d3 = await fixtureDoor([{ error: 'busy' }]);
  const r3 = await answerChallenge({ token: 't', proj_seed: 'p', n_tokens: 8, lo: 0, hi: 1, seed: 's' },
    Date.now() + 150, { port: d3.port, retryMs: 100 });
  check(r3.error === 'busy', 'deadline mid-busy -> the busy is reported, not swallowed');
  d3.close();

  // structured engine errors pass straight through
  const d4 = await fixtureDoor([{ error: 'bad_token' }]);
  const r4 = await answerChallenge({ token: 'x', proj_seed: 'p', n_tokens: 8, lo: 0, hi: 1, seed: 's' },
    Date.now() + 5_000, { port: d4.port });
  check(r4.error === 'bad_token', 'non-busy engine errors return immediately');
  d4.close();
}

// ── B. orchestrator check hygiene ───────────────────────────────────────────────────────────────

class TestSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const n = r.nodes.length, L = r.model.n_layers, per = Math.floor(L / n);
    const stages = r.nodes.map((nd, i) => ({ id: nd.id, index: i, lo: i * per, hi: i === n - 1 ? L : (i + 1) * per,
      head: i === 0, tail: i === n - 1, layers: per }));
    return { order: stages.map((s) => s.id), head: stages[0].id, stages, dropped: [], step_ms: 100, tok_s_per_g: 10, k: n };
  }
  async verify(_r: unknown): Promise<SettleResult> { return { ok: true, stages: [] } as unknown as SettleResult; }
  async challenge(_r: { a: BlockSketch; b: BlockSketch }) { return { cosine: 1, rel_norm: 0, passed: true }; }
}

const SPEC = { model: 'minimax-m2.5', manifestRef: 'mf1:m25@bafkreitest', minStages: 2,
  profile: { layerCount: 62, prefill_bytes: 1e8, decode_bytes: 1.6e4, decode_steps: 64 } };

async function testOrchestrator() {
  const http = createServer();
  const server = new Server(http, { transports: ['websocket'] });
  server.use((s, next) => { (s as unknown as { privyUserId: string }).privyUserId = 'test-acct'; next(); });
  const repEvents: { pubkey: string; kind: string }[] = [];
  const loop = attachSwarmLoop(server, {
    recordStageEarning: () => {},
    config: { admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers', minCandidates: 2, privacy: null, spotCheckTimeoutMs: 60_000 },
    seam: new TestSeam(),
    trust: { roleFor: () => 'middle', record: (pubkey, kind) => { repEvents.push({ pubkey, kind }); return 0; } },
    auditors: () => [{ nodeId: 'auditor-1', pubkey: 'pk-auditor' }],
    resolveModel: (m) => (m === 'minimax-m2.5' ? SPEC : undefined),
    autoFormDebounceMs: 200,
    log: () => {},
  });
  await new Promise<void>((res) => http.listen(0, res));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;

  const nodes: ClientSocket[] = [];
  const challenges: SpotCheckAssignment[] = [];
  let swarmId = '';
  await new Promise<void>((resolve) => {
    for (let i = 0; i < 2; i++) {
      const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: 'cwt_test' } });
      nodes.push(c);
      c.on('connect', () => c.emit('node:announce', {
        cap: { pubkey: `pk-${i}`, gpu: 'RTX 5090', freeVramMb: 32000, subnet: `10.0.${i}.0/24`, addrs: [`/ip4/1.2.3.${i}/tcp/1/p2p/N${i}`] },
        model: 'minimax-m2.5', manifestRef: SPEC.manifestRef,
      }));
      c.on('swarm:assign', (a: { swarmId: string }) => { swarmId = a.swarmId; c.emit('swarm:ready', { swarmId: a.swarmId }); });
      c.on('swarm:challenge', (a: SpotCheckAssignment) => challenges.push(a));
    }
    const t = setInterval(() => { if (swarmId && loop.manager.getSwarm(swarmId)?.status === 'ready') { clearInterval(t); resolve(); } }, 100);
    setTimeout(() => { clearInterval(t); resolve(); }, 8000);
  });

  const mgr = loop.manager;
  const c1 = mgr.startSpotCheck(swarmId)!;
  check(!!c1, 'spot-check staged against the ready swarm');
  check(!c1.seed.includes(swarmId) && /^[0-9a-f]{32}$/.test(c1.seed), 'challenge seed is crypto-random, not derived from public ids');
  check(/^[0-9a-f]{32}$/.test(c1.projSeed) && c1.projSeed !== c1.seed, 'commit-first projSeed minted independently');
  await new Promise((r) => setTimeout(r, 300));
  const sent = challenges.find((a) => a.checkId === c1.checkId);
  check(!!sent && sent.projSeed === c1.projSeed && sent.deadlineAt === c1.deadlineAt,
    'assignment carries projSeed + deadlineAt to the node');

  // busy from the suspect: flake, never spot_check_fail
  mgr.reportCheckError(c1.checkId, c1.suspectNodeId, 'busy');
  check(repEvents.some((e) => e.pubkey === c1.suspectPubkey && e.kind === 'flake'), 'busy suspect is flaked');
  check(!repEvents.some((e) => e.kind === 'spot_check_fail'), 'busy is NEVER scored as a cheat');

  // an aiming error drops the next check with no reputation event at all
  const c2 = mgr.startSpotCheck(swarmId)!;
  const before = repEvents.length;
  mgr.reportCheckError(c2.checkId, c2.suspectNodeId, 'range_mismatch');
  check(repEvents.length === before, 'range_mismatch drops the check with no strike');
  // an uninvolved node's error is ignored
  const c3 = mgr.startSpotCheck(swarmId)!;
  mgr.reportCheckError(c3.checkId, 'someone-else', 'busy');
  check(repEvents.length === before, "an uninvolved node's error is ignored");

  nodes.forEach((n) => n.close()); server.close(); http.close();
}

async function main() {
  await testClient();
  await testOrchestrator();
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  setTimeout(() => process.exit(failed ? 1 : 0), 100);
}

main().catch((e) => { console.error(e); process.exit(1); });
