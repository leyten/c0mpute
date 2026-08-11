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
import { RttCache } from './rtt-cache';
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
  /** how often each candidate is handed a fresh slice of peers to measure. 0 disables the rounds
   *  (a node still gets one list when it announces). */
  rttProbePeriodMs?: number;
}

interface AnnouncePayload { cap: NodeCapabilities; model: string; manifestRef: string }
interface ReadyPayload { swarmId: string }
/** one node's round of measurements to the peers it was handed (`swarm:probe_peers`) */
interface RttPayload { model?: string; rttMs: Record<string, number> }
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

  // ── MEASURED RTT: nodes probe the peers we hand them and report back; placement plans on what
  //    they measured instead of a constant. Empty until the first report lands, and an empty cache
  //    yields exactly the old constant matrix, so this is inert until nodes actually measure. ──
  const rttCache = new RttCache();
  /** peers handed to one node per round. The matrix only needs pairs, not a full mesh — every
   *  reported pair replaces a fill, and a big pool is covered over successive rounds by rotating. */
  const PROBE_FANOUT = 16;
  const probeCursor = new Map<string, number>();          // nodeId → where its last slice ended
  function sendProbePeers(nodeId: string, model: string): string[] {
    const pool = mgr.probeTargets(model).filter((t) => t.nodeId !== nodeId);
    if (!pool.length) return [];
    const off = (probeCursor.get(nodeId) ?? 0) % pool.length;
    probeCursor.set(nodeId, off + PROBE_FANOUT);
    const peers = [...pool.slice(off), ...pool.slice(0, off)].slice(0, PROBE_FANOUT);
    io.to(nodeId).emit('swarm:probe_peers' as never, { model, peers } as never);
    return peers.map((p) => p.nodeId);
  }

  // ── AUTO-FORM: the trigger the running server was missing. On announce, debounce per model, then
  //    ask the manager to form a ring from the free candidates. Forms repeatedly as supply grows
  //    (each call consumes free candidates; the fleet-multiswarm behavior), stops when it can't. ──
  const formTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const formInFlight = new Set<string>();                 // models whose autoForm is inside the planner await
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
    // ONE form in flight per model. formSwarm awaits the planner seam — a python subprocess that
    // routinely outlives the debounce — and the candidates it is placing are not marked as taken
    // until it RETURNS. So a second announce or disconnect during that window sees no pulling ring
    // and the very same free candidates, and forms a SECOND ring over them: every node gets two
    // conflicting swarm:assign events, nodeToSwarm keeps whichever landed last, and the loser is
    // orphaned in `pulling` forever — the state that then blocks the model entirely. Defer; the
    // in-flight form either places these nodes or leaves them free for the next attempt.
    if (formInFlight.has(model)) {
      log(`auto-form ${model}: a form is already in flight — deferring`);
      scheduleAutoForm(model);
      return;
    }
    // DON'T form a new/replacement ring while one for this model is still PULLING (loading). A cold
    // cohort takes ~30min to pull+load; forming again during that window (on any transient
    // disconnect) preempts the in-progress pulls and thrashes — the re-form STORM that starved the
    // rehearsal serve. Let the current ring load to `ready` (or genuinely fail) first; reschedule.
    if (mgr.snapshot().swarms.some((s) => s.model === model && (s.status === 'pulling' || s.status === 'forming'))) {
      log(`auto-form ${model}: a ring is still loading — deferring to avoid a re-form storm`);
      scheduleAutoForm(model);
      return;
    }
    const ids = mgr.candidateIds(model);
    if (ids.length < spec.minStages) return;
    // The MEASURED latency matrix (what the nodes reported), aligned to the candidate pool order the
    // manager slices against. Built RIGHT before formSwarm and SYNCHRONOUSLY — no await between, or
    // an announce/disconnect mid-flight changes the pool and the form silently bails on the length
    // check. Pairs nobody has measured fall back to the old placeholder, so a silent pool plans
    // exactly as it did before; a pool that measured gets its ring order, its head and its trim
    // decided by latency instead of by announce arrival order (E0, 2026-07-28).
    const rtt = rttCache.matrix(ids);
    formInFlight.add(model);
    try {
      const swarm = await mgr.formSwarm(model, spec.manifestRef, spec.profile, rtt);
      if (swarm) { log(`auto-formed ${swarm.id} for ${model} (${swarm.stages.length} stages)`); scheduleAutoForm(model); }
      // A form that came back empty AFTER the pool moved is the churn case formSwarm now aborts on
      // (a planned stage left or was placed mid-plan) rather than ringing a stage that isn't there.
      // Retry on the pool as it actually is now. Gated on a real change, so the ordinary "too few
      // candidates" / "can't hold the model" null still stops instead of spinning the debounce.
      else if (mgr.candidateIds(model).join() !== ids.join()) {
        log(`auto-form ${model}: the candidate pool moved mid-plan — retrying on the fresh pool`);
        scheduleAutoForm(model);
      }
    } catch (e) {
      log(`auto-form ${model}: ${(e as Error).message}`);
    } finally {
      formInFlight.delete(model);
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
    if (p) {
      clearTimeout(p.timer); pending.delete(jobId);
      // release the ring's occupancy only when its LAST in-flight job leaves — `pending` is the
      // authority on what a ring is actually doing, so two concurrent jobs on one ring can't have
      // the first to finish advertise it as idle while the second is still generating.
      if (![...pending.values()].some((q) => q.swarmId === p.swarmId)) mgr.markIdle(p.swarmId);
    }
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
    mgr.markServing(swarm.id);   // occupied — the next request prefers a ring that isn't
    io.to(swarm.coordinatorNodeId).emit('swarm:job' as never, {
      swarmId: swarm.id, jobId, messages: a.messages, nonce,
      // reasoning DEFAULTS OFF on the serve path: the network decodes greedily, and greedy long-form
      // thinking degenerates (measured live 08-09: 1536 tokens of looping chain-of-thought, zero
      // visible answer). Callers opt in per request; the engine's think-split (shard #171) then
      // separates the channels correctly.
      maxNew: a.params?.maxNew ?? 512, reasoning: a.params?.reasoning ?? false, tools: a.params?.tools,
    } as never);
    log(`swarm job ${jobId} -> ${swarm.id} coordinator ${swarm.coordinatorNodeId} (${a.model})`);
    return { jobId };
  }

  io.on('connection', (socket) => {
    socket.on('node:announce', (data: AnnouncePayload,
      cb?: (r: { ok: true } | { ok: false; reason: string } | { error: string }) => void) => {
      const acct = (socket as unknown as { privyUserId?: string }).privyUserId;   // set by auth middleware
      if (!acct) { cb?.({ error: 'authentication required' }); return; }
      // Typed payload, untrusted wire: any authenticated socket (including an
      // anon visitor) could emit this with no argument and the bare `data.cap`
      // deref took the whole process down. node:rtt below already guards; these
      // handlers were the oversight.
      if (!data?.cap || typeof data.model !== 'string') { cb?.({ error: 'bad payload' }); return; }
      const res = mgr.announce(socket.id, data.cap, data.model, data.manifestRef, acct);
      cb?.(res);
      if (res.ok) {
        scheduleAutoForm(data.model);
        // give the newcomer targets immediately — its first ring may form within the debounce, and
        // a node with no targets can never contribute a measurement — then hand the SAME peers a
        // fresh slice so they measure back. Measurement is pairwise, and without the second half the
        // node that announced first would learn about nobody until the next rolling round. Bounded
        // at PROBE_FANOUT + 1 emits per announce, so a burst of joins is not a pool-wide fan-out.
        for (const peerId of sendProbePeers(socket.id, data.model)) sendProbePeers(peerId, data.model);
      }
    });

    // a round of measurements to the peers we handed this node (rtt-cache.ts owns the validation)
    socket.on('node:rtt', (data: RttPayload) => {
      const kept = rttCache.report(socket.id, data?.rttMs);
      if (kept) log(`rtt: ${socket.id} reported ${kept} peer measurement(s) (cache ${rttCache.size})`);
    });

    socket.on('swarm:ready', (data: ReadyPayload) => {
      if (!data?.swarmId) return;
      mgr.markReady(data.swarmId, socket.id);
    });

    // a committed-token delta from the coordinator mid-generation → relay to the waiting client
    socket.on('swarm:job_token', (data: JobTokenPayload) => {
      if (!data?.jobId) return;
      const p = pending.get(data.jobId);
      if (p && p.coordinatorNodeId === socket.id) p.onToken(data.delta);
    });

    socket.on('swarm:job_complete', async (data: CompletePayload) => {
      // ONE event does two jobs: finish the client stream AND settle. Relay the response first
      // (only the job's coordinator may), then settle against the job's dispatch-time EPOCH
      // (settleJob independently re-checks coordinator; the snapshot makes settlement immune to
      // churn between dispatch and complete — without it, a mid-job degrade stranded honest work).
      if (!data?.jobId) return;
      // The coordinator check has to come FIRST. finishJob used to run before
      // it, so any socket that knew the jobId could clear the pending entry and
      // its timeout: the client stream then had nothing left to terminate it,
      // and the real coordinator's completion arrived with p === undefined, so
      // the ring served the answer and every stage was credited zero revenue.
      const p = pending.get(data.jobId);
      if (p && p.coordinatorNodeId !== socket.id) return;
      if (p) {
        finishJob(data.jobId);
        p.onDone(data.response ?? '', data.tokensGenerated);
      }
      // p is undefined for a completion that lands after the job already
      // settled or timed out — still hand it to settleJob, which re-checks the
      // coordinator and dedupes against `settled` on its own.
      await mgr.settleJob(data.swarmId, data.jobId, socket.id, data.nonce, data.tokensGenerated,
        data.receipts, p?.snap ?? null, p?.revenue ?? null);
    });

    socket.on('swarm:challenge_result', async (data: ChallengeResultPayload) => {
      if (!data?.checkId) return;
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
      // a departed node's samples describe paths that no longer exist — they must not place the next pool
      rttCache.forget(socket.id);
      probeCursor.delete(socket.id);
      const swarm = mgr.onNodeGone(socket.id);
      // A NON-coordinator stage leaving deliberately does NOT fail the job it was
      // serving. That looks like a hang (the reader can wait out the full job
      // budget for a ring that is already degraded), and an earlier pass here did
      // fail those jobs — but doing so removes the pending entry, so the frozen
      // settlement snapshot goes with it and a completion that still arrives pays
      // every stage zero. The epoch snapshot exists precisely so honest work
      // survives mid-job churn (scripts/epoch-settle-test.ts asserts it). Cutting
      // the reader loose sooner needs a shorter per-job deadline on a degraded
      // ring, not a teardown of the settlement path — leyten's call, since it is
      // a payout-semantics change.
      // CHURN SELF-HEAL (P0-#6): a dead stage just freed its whole ring's slots — re-form from
      // the survivors + free spares NOW. Auto-form's only other trigger is an ANNOUNCE, which
      // may never come; without this the network stays down until fresh supply happens by
      // (churn-proof.sh red run 2026-07-20: DEGRADED then 120s of silence).
      if (swarm) scheduleAutoForm(swarm.model);
    });
  });

  // expire overdue spot-checks (a silent suspect fails; refusal is not free), then age out the
  // rings themselves: a ring that never finished pulling is declared dead and its nodes freed, and
  // long-terminal rings are evicted. Re-form for each model that just lost a ring — otherwise the
  // survivors sit idle until an announce happens by, which for a stable fleet may be never.
  const sweep = setInterval(() => {
    mgr.sweepSpotChecks();
    for (const model of mgr.sweepSwarms()) scheduleAutoForm(model);
  }, 30_000);
  sweep.unref?.();

  // rolling probe round: every candidate gets a fresh rotated slice of peers to measure, so a pool
  // larger than PROBE_FANOUT fills its matrix over successive rounds and samples refresh before the
  // cache TTL retires them. Nodes that ignore the event simply stay unmeasured.
  const probePeriod = opts.rttProbePeriodMs ?? 60_000;
  const probeRound = probePeriod > 0 ? setInterval(() => {
    for (const c of mgr.snapshot().candidates) sendProbePeers(c.nodeId, c.model);
  }, probePeriod) : null;
  probeRound?.unref?.();

  // Auto-form is wired above (opts.resolveModel), and it now places on the MEASURED matrix the nodes
  // report (rtt-cache.ts). REMAINING refinement: the reports are self-attested, and taking max() of a
  // pair only cancels one-sided UNDERSTATEMENT. Receiver-signed observations + a disinterested prober
  // (PLACEMENT_AS_PROTOCOL.md §3, level 2) are what make a fabricated RTT unprofitable outright.
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
