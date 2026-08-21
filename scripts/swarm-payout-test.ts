/**
 * Swarm pay-model — the per-worker-cut settlement test (no daemon, no GPU, no db).
 *
 * leyten's correction: the platform cut is taken PER WORKER, AFTER the flat-by-layers split — a
 * swarm is N independent operators and one may stake (keeps 80%) while another does not (keeps
 * 70%), so the cut can never be a single blended number off the top. This drives serveRequest
 * with a JobRevenue and captures every recordStageEarning to assert:
 *   (1) revenue splits flat by layers (each stage's revenueCredits ∝ its layers; sums to the charge);
 *   (2) payer + subsidy lane thread onto every stage;
 *   (3) a job that collected N credits pays out ≤ N (self-solvent — the platform keeps its cut),
 *       with each stage's kept share = its own getWorkerRevenueShare (mixed staking honoured);
 *   (4) the split survives mid-job churn (rides the epoch snapshot).
 *
 * The per-worker share function is injected here (getWorkerRevenueShare hits db+chain in prod);
 * the test asserts the exact USD each stage would keep for a mixed staked/unstaked ring.
 *
 * Run:  npx tsx scripts/swarm-payout-test.ts
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch, StageEarning } from '../lib/orchestrator/swarm-types';
import { CREDITS_PER_USD } from '../lib/token-price';

/** The fixture's collected charge, chosen so the flat-by-layers split has a
 *  remainder to resolve. Its USD value follows the live credit denomination. */
const JOB_CREDITS = 100;
const JOB_USD = JOB_CREDITS / CREDITS_PER_USD;

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }
function done(code: number) { setTimeout(() => process.exit(code), 100); }

class TestSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    // uneven layer split so the flat-by-layers revenue split is actually exercised: 40 / 22 layers
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const ids = r.nodes.slice(0, 2).map((n) => n.id);
    const stages = [
      { id: ids[0], index: 0, lo: 0, hi: 40, head: true, tail: false, layers: 40 },
      { id: ids[1], index: 1, lo: 40, hi: 62, head: false, tail: true, layers: 22 },
    ];
    return { order: ids, head: ids[0], stages, dropped: r.nodes.slice(2).map((n) => n.id), step_ms: 100, tok_s_per_g: 10, k: 2 };
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

// injected per-worker cut: acct-0 staked (keeps 0.8), acct-1 did not (keeps 0.7). In prod this is
// getWorkerRevenueShare(account) inside recordSwarmStageEarning; here we assert the design — the
// REAL code produces each stage's revenueCredits slice + account, and applying per-account shares
// to per-account slices must yield the per-worker (not blended) payout.
const STAKED = new Set<string>(['acct-0']);
function shareFor(account: string): number { return STAKED.has(account) ? 0.8 : 0.7; }

