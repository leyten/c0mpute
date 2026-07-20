/**
 * attachSwarmLoop — wires the sharded-swarm control plane into the live orchestrator socket server.
 *
 * This is the graduation point: the orchestrator gains the permissionless loop (announce → admit →
 * place → assign → serve → settle → pay) ALONGSIDE its existing whole-model worker path, without
 * touching it. It registers its own `connection` listener (Socket.io allows several), so the
 * orchestrator hook is a single line and the blast radius is this file.
 *
 * Node ↔ orchestrator events (additive; new names, no change to the existing protocol):
 *   node:announce        (node→orch)  advertise a shard capability for a model → admit → candidate pool
 *   swarm:assign         (orch→node)  a StageAssignment: pull layers [lo,hi) of manifestRef, form, ready
 *   swarm:ready          (node→orch)  this stage pulled + warmed + ring-connected
 *   swarm:job_complete   (node→orch)  the coordinator's result + one signed receipt per stage
 *
 * The orchestrator injects one callback so billing stays under its control:
 *   recordStageEarning(earning) → credit one shard for its tokens. Mapping this onto the existing
 *                                 recordEarning() (tier/creditsCharged/payout basis) is the PAY-MODEL
 *                                 fork (§6, leyten's call), so it is injected, not decided here.
 * Identity reuses the socket's authenticated account: the orchestrator's connection middleware already
 * sets `socket.data-style` privyUserId on every socket, so a node's account is known without a re-auth.
 */
import { randomUUID, randomBytes } from 'crypto';
import type { Server } from 'socket.io';
import { SwarmManager, type Seam, type SwarmConfig, type TrustOracle, DEFAULT_SWARM_CONFIG, type ModelProfile } from './swarm';
import type { JobRevenue, JobSettleSnapshot } from './swarm-types';
import { SubprocessSeam } from './swarm-seam';
import type { ModelSpec } from './model-profiles';
import type { BlockSketch, NodeCapabilities, StageEarning } from './swarm-types';

export interface SwarmLoopOptions {
  recordStageEarning: (e: StageEarning & { swarmId: string; jobId: string; model: string }) => void;
  /** GradedReputation (+ the stake gate) — powers cheat-detection reputation (kick repeat cheaters)
   *  and, in the private tier, the boundary trust gate. */
  trust?: TrustOracle;
  /** trusted spot-check auditors we run (kept out of swarm placement) — the recompute oracle the
   *  spot-check compares strangers against in the open PoC. */
  auditors?: () => { nodeId: string; pubkey: string }[];
  config?: SwarmConfig;
  log?: (msg: string) => void;
  /** placement/settlement seam override — harnesses (scripts/shard-daemon-sim.ts) stub `plan`
   *  so the REAL event wiring is testable on boxes the real planner would rightly refuse. */
  seam?: Seam;
  /** AUTO-FORM: given a model, return its placement spec (profile + manifest + min stages), or
   *  undefined for a model the network can't shard. When provided, the loop forms rings on its own
   *  as candidates announce — closing the "formSwarm is never called by the running server" gap.
   *  Absent => the loop only admits + serves manually-formed swarms (the old behavior). */
  resolveModel?: (model: string) => ModelSpec | undefined;
  /** how long to wait after an announce before trying to form (batch a burst of joins into one ring). */
  autoFormDebounceMs?: number;
}

interface AnnouncePayload { cap: NodeCapabilities; model: string; manifestRef: string }
interface ReadyPayload { swarmId: string }
// job_complete carries BOTH the settlement inputs (nonce/tokens/receipts) and the client-facing
// `response` — one event settles the job AND finishes the client stream.
interface CompletePayload { swarmId: string; jobId: string; nonce: string; tokensGenerated: number; receipts: unknown[]; response?: string }
interface JobTokenPayload { jobId: string; delta: string }
interface ChallengeResultPayload { checkId: string; sketch: BlockSketch; error?: string }

/** A client inference request the orchestrator hands to a ready swarm. onToken streams committed
 *  deltas; onDone ends the stream; onError aborts. Callbacks bridge to the waiting HTTP/SSE client. */
