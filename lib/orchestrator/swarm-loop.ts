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
import { SwarmManager, type SwarmConfig, DEFAULT_SWARM_CONFIG, type ModelProfile } from './swarm';
import { SubprocessSeam } from './swarm-seam';
import type { NodeCapabilities, StageEarning } from './swarm-types';

export interface SwarmLoopOptions {
  recordStageEarning: (e: StageEarning & { swarmId: string; jobId: string; model: string; account: string }) => void;
  config?: SwarmConfig;
  log?: (msg: string) => void;
}

interface AnnouncePayload { cap: NodeCapabilities; model: string; manifestRef: string }
interface ReadyPayload { swarmId: string }
interface CompletePayload { swarmId: string; jobId: string; nonce: string; tokensGenerated: number; receipts: unknown[] }

export function attachSwarmLoop(io: Server, opts: SwarmLoopOptions) {
  const log = opts.log ?? ((m: string) => console.log(m));
  // account binding: nodeId (socket id) → c0mpute account, resolved at announce, used to attribute pay
  const account = new Map<string, string>();

  const mgr = new SwarmManager(
    {
      seam: new SubprocessSeam(),
      emit: (nodeId, event, data) => io.to(nodeId).emit(event as never, data as never),
      recordStageEarning: (e) => {
        const acct = account.get(e.nodeId);
        if (!acct) { log(`[swarm] no account bound for ${e.nodeId}; skipping credit`); return; }
        opts.recordStageEarning({ ...e, account: acct });
      },
      log,
    },
    opts.config ?? DEFAULT_SWARM_CONFIG,
  );

  io.on('connection', (socket) => {
    socket.on('node:announce', (data: AnnouncePayload,
      cb?: (r: { ok: true } | { ok: false; reason: string } | { error: string }) => void) => {
      const acct = (socket as unknown as { privyUserId?: string }).privyUserId;   // set by auth middleware
      if (!acct) { cb?.({ error: 'authentication required' }); return; }
      account.set(socket.id, acct);
      cb?.(mgr.announce(socket.id, data.cap, data.model, data.manifestRef));
    });

    socket.on('swarm:ready', (data: ReadyPayload) => {
      mgr.markReady(data.swarmId, socket.id);
    });

    socket.on('swarm:job_complete', async (data: CompletePayload) => {
      await mgr.settleJob(data.swarmId, data.jobId, data.nonce, data.tokensGenerated, data.receipts);
    });

    socket.on('disconnect', () => {
      account.delete(socket.id);
      mgr.onNodeGone(socket.id);
    });
  });

  // NOTE: forming a swarm needs a measured RTT matrix over the candidate pool (a short probe round the
  // nodes run and report). That collection + the auto-form trigger is the next integration step; the
  // manager exposes formSwarm(model, manifestRef, profile, rtt) for it. See PERMISSIONLESS_LOOP.md.
  return { manager: mgr, formSwarm: (model: string, manifestRef: string, profile: ModelProfile, rtt: number[][]) =>
    mgr.formSwarm(model, manifestRef, profile, rtt) };
}
