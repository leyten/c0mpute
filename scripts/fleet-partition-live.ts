/**
 * Fleet partition — the moat test: a heterogeneous announced pool, and the loop forms swarms
 * REPEATEDLY until the residual pool can't hold the model. Placement quality across diverse
 * supply is the product; this measures it. No human picks any ring.
 *
 *   SHARD_REPO=... npx tsx scripts/fleet-partition-live.ts <announce.json> <out.json>
 *
 * announce.json = {nodes: [...], rtt: [[...]]}  (same shape hetero_join.py emits).
 * Formation policy measured here = the PRODUCT's current policy: greedy-sequential
 * (SwarmManager one-slot leases exclude placed nodes; each formSwarm call optimizes the
 * residual). If greedy leaves tok/s on the table, that finding IS the result.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SwarmManager, type SwarmConfig, type ModelProfile } from '../lib/orchestrator/swarm';
import { SubprocessSeam } from '../lib/orchestrator/swarm-seam';
import type { NodeCapabilities, StageEarning } from '../lib/orchestrator/swarm-types';

const SHARD_REPO = process.env.SHARD_REPO ?? path.resolve(process.cwd(), '..', 'shard');
const [, , announcePath, outPath] = process.argv;

const M25: ModelProfile = {
  layerCount: 62,
  // KV modeled at the DEPLOYMENT width (B=8 × kv-maxlen 8192 → 240 MB/layer), not the B=1
  // profile default (150) — planning at 150 packed a 95 GB H100 NVL to the brim and would
  // OOM at batched runtime KV. The plan must see the KV it will actually serve.
  kv_mb_per_layer: 240,
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
    minCandidates: 2,
    privacy: null,
    spotCheckTimeoutMs: 300_000,
  };
  // role verdict at bind (#19 semantics), refined by measurement: a graph-fail card runs
  // EAGER — safe by construction (eager was the reference its cosine was checked against) —
  // so it is relegated ONLY if its measured eager layer_ms also drags: > 1.5x the fleet's
  // graph-clean median. A 96 GB card at 0.29 ms eager beats a graph 5090; discarding it is
  // the crude version of admission. (Deploy must launch such stages graph-OFF.)
  const graphMs = ann.nodes
    .filter((n) => (n as unknown as { _fast_kernel?: boolean })._fast_kernel === true)
    .map((n) => (n as unknown as { layerMs?: number }).layerMs ?? 99)
    .sort((a, b) => a - b);
  const medianGraphMs = graphMs.length ? graphMs[Math.floor(graphMs.length / 2)] : 0.25;
  const relegated = new Set<string>();
  for (const n of ann.nodes) {
    const fast = (n as unknown as { _fast_kernel?: boolean })._fast_kernel;
    const ms = (n as unknown as { layerMs?: number }).layerMs ?? 99;
    if (fast === false && ms > 1.5 * medianGraphMs) relegated.add(n.pubkey);
    else if (fast === false) console.log(`   eager-admit ${n.nodeId}: layerMs ${ms} <= 1.5x median ${medianGraphMs} (deploy graph-OFF)`);
  }
  const emitted: { nodeId: string; event: string; data: unknown }[] = [];
  const mgr = new SwarmManager(
    {
      seam: new SubprocessSeam({ shardRepo: SHARD_REPO }),
      emit: (nodeId, event, data) => emitted.push({ nodeId, event, data }),
      recordStageEarning: (_e: StageEarning) => {},
      trust: { roleFor: (pk: string) => (relegated.has(pk) ? 'relegated' : 'middle'), record: () => 0 },
      log: (m) => console.log('   ' + m),
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

  // ── form until the residual pool can't hold the model ──
  const swarms: unknown[] = [];
  for (let round = 1; ; round++) {
    const swarm = await mgr.formSwarm(MODEL, MANIFEST, M25, ann.rtt);
    if (!swarm) { console.log(`   round ${round}: residual pool cannot hold the model — partition complete`); break; }
    console.log(`\n   SWARM ${round}: ${swarm.stages.length} stages, head=${swarm.coordinatorNodeId}`);
    for (const s of swarm.stages) {
      console.log(`     stage ${s.stageIndex}  ${s.nodeId}  layers[${s.layerStart}:${s.layerEnd}]`
        + `${s.isHead ? ' [head/coord]' : s.isTail ? ' [tail]' : ''}`);
    }
    swarms.push({
      swarmId: swarm.id, round,
      coordinatorNodeId: swarm.coordinatorNodeId,
      order: swarm.order,
      stages: swarm.stages.map((s) => {
        const n = ann.nodes.find((x) => x.nodeId === s.nodeId) as unknown as { _fast_kernel?: boolean };
        return {
          nodeId: s.nodeId, stageIndex: s.stageIndex, lo: s.layerStart, hi: s.layerEnd,
          layers: s.layers, isHead: s.isHead, isTail: s.isTail, pubkey: s.pubkey,
          eager: n?._fast_kernel === false,     // deploy launches this stage graph-OFF
        };
      }),
    });
    if (round > 8) { console.log('   safety stop: >8 swarms'); break; }
  }
  const placed = new Set(swarms.flatMap((s) => (s as { order: string[] }).order));
  const out = {
    swarms,
    offRing: ann.nodes.filter((n) => !placed.has(n.nodeId)).map((n) => n.nodeId),
    policy: 'greedy-sequential (product policy as-is)',
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`\n   ${swarms.length} swarm(s) formed; off-ring: ${out.offRing.join(', ') || 'none'}`);
  console.log(`   partition written: ${outPath}`);
}

main();