export interface SwarmServeArgs {
  model: string;
  messages: unknown[];
  params?: { maxNew?: number; reasoning?: boolean; tools?: unknown[] };
  onToken: (delta: string) => void;
  onDone: (response: string, tokens: number) => void;
  onError: (message: string) => void;
  timeoutMs?: number;
  revenue?: JobRevenue;        // the collected-revenue basis, split flat-by-layers to the stages at settle
}

export function attachSwarmLoop(io: Server, opts: SwarmLoopOptions) {
  const log = opts.log ?? ((m: string) => console.log(m));

  const mgr = new SwarmManager(
    {
      seam: opts.seam ?? new SubprocessSeam(),
      emit: (nodeId, event, data) => io.to(nodeId).emit(event as never, data as never),
      // the earning already carries the account (frozen onto the stage at form time), so a node that
      // served then disconnected is still credited — no live socket lookup that could miss.
      recordStageEarning: (e) => opts.recordStageEarning(e),
      trust: opts.trust,
      auditors: opts.auditors,
      log,
    },
    opts.config ?? DEFAULT_SWARM_CONFIG,
  );

  // ── AUTO-FORM: the trigger the running server was missing. On announce, debounce per model, then
  //    ask the manager to form a ring from the free candidates. Forms repeatedly as supply grows
  //    (each call consumes free candidates; the fleet-multiswarm behavior), stops when it can't. ──
  const formTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DEBOUNCE = opts.autoFormDebounceMs ?? 3000;
  function scheduleAutoForm(model: string) {
    if (!opts.resolveModel || !opts.resolveModel(model)) return;   // model the network can't shard
    const prev = formTimers.get(model);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => { formTimers.delete(model); void autoForm(model); }, DEBOUNCE);
    t.unref?.();
    formTimers.set(model, t);
  }
  async function autoForm(model: string) {
    const spec = opts.resolveModel?.(model);
    if (!spec) return;
    const n = mgr.candidateCount(model);
    if (n < spec.minStages) return;
    // Uniform placeholder RTT until the probe round lands (PLACEMENT_AS_PROTOCOL: re-measure at
    // formation). Built RIGHT before formSwarm — the manager slices it against the same candidate
    // list synchronously (no await between), so the sizes can't drift. A real N×N latency matrix
    // (nodes probe assigned peers + report) is the next refinement; uniform still forms a working ring.
    const rtt = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 30)));
    try {
      const swarm = await mgr.formSwarm(model, spec.manifestRef, spec.profile, rtt);
      if (swarm) { log(`auto-formed ${swarm.id} for ${model} (${swarm.stages.length} stages)`); scheduleAutoForm(model); }
    } catch (e) {
      log(`auto-form ${model}: ${(e as Error).message}`);
    }
  }

  // ── SERVE: route a client request to a ready swarm's coordinator, relay tokens back ──
  interface Pending {
    coordinatorNodeId: string; swarmId: string; nonce: string;
    /** the job's assignment EPOCH, frozen at dispatch — settlement's authority even if the
     *  swarm degrades/dissolves mid-job (P1-#2 epoch fix) */
    snap: JobSettleSnapshot | null;
    revenue?: JobRevenue;      // frozen at dispatch too, so payout splits exactly what was charged
    onToken: (d: string) => void; onDone: (r: string, t: number) => void; onError: (m: string) => void;
    timer: ReturnType<typeof setTimeout>;
  }
  const pending = new Map<string, Pending>();
  function finishJob(jobId: string): Pending | undefined {
    const p = pending.get(jobId);
    if (p) { clearTimeout(p.timer); pending.delete(jobId); }
    return p;
  }
  function serveRequest(a: SwarmServeArgs): { jobId: string } | null {
    const swarm = mgr.swarmForModel(a.model);   // a ready swarm for this model, or undefined
    if (!swarm) { a.onError(`no ready swarm serving ${a.model}`); return null; }
    const jobId = randomUUID();
    const nonce = randomBytes(16).toString('hex');   // per-job settlement freshness
    const timer = setTimeout(() => {
      if (finishJob(jobId)) a.onError('swarm job timed out');
    }, a.timeoutMs ?? 300_000);
    (timer as { unref?: () => void }).unref?.();
    pending.set(jobId, { coordinatorNodeId: swarm.coordinatorNodeId, swarmId: swarm.id, nonce,
      snap: mgr.snapshotForSettlement(swarm.id), revenue: a.revenue,
      onToken: a.onToken, onDone: a.onDone, onError: a.onError, timer });
    io.to(swarm.coordinatorNodeId).emit('swarm:job' as never, {
      swarmId: swarm.id, jobId, messages: a.messages, nonce,
      maxNew: a.params?.maxNew ?? 512, reasoning: a.params?.reasoning ?? true, tools: a.params?.tools,
    } as never);
    log(`swarm job ${jobId} -> ${swarm.id} coordinator ${swarm.coordinatorNodeId} (${a.model})`);
    return { jobId };
  }

  io.on('connection', (socket) => {
    socket.on('node:announce', (data: AnnouncePayload,
      cb?: (r: { ok: true } | { ok: false; reason: string } | { error: string }) => void) => {
      const acct = (socket as unknown as { privyUserId?: string }).privyUserId;   // set by auth middleware
      if (!acct) { cb?.({ error: 'authentication required' }); return; }
      const res = mgr.announce(socket.id, data.cap, data.model, data.manifestRef, acct);
      cb?.(res);
      if (res.ok) scheduleAutoForm(data.model);
    });

    socket.on('swarm:ready', (data: ReadyPayload) => {
      mgr.markReady(data.swarmId, socket.id);
    });

    // a committed-token delta from the coordinator mid-generation → relay to the waiting client
    socket.on('swarm:job_token', (data: JobTokenPayload) => {
      const p = pending.get(data.jobId);
      if (p && p.coordinatorNodeId === socket.id) p.onToken(data.delta);
    });

    socket.on('swarm:job_complete', async (data: CompletePayload) => {
      // ONE event does two jobs: finish the client stream AND settle. Relay the response first
      // (only the job's coordinator may), then settle against the job's dispatch-time EPOCH
      // (settleJob independently re-checks coordinator; the snapshot makes settlement immune to
      // churn between dispatch and complete — without it, a mid-job degrade stranded honest work).
      const p = finishJob(data.jobId);
      if (p && p.coordinatorNodeId === socket.id) p.onDone(data.response ?? '', data.tokensGenerated);
      await mgr.settleJob(data.swarmId, data.jobId, socket.id, data.nonce, data.tokensGenerated,
        data.receipts, p?.snap ?? null, p?.revenue ?? null);
    });

    socket.on('swarm:challenge_result', async (data: ChallengeResultPayload) => {
      // socket.id must be the check's suspect or verifier — both paths ignore anyone else
      if (data.error) {                 // structured refusal (busy / range_mismatch / infra) —
        mgr.reportCheckError(data.checkId, socket.id, data.error);   // never scored as silence
        return;
      }
      await mgr.submitSketch(data.checkId, socket.id, data.sketch);
    });

    socket.on('disconnect', () => {
      // a coordinator that dropped mid-job can't finish it — fail its pending jobs so the client
      // isn't left hanging (the swarm itself is torn down by onNodeGone).
      for (const [jobId, p] of pending) {
        if (p.coordinatorNodeId === socket.id) { finishJob(jobId); p.onError('coordinator disconnected mid-job'); }
      }
      mgr.onNodeGone(socket.id);
    });
  });

  // expire overdue spot-checks (a silent suspect fails; refusal is not free)
  const sweep = setInterval(() => mgr.sweepSpotChecks(), 30_000);
  sweep.unref?.();

  // Auto-form is wired above (opts.resolveModel). REMAINING refinement: a MEASURED rtt matrix — a short
  // probe round the nodes run and report — replaces the uniform placeholder so placement is latency-aware.
  // Spot-check cadence is still the caller's: startSpotCheck(swarmId) probes one stranger stage.
  return {
    manager: mgr,
    /** route a client inference request to a ready swarm's coordinator (Leg 8 dispatch). */
    serveRequest,
    formSwarm: (model: string, manifestRef: string, profile: ModelProfile, rtt: number[][]) =>
      mgr.formSwarm(model, manifestRef, profile, rtt),
    startSpotCheck: (swarmId: string, suspectNodeId?: string) => mgr.startSpotCheck(swarmId, suspectNodeId),
  };
}
