/**
 * Safety-rails demo — boundary-layer pinning + the spot-check, proven against the REAL shard seams.
 *
 * The loop demo (swarm-loop-demo.ts) proves the mechanism with pinning OFF. This proves the RAIL:
 * with open admission and a mixed pool of trusted (staked) + untrusted (stranger) nodes, the REAL
 * `python3 -m shard.plan` places the ring, and NO stranger can land on a boundary layer or an end
 * role — the leaky embedding/output layers stay on staked nodes, strangers hold only deep-middle.
 * Then a real `python3 -m shard.challenge` spot-check catches a stranger that fakes its block.
 *
 * No GPUs: sim_nodes.py mints identities; the boundary invariant is checked on the actual plan the
 * adversarially-tested select_ring returned. Run from the c0mpute repo root:
 *   SHARD_REPO=../shard  npx tsx scripts/rails-demo.ts
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { SwarmManager, DEFAULT_SWARM_CONFIG, type SwarmConfig, type ModelProfile } from '../lib/orchestrator/swarm';
import { SubprocessSeam } from '../lib/orchestrator/swarm-seam';
import { GradedReputation } from '../lib/orchestrator/reputation';
import type { NodeCapabilities, BlockSketch } from '../lib/orchestrator/swarm-types';

const SHARD_REPO = process.env.SHARD_REPO ?? path.resolve(process.cwd(), '..', 'shard');
const SIM = path.resolve(process.cwd(), 'scripts', 'sim_nodes.py');
const KEYSTORE = path.join(os.tmpdir(), `rails-demo-keystore-${process.pid}.json`);
const B_IN = 8, B_OUT = 8, N_LAYERS = 62;

function sim(args: string[]): any {
  const r = spawnSync('python3', [SIM, ...args], { encoding: 'utf8', env: { ...process.env, SHARD_REPO } });
  if (r.status !== 0) throw new Error(`sim_nodes ${args[0]} failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}
function banner(t: string) { console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`); }

const M25: ModelProfile = { layerCount: N_LAYERS };

async function main() {
  // 7 nodes; we designate 3 as staked/trusted (boundary-eligible) and leave 4 as strangers.
  const gen = sim(['gen', '--n', '7', '--keystore', KEYSTORE]) as {
    nodes: (NodeCapabilities & { nodeId: string })[]; rtt: number[][];
  };
  const STAKED = new Set(gen.nodes.slice(0, 3).map((n) => n.pubkey));   // 3 staked identities

  // graded reputation + the stake gate; pump the staked nodes to boundary-eligible.
  const rep = new GradedReputation({ isStaked: (p) => STAKED.has(p) }, {});
  for (const p of STAKED) for (let i = 0; i < 20; i++) rep.record(p, 'spot_check_pass');

  const cfg: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, privacy: { boundaryIn: B_IN, boundaryOut: B_OUT } };

  const emitted: { nodeId: string; event: string; data: any }[] = [];
  const mgr = new SwarmManager({
    seam: new SubprocessSeam({ shardRepo: SHARD_REPO }),
    emit: (nodeId, event, data) => emitted.push({ nodeId, event, data }),
    recordStageEarning: () => {},
    trust: rep,
    log: (m) => console.log('   ' + m),
    newId: (p) => `${p}-rails`,
  }, cfg);

  banner(`1. ANNOUNCE  (open admission — 3 staked + 4 stranger nodes; pinning ${B_IN}/${B_OUT})`);
  const MODEL = 'minimax-m2.5', MANIFEST = 'mf:m25-nvfp4-v1';
  for (const n of gen.nodes) {
    const cap: NodeCapabilities = {
      pubkey: n.pubkey, gpu: n.gpu, freeVramMb: n.freeVramMb, subnet: n.subnet,
      cpuFactor: n.cpuFactor, upMbps: n.upMbps, geo: n.geo,
    };
    mgr.announce(n.nodeId, cap, MODEL, MANIFEST, `acct-${n.nodeId}`);
    const role = rep.roleFor(n.pubkey);
    console.log(`   ${n.nodeId} (${n.geo}) — ${STAKED.has(n.pubkey) ? 'STAKED' : 'stranger'} → role ${role}`);
  }

  banner('2. PLACE  (real shard.plan pins the boundary; assert no stranger on a leaky stage)');
  const swarm = await mgr.formSwarm(MODEL, MANIFEST, M25, gen.rtt);
  assert.ok(swarm, 'pinned swarm should form (3 staked cover both ends + boundary)');
  for (const s of swarm!.stages) {
    const staked = STAKED.has(s.pubkey);
    const tag = s.isHead ? '[coordinator]' : s.isTail ? '[tail]' : s.boundary ? '[boundary]' : '';
    console.log(`   stage ${s.stageIndex}  ${s.nodeId}  layers[${s.layerStart}:${s.layerEnd}]  `
      + `${staked ? 'STAKED' : 'stranger'} ${tag}`);
  }
  // THE INVARIANT — on the real plan: every boundary/head/tail stage is a staked node, and every
  // stranger holds only deep-middle layers.
  for (const s of swarm!.stages) {
    if (s.boundary || s.isHead || s.isTail) {
      assert.ok(STAKED.has(s.pubkey), `LEAK: stranger ${s.nodeId} on a boundary/end stage`);
    }
    if (!STAKED.has(s.pubkey)) {
      assert.ok(s.layerStart >= B_IN && s.layerEnd <= N_LAYERS - B_OUT && !s.boundary,
        `LEAK: stranger ${s.nodeId} holds boundary layers [${s.layerStart},${s.layerEnd})`);
    }
  }
  console.log('   ✓ every boundary/head/tail stage is STAKED; strangers hold only deep-middle layers');

  banner('3. SPOT-CHECK  (real shard.challenge catches a stranger faking its block)');
  for (const s of swarm!.stages) mgr.markReady(swarm!.id, s.nodeId);
  const check = mgr.startSpotCheck(swarm!.id);
  assert.ok(check, 'a spot-check should launch against a stranger stage');
  assert.ok(!STAKED.has(check!.suspectPubkey) && STAKED.has(check!.verifierPubkey));
  console.log(`   challenge ${check!.checkId}: suspect ${check!.suspectNodeId} `
    + `layers[${check!.layerStart}:${check!.layerEnd}] vs trusted ${check!.verifierNodeId}`);

  // The trusted verifier's sketch (honest) vs a stranger that returns garbage instead of running
  // the block. Real derive_challenge/sketch numbers via sim_nodes; the seam judges them.
  const dim = 256;
  const honest: BlockSketch = { n: 190_000, norm: 42.0, proj: Array.from({ length: dim }, (_, i) => Math.sin(i)) };
  const faked: BlockSketch = { n: 190_000, norm: 42.0, proj: Array.from({ length: dim }, (_, i) => Math.sin(i * 3.1 + 1)) };
  await mgr.submitSketch(check!.checkId, check!.verifierNodeId, honest);
  const verdict = await mgr.submitSketch(check!.checkId, check!.suspectNodeId, faked);
  assert.ok(verdict && !verdict.passed, 'a faked block must FAIL the spot-check');
  console.log(`   ✓ faked block rejected (cosine ${verdict!.cosine.toFixed(3)}); reputation struck, swarm degraded`);
  assert.equal(rep.roleFor(check!.suspectPubkey), 'relegated');   // one strike -> off the stage pool
  console.log(`   ✓ struck stranger reputation now: ${rep.roleFor(check!.suspectPubkey)} (off the stage pool)`);

  banner('RAILS PROVEN');
  console.log('   open admission is SAFE for traffic: strangers are structurally kept off the leaky');
  console.log('   boundary layers by the real planner, and caught by the real spot-check if they cheat.');
}

main().catch((e) => { console.error(e); process.exit(1); });
