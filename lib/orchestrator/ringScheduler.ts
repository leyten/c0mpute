/**
 * Shard ring scheduling — the orchestrator's bridge to scheduler_svc (the Python ring
 * planner wrapping shard/scheduler.py). Gathers idle shard workers, asks the service for
 * the VRAM fit + min-latency ring order, and returns the ring in stage order ready for
 * buildRingAssignments.
 *
 * Kept OUT of orchestrator.ts so the planning logic is unit-testable with a stubbed
 * fetch (no live service, no socket). The orchestrator supplies the worker set + a fetch
 * impl; this returns either a planned ring or a reason it can't form one yet.
 */
import type { WorkerInfo } from './types';
import type { RingStageWorker } from './ringAssembly';

/** The /plan response shape from phase0/scheduler_svc.py. */
export interface SchedulerPlan {
  ok: boolean;
  model: string;
  coordinator: string;             // node_id (we use worker.id as node_id)
  ring_order: string[];            // node_ids, head-first
  stages: { stage: number; node_id: string; lo: number; hi: number; n_layers: number }[];
  error?: string;
}

export interface PlanInput {
  model: string;          // model the job wants (also the scheduler model key)
  totalLayers: number;    // model layer count
  gbPerLayer: number;     // model bytes/layer at the served quant
  kvGbPerLayer?: number;
  /** node_id -> (node_id -> rtt ms). Symmetric-ish mesh; missing edges default high. */
  rttMesh: Record<string, Record<string, number>>;
}

export type PlanResult =
  | { ok: true; ring: RingStageWorker[]; coordinator: string; model: string }
  | { ok: false; reason: string };

/**
 * Build the scheduler request body from the idle shard workers + an RTT mesh, POST it to
 * scheduler_svc, and map the returned plan back onto the worker objects (in ring order).
 *
 * @param workers   idle shard workers eligible for this job (each MUST have vramGb,
 *                  peerId, multiaddr — set at registration).
 * @param input     model fit params + the measured RTT mesh between the workers.
 * @param schedulerUrl  base URL of scheduler_svc (e.g. http://127.0.0.1:8088).
 * @param fetchImpl optional fetch (injectable for tests); defaults to global fetch.
 */
export async function planRing(
  workers: WorkerInfo[],
  input: PlanInput,
  schedulerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlanResult> {
  const eligible = workers.filter(
    (w) => w.type === 'shard' && w.status === 'idle'
      && typeof w.vramGb === 'number' && !!w.peerId && !!w.multiaddr,
  );
  if (eligible.length === 0) {
    return { ok: false, reason: 'no idle shard workers with vram/peer identity' };
  }

  const byId = new Map(eligible.map((w) => [w.id, w]));
  const nodes = eligible.map((w) => ({
    node_id: w.id,
    vram_gb: w.vramGb!,
    rtt_ms: input.rttMesh[w.id] || {},
  }));

  let plan: SchedulerPlan;
  try {
    const res = await fetchImpl(`${schedulerUrl.replace(/\/$/, '')}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        total_layers: input.totalLayers,
        gb_per_layer: input.gbPerLayer,
        kv_gb_per_layer: input.kvGbPerLayer ?? 0,
        nodes,
      }),
    });
    plan = (await res.json()) as SchedulerPlan;
    if (!res.ok || !plan.ok) {
      // 400 = pool can't hold the model yet (need more/bigger workers). Not an error,
      // just "not enough capacity" — the caller keeps the job queued.
      return { ok: false, reason: plan?.error || `scheduler ${res.status}` };
    }
  } catch (e) {
    return { ok: false, reason: `scheduler unreachable: ${(e as Error).message}` };
  }

  // Map the plan's stages (already in ring order) onto the worker objects.
  const ring: RingStageWorker[] = [];
  for (const s of plan.stages) {
    const w = byId.get(s.node_id);
    if (!w) return { ok: false, reason: `plan referenced unknown node ${s.node_id}` };
    ring.push({
      socketId: w.socketId,
      workerId: w.id,
      privyUserId: w.privyUserId,
      peerId: w.peerId!,
      multiaddr: w.multiaddr!,
      lo: s.lo,
      hi: s.hi,
    });
  }
  if (ring.length === 0) return { ok: false, reason: 'plan produced no stages' };
  return { ok: true, ring, coordinator: plan.coordinator, model: plan.model };
}
