/**
 * Live hetero join — the REAL pool (rented boxes that measured themselves) through the REAL
 * permissionless loop: announce → admit → PLACE (shard.plan, per-node measured caps). No human
 * picks the ring; whatever plan comes out is what gets deployed, verbatim.
 *
 *   SHARD_REPO=... npx tsx scripts/hetero-join-live.ts <announce.json> <out.json>
 *
 * announce.json = {nodes: [{nodeId, pubkey, gpu, freeVramMb, subnet, cpuFactor, upMbps, geo,
 *                           layerVramMb?, totalVramMb?, loadPeakExtraMb?, layerMs?}, ...],
 *                  rtt: [[one-way ms]]}   (scratchpad/hetero_join.py builds it from the probes)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SwarmManager, type SwarmConfig, type ModelProfile } from '../lib/orchestrator/swarm';
import { SubprocessSeam } from '../lib/orchestrator/swarm-seam';
import type { NodeCapabilities, StageEarning } from '../lib/orchestrator/swarm-types';

const SHARD_REPO = process.env.SHARD_REPO ?? path.resolve(process.cwd(), '..', 'shard');
const [, , announcePath, outPath] = process.argv;

// M2.5 profile at the MEASURED engine numbers (mirrors shard/plan.py M25_PROFILE) + activation
// bytes so placement is upload-aware across the pool's real uplinks.
const M25: ModelProfile = {
  layerCount: 62,
  prefill_bytes: 1.0e8,
  decode_bytes: 1.6e4,
  decode_steps: 64,
};

async function main() {
  const ann = JSON.parse(fs.readFileSync(announcePath, 'utf8')) as {
    nodes: (NodeCapabilities & { nodeId: string; geo?: string })[];
    rtt: number[][];
  };
  const cfg: SwarmConfig = {
    admission: { mode: 'open', minFreeVramMb: 8 * 1024 },
    paySplit: 'layers',
    minCandidates: 4,
    privacy: null,
    spotCheckTimeoutMs: 300_000,
  };
  // The role verdict at bind (#19 semantics, server-measured): a node whose probe measured
  // has_fast_kernel=false runs eager — a graph-armed stage on it would corrupt silently with
  // valid-looking receipts (the probe's graph_cosine=0 is exactly that early warning). The
  // ADMISSION_SPEC gates anchor/filler on fast_kernel, so such a node is RELEGATED from the
  // stage pool (routed, not rejected — it stays announced for verifier/seeder roles).
  const relegated = new Set<string>();
  for (const n of ann.nodes) {
    if ((n as unknown as { _fast_kernel?: boolean })._fast_kernel === false) relegated.add(n.pubkey);
  }
  const emitted: { nodeId: string; event: string; data: unknown }[] = [];
  const mgr = new SwarmManager(
    {
      seam: new SubprocessSeam({ shardRepo: SHARD_REPO }),
      emit: (nodeId, event, data) => emitted.push({ nodeId, event, data }),
      recordStageEarning: (_e: StageEarning) => {},
      trust: { roleFor: (pubkey: string) => (relegated.has(pubkey) ? 'relegated' : 'middle') },
      log: (m) => console.log('   ' + m),
      newId: (p) => `${p}-hetero-live`,
    },
    cfg,
  );

  const MODEL = 'minimax-m2.5';
  const MANIFEST = 'mf:m25-nvfp4-v1';
  for (const n of ann.nodes) {
    const { nodeId, ...cap } = n;
    const r = mgr.announce(nodeId, cap as NodeCapabilities, MODEL, MANIFEST, `acct-${nodeId}`);
    console.log(`   announce ${nodeId} (${cap.gpu}) -> ${r.ok ? 'admitted' : 'REFUSED: ' + (r as { reason: string }).reason}`);
  }

  const swarm = await mgr.formSwarm(MODEL, MANIFEST, M25, ann.rtt);
  if (!swarm) { console.error('POOL CANNOT HOLD THE MODEL'); process.exit(1); }
  const assigns = emitted.filter((e) => e.event === 'swarm:assign');
  const out = {
    swarmId: swarm.id,
    coordinatorNodeId: swarm.coordinatorNodeId,
    order: swarm.order,
    stages: swarm.stages.map((s) => ({
      nodeId: s.nodeId, stageIndex: s.stageIndex, lo: s.layerStart, hi: s.layerEnd,
      layers: s.layers, isHead: s.isHead, isTail: s.isTail, pubkey: s.pubkey,
    })),
    offRing: ann.nodes.filter((n) => !swarm.order.includes(n.nodeId)).map((n) => n.nodeId),
    assignsEmitted: assigns.length,
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`\n   swarm ${swarm.id}: ${swarm.stages.length} stages, head=${swarm.coordinatorNodeId}`);
  for (const s of swarm.stages) {
    console.log(`     stage ${s.stageIndex}  ${s.nodeId}  layers[${s.layerStart}:${s.layerEnd}]`
      + `${s.isHead ? ' [head/coord]' : s.isTail ? ' [tail]' : ''}`);
  }
  console.log(`   off-ring: ${out.offRing.join(', ') || 'none'}`);
  console.log(`   plan written: ${outPath}`);
}

main();
