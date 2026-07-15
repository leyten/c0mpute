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
import type { Server } from 'socket.io';
import { SwarmManager, type Seam, type SwarmConfig, type TrustOracle, DEFAULT_SWARM_CONFIG, type ModelProfile } from './swarm';
import { SubprocessSeam } from './swarm-seam';
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
}

interface AnnouncePayload { cap: NodeCapabilities; model: string; manifestRef: string }
interface ReadyPayload { swarmId: string }
interface CompletePayload { swarmId: string; jobId: string; nonce: string; tokensGenerated: number; receipts: unknown[] }
interface ChallengeResultPayload { checkId: string; sketch: BlockSketch }

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

  io.on('connection', (socket) => {
    socket.on('node:announce', (data: AnnouncePayload,
      cb?: (r: { ok: true } | { ok: false; reason: string } | { error: string }) => void) => {
      const acct = (socket as unknown as { privyUserId?: string }).privyUserId;   // set by auth middleware
      if (!acct) { cb?.({ error: 'authentication required' }); return; }
      cb?.(mgr.announce(socket.id, data.cap, data.model, data.manifestRef, acct));
    });

    socket.on('swarm:ready', (data: ReadyPayload) => {
      mgr.markReady(data.swarmId, socket.id);
    });

    socket.on('swarm:job_complete', async (data: CompletePayload) => {
      // socket.id is the submitter — settleJob checks it is the swarm's coordinator (only it may settle)
      await mgr.settleJob(data.swarmId, data.jobId, socket.id, data.nonce, data.tokensGenerated, data.receipts);
    });

    socket.on('swarm:challenge_result', async (data: ChallengeResultPayload) => {
      // socket.id must be the check's suspect or verifier — submitSketch ignores anyone else
      await mgr.submitSketch(data.checkId, socket.id, data.sketch);
    });

    socket.on('disconnect', () => {
      mgr.onNodeGone(socket.id);
    });
  });

  // expire overdue spot-checks (a silent suspect fails; refusal is not free)
  const sweep = setInterval(() => mgr.sweepSpotChecks(), 30_000);
  sweep.unref?.();

  // NOTE: forming a swarm needs a measured RTT matrix over the candidate pool (a short probe round the
  // nodes run and report). That collection + the auto-form trigger is the next integration step; the
  // manager exposes formSwarm(model, manifestRef, profile, rtt) for it. See PERMISSIONLESS_LOOP.md.
  // Spot-check cadence is likewise the caller's: startSpotCheck(swarmId) probes one stranger stage.
  return {
    manager: mgr,
    formSwarm: (model: string, manifestRef: string, profile: ModelProfile, rtt: number[][]) =>
      mgr.formSwarm(model, manifestRef, profile, rtt),
    startSpotCheck: (swarmId: string, suspectNodeId?: string) => mgr.startSpotCheck(swarmId, suspectNodeId),
  };
}