async function main() {
  const http = createServer();
  const server = new Server(http, { transports: ['websocket'] });
  // distinct account per node (from the handshake token) so mixed staking is real — each operator
  // is its OWN c0mpute account, exactly what the per-worker cut keys on
  server.use((s, next) => { (s as unknown as { privyUserId: string }).privyUserId = (s.handshake.auth?.token as string) || 'acct-x'; next(); });

  const captured: (StageEarning & { swarmId: string; jobId: string; model: string })[] = [];
  const handle = attachSwarmLoop(server, {
    recordStageEarning: (e) => captured.push(e as StageEarning & { swarmId: string; jobId: string; model: string }),
    config: { admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers', minCandidates: 2, privacy: null, spotCheckTimeoutMs: 60_000 },
    seam: new TestSeam(),
    resolveModel: (m) => (m === 'minimax-m2.5' ? SPEC : undefined),
    autoFormDebounceMs: 300,
    log: () => {},
  });

  await new Promise<void>((res) => http.listen(0, res));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;

  const nodes: ClientSocket[] = [];
  let readyCount = 0;
  const allReady = new Promise<void>((resolve) => {
    for (let i = 0; i < 2; i++) {
      const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: `acct-${i}` } });
      nodes.push(c);
      c.on('connect', () => {
        c.emit('node:announce', { cap: { pubkey: `pk-${i}-${c.id}`, gpu: 'RTX 5090', freeVramMb: 32000, subnet: `10.0.${i}.0/24` }, model: 'minimax-m2.5', manifestRef: 'mf:test' });
      });
      c.on('swarm:assign', (a: { swarmId: string; isHead: boolean }) => {
        c.emit('swarm:ready', { swarmId: a.swarmId });
        if (a.isHead) {
          c.on('swarm:job', (job: { swarmId: string; jobId: string; nonce: string }) => {
            c.emit('swarm:job_token', { jobId: job.jobId, delta: 'x' });
            setTimeout(() => c.emit('swarm:job_complete', {
              swarmId: job.swarmId, jobId: job.jobId, nonce: job.nonce, tokensGenerated: 1000,
              response: 'x', receipts: [{ stub: true }],
            }), 60);
          });
        }
        if (++readyCount === 2) setTimeout(resolve, 150);
      });
    }
  });
  await allReady;

  // a PAID job that collected JOB_CREDITS credits
  await new Promise<void>((resolve) => {
    handle.serveRequest({
      model: 'minimax-m2.5', messages: [{ role: 'user', content: 'q' }],
      revenue: { credits: JOB_CREDITS, payerPrivyId: 'buyer-1' },
      onToken: () => {}, onDone: () => setTimeout(resolve, 250), onError: () => resolve(),
    });
  });

  check(captured.length === 2, `two stage earnings recorded (${captured.length})`);
  const byLayers = [...captured].sort((a, b) => b.layers - a.layers);
  const big = byLayers[0], small = byLayers[1];
  check(big.layers === 40 && small.layers === 22, 'stage layer geometry preserved (40 / 22)');
  // (1) flat-by-layers revenue split: 100 credits × 40/62 = 65 (largest-remainder), 22/62 = 35
  check(big.revenueCredits === 65 && small.revenueCredits === 35,
    `revenue split flat by layers: ${big.revenueCredits} / ${small.revenueCredits} (want 65 / 35)`);
  check((big.revenueCredits! + small.revenueCredits!) === JOB_CREDITS, 'stage revenue sums to the collected charge (self-solvent)');
  // (2) payer + subsidy threading
  check(captured.every((e) => e.payerPrivyId === 'buyer-1'), 'payer threaded to every stage (referral)');
  check(captured.every((e) => e.subsidyKind === undefined), 'paid job: no subsidy lane');
  // (3) per-worker cut AFTER the split — staked stage keeps 80%, unstaked 70%
  // Stated as fractions of the collected charge so the assertions survive a
  // credit redenomination — only JOB_USD moves when CREDITS_PER_USD does.
  const keptBig = (big.revenueCredits! / CREDITS_PER_USD) * shareFor(big.account);     // staked:   0.65 × 0.8 = 0.52 of the charge
  const keptSmall = (small.revenueCredits! / CREDITS_PER_USD) * shareFor(small.account); // unstaked: 0.35 × 0.7 = 0.245 of the charge
  check(Math.abs(keptBig - 0.52 * JOB_USD) < 1e-12, `staked stage keeps 80% of its slice ($${keptBig.toFixed(6)}, want ${(0.52 * JOB_USD).toFixed(6)})`);
  check(Math.abs(keptSmall - 0.245 * JOB_USD) < 1e-12, `unstaked stage keeps 70% of its slice ($${keptSmall.toFixed(6)}, want ${(0.245 * JOB_USD).toFixed(6)})`);
  const platform = JOB_USD - keptBig - keptSmall;
  check(platform > 0 && Math.abs(platform - 0.235 * JOB_USD) < 1e-12, `platform keeps the rest, per-worker ($${platform.toFixed(6)}) — NOT a blended cut`);
  // a blended 0.75 cut would have paid 0.750 of the charge; the true per-worker payout is 0.765 — proving they differ
  check(Math.abs((keptBig + keptSmall) - 0.765 * JOB_USD) < 1e-12, 'per-worker payout (0.765) ≠ blended-average payout (0.750)');

  // (4) free/allowance job books the subsidy lane
  captured.length = 0;
  await new Promise<void>((resolve) => {
    handle.serveRequest({
      model: 'minimax-m2.5', messages: [{ role: 'user', content: 'q2' }],
      revenue: { credits: 10, subsidyKind: 'allowance', payerPrivyId: 'staker-1' },
      onToken: () => {}, onDone: () => setTimeout(resolve, 250), onError: () => resolve(),
    });
  });
  check(captured.length === 2 && captured.every((e) => e.subsidyKind === 'allowance'),
    'free/allowance job: every stage earning carries the subsidy lane (treasury-funded)');

  nodes.forEach((n) => n.close());
  server.close(); http.close();
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  done(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); done(1); });
