/**
 * Permissionless-loop demo — the minimal end-to-end path, driven headless against the REAL shard seams.
 *
 *   announce → admit → PLACE (shard.plan) → assign → pull+form (simulated) → serve → SETTLE (shard.verify) → pay
 *
 * No GPUs: `scripts/sim_nodes.py` stands in for the node side (identities + hardware, then real signed
 * receipts). Everything the control plane does is the actual SwarmManager. The two shard decisions —
 * where to place the ring, and whether the receipt set is honest — run as real subprocesses. This proves
 * the graduation of select_ring into c0mpute wires end to end, and that dishonest settlements pay nobody.
 *
 * Run from the c0mpute repo root:  npx tsx scripts/swarm-loop-demo.ts
 */
import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { SwarmManager, MAX_SWARM_JOB_TOKENS, type SwarmConfig, type ModelProfile } from '../lib/orchestrator/swarm';
import { SubprocessSeam } from '../lib/orchestrator/swarm-seam';
import type { NodeCapabilities, StageEarning } from '../lib/orchestrator/swarm-types';

const SHARD_REPO = process.env.SHARD_REPO ?? path.resolve(process.cwd(), '..', 'shard');
const SIM = path.resolve(process.cwd(), 'scripts', 'sim_nodes.py');
const KEYSTORE = path.join(os.tmpdir(), `swarm-sim-keystore-${process.pid}.json`);

function sim(args: string[]): unknown {
  const r = spawnSync('python3', [SIM, ...args], { encoding: 'utf8', env: { ...process.env, SHARD_REPO } });
  if (r.status !== 0) throw new Error(`sim_nodes ${args[0]} failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}

// M2.5-on-5090 profile (mirrors shard/plan.py M25_PROFILE) + activation bytes so placement weighs uplinks.
const M25: ModelProfile = {
  layerCount: 62,
  prefill_bytes: 1.0e8,   // ~100MB [S,H] activation per hop at 16k ctx — the residential wall
  decode_bytes: 1.6e4,
  decode_steps: 64,
};

function banner(t: string) { console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`); }

async function main() {
  const gen = sim(['gen', '--n', '6', '--keystore', KEYSTORE]) as {
    nodes: (NodeCapabilities & { nodeId: string })[];
    rtt: number[][];
  };

  // ── the control plane: open admission (permissionless) with a proven VRAM floor, pay by layers ──
  const cfg: SwarmConfig = {
    admission: { mode: 'open', minFreeVramMb: 8 * 1024 },  // FORK §10.3: 'curated' allowlist is the alt
    paySplit: 'layers',                                    // FORK §6: 'equal' is the alt
    minCandidates: 2,
  };
  const emitted: { nodeId: string; event: string; data: unknown }[] = [];
  const ledger: (StageEarning & { swarmId: string; jobId: string; model: string })[] = [];
  const mgr = new SwarmManager(
    {
      seam: new SubprocessSeam({ shardRepo: SHARD_REPO }),
      emit: (nodeId, event, data) => emitted.push({ nodeId, event, data }),
      recordStageEarning: (e) => ledger.push(e),
      log: (m) => console.log('   ' + m),
      newId: (p) => `${p}-demo`,
    },
    cfg,
  );

  banner('1. ANNOUNCE + ADMIT  (6 volunteer nodes advertise a shard of MiniMax-M2.5)');
  const MODEL = 'minimax-m2.5';
  const MANIFEST = 'mf:m25-nvfp4-v1';
  for (const n of gen.nodes) {
    const cap: NodeCapabilities = {
      pubkey: n.pubkey, gpu: n.gpu, freeVramMb: n.freeVramMb, subnet: n.subnet,
      cpuFactor: n.cpuFactor, upMbps: n.upMbps, geo: n.geo,
    };
    mgr.announce(n.nodeId, cap, MODEL, MANIFEST, `acct-${n.nodeId}`);   // account bound from the socket
  }
  // show admission rejecting a too-small node (permissionless floor, not a velvet rope)
  const tiny = mgr.announce('node-tiny', {
    pubkey: 'AAAA', gpu: 'GTX 1650', freeVramMb: 4 * 1024, subnet: '2.2.0.0/24',
  }, MODEL, MANIFEST, 'acct-tiny');
  console.log(`   admission of a 4GB node: ${tiny.ok ? 'ADMITTED' : 'REFUSED — ' + (tiny as { reason: string }).reason}`);

  banner('2. PLACE + ASSIGN  (shard.plan picks the ring; assignments emitted per stage)');
  const swarm = await mgr.formSwarm(MODEL, MANIFEST, M25, gen.rtt);
  if (!swarm) throw new Error('pool could not hold the model');
  console.log(`   swarm ${swarm.id}: head=${swarm.coordinatorNodeId}, ${swarm.stages.length} stages`);
  for (const s of swarm.stages) {
    const tag = s.isHead ? ' [coordinator]' : s.isTail ? ' [tail]' : '';
    const geo = gen.nodes.find((n) => n.nodeId === s.nodeId)?.geo;
    console.log(`     stage ${s.stageIndex}  ${s.nodeId} (${geo})  layers[${s.layerStart}:${s.layerEnd}] `
      + `= ${s.layers}${tag}`);
  }
  const dropped = gen.nodes.filter((n) => !swarm.order.includes(n.nodeId)).map((n) => `${n.nodeId}(${n.geo})`);
  console.log(`   off-ring (relegated to verifier/standby): ${dropped.join(', ') || 'none'}`);
  console.log(`   swarm:assign emitted to ${emitted.filter((e) => e.event === 'swarm:assign').length} nodes`);

  banner('3. PULL + FORM  (each node pulls its verified range, warms, connects — simulated)');
  for (const s of swarm.stages) {
    mgr.markReady(swarm.id, s.nodeId);            // real path: node runs shard.fetch_block_range + m25_scatter
  }
  console.log(`   swarm status: ${mgr.getSwarm(swarm.id)!.status}`);

  banner('4. SERVE + SETTLE  (coordinator returns signed receipts; shard.verify gates pay)');
  const stagesForSig = swarm.stages.map((s) => ({ pubkey: s.pubkey, lo: s.layerStart, hi: s.layerEnd }));
  const nonce = 'job-nonce-42';
  const tokens = 480;

  const coord = swarm.coordinatorNodeId;                     // only the coordinator may settle
  const notCoord = swarm.stages.find((s) => s.nodeId !== coord)!.nodeId;

  const honest = sim(['receipts', '--keystore', KEYSTORE, '--stages', JSON.stringify(stagesForSig),
    '--nonce', nonce]) as unknown[];
  const earnings = await mgr.settleJob(swarm.id, 'job-1', coord, nonce, tokens, honest);
  console.log(`   HONEST job (${tokens} tokens): ${earnings ? 'PAID' : 'REJECTED'}`);
  if (earnings) {
    for (const e of earnings) {
      const geo = gen.nodes.find((n) => n.nodeId === e.nodeId)?.geo;
      console.log(`     ${e.nodeId} (${geo}, ${e.account})  layers[${e.layerStart}:${e.layerEnd}] → ${e.tokens} tokens`);
    }
    console.log(`     Σ tokens paid = ${earnings.reduce((a, e) => a + e.tokens, 0)} (== job's ${tokens})`);
  }

  banner('5. TRUST  (dishonest / abusive settlements pay NOBODY)');
  const replay = sim(['receipts', '--keystore', KEYSTORE, '--stages', JSON.stringify(stagesForSig),
    '--nonce', nonce, '--tamper-nonce']) as unknown[];
  const r1 = await mgr.settleJob(swarm.id, 'job-2', coord, nonce, tokens, replay);
  console.log(`   replayed (stale-nonce) receipts → ${r1 ? 'PAID (BUG!)' : 'REJECTED, nobody paid'}`);

  const gap = sim(['receipts', '--keystore', KEYSTORE, '--stages', JSON.stringify(stagesForSig),
    '--nonce', nonce, '--drop-middle']) as unknown[];
  const r2 = await mgr.settleJob(swarm.id, 'job-3', coord, nonce, tokens, gap);
  console.log(`   coverage-gap (a stage skipped) → ${r2 ? 'PAID (BUG!)' : 'REJECTED, nobody paid'}`);

  // a non-coordinator node tries to settle a job it didn't coordinate
  const r3 = await mgr.settleJob(swarm.id, 'job-4', notCoord, nonce, tokens, honest);
  console.log(`   settle by a non-coordinator (${notCoord}) → ${r3 ? 'PAID (BUG!)' : 'REJECTED, not the coordinator'}`);

  // the coordinator re-submits an already-settled job to be paid twice
  const r4 = await mgr.settleJob(swarm.id, 'job-1', coord, nonce, tokens, honest);
  console.log(`   re-settle job-1 (double-pay attempt) → ${r4 ? 'PAID AGAIN (BUG!)' : 'REJECTED, already settled'}`);

  // the coordinator claims a billion tokens on an otherwise-honest receipt set
  const huge = sim(['receipts', '--keystore', KEYSTORE, '--stages', JSON.stringify(stagesForSig),
    '--nonce', 'job-nonce-5']) as unknown[];
  const r5 = await mgr.settleJob(swarm.id, 'job-5', coord, 'job-nonce-5', 1_000_000_000, huge);
  const paid5 = r5 ? r5.reduce((a, e) => a + e.tokens, 0) : 0;
  console.log(`   claim 1e9 tokens → paid ${paid5} (capped at ${MAX_SWARM_JOB_TOKENS}, not a billion)`);

  banner('6. CHURN  (a stage vanishes → the swarm degrades, freeing a re-form)');
  const gone = swarm.stages[1].nodeId;
  mgr.onNodeGone(gone);
  console.log(`   node ${gone} left → swarm status: ${mgr.getSwarm(swarm.id)!.status}`);

  banner('LOOP COMPLETE');
  console.log(`   ledger entries (per-shard credits): ${ledger.length}`);
  console.log(`   the permissionless loop ran end-to-end against real shard.plan + shard.verify.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
