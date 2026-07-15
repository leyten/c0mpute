// Shard mode — the long-lived node daemon (c0mpute NODE_DAEMON.md): the gateway between a
// stranger's machine and the network. Lifecycle: ENROLL (bind identity, self-measure, announce)
// -> STANDBY (stay announced, wait) -> SERVE (on swarm:assign: pull the layer range, launch
// `python -m shard.stage` + the sidecar, report ready, self-heal) -> back to STANDBY.
//
// The control plane is the same socket.io connection the other modes use (cwt_ token auth);
// the server-side handlers live in lib/orchestrator/swarm-loop.ts. Role is NEVER self-reported:
// the HTTP node-bind step submits the measured vector and the server decides (#19 semantics).

import { io, Socket } from 'socket.io-client';
import { hostname } from 'os';
import {
  proveIdentity, receiptPubkey, detectGpuName, detectFreeVramMB, probeMeasure,
  pullRange, startSidecar, pickDialAddrs, StageProcess, FORWARD_PORT, MODEL_DIR, SHARD_REPO,
  type SidecarHandle,
} from './shard-runner.js';
import { ensureShardSetup } from './shard-setup.js';

const MODEL = process.env.C0MPUTE_SHARD_MODEL || 'minimax-m2.5';
const MANIFEST_REF = process.env.C0MPUTE_SHARD_MANIFEST || 'mf:m25-nvfp4-v1';
const MAX_STAGE_RESTARTS = 5;

interface ShardWorkerOptions {
  token: string;
  orchestratorUrl: string;
}

// Mirrors lib/orchestrator/swarm-types.ts (the payloads a stage assignment carries).
interface StagePeer {
  nodeId: string; pubkey: string; stageIndex: number; layerStart: number; layerEnd: number;
  addrs: string[];
}
interface StageAssignment {
  swarmId: string;
  model: string;
  manifestRef: string;
  stageIndex: number;
  layerStart: number;
  layerEnd: number;
  role: 'coordinator' | 'stage';
  isHead: boolean;
  isTail: boolean;
  losslessWire: boolean;
  peers: StagePeer[];
  coordinatorNodeId: string;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [shard] ${msg}`);
}

/** Public-IP /24 for the anti-colocation key. Falls back to a host-local tag (announce
 *  survives, colocation detection degrades — logged loudly). */
async function detectSubnet(): Promise<string> {
  for (const url of ['https://checkip.amazonaws.com', 'https://api.ipify.org']) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const ip = (await res.text()).trim();
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 3).join('.') + '.0/24';
    } catch { /* try the next service */ }
  }
  log('WARNING: public IP lookup failed — announcing a host-local subnet key (anti-colocation degraded)');
  return `local-${hostname()}`;
}

/** ENROLL step 1: prove the node key controls its PeerId, bind it to the account, and get the
 *  server-decided role verdict back (HTTP /api/node-bind; nonce is single-use, 5 min TTL). */
async function bindIdentity(opts: ShardWorkerOptions, cap: Record<string, unknown>): Promise<string> {
  const base = opts.orchestratorUrl.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${opts.token}` };
  const nres = await fetch(`${base}/api/node-bind`, { headers: auth, signal: AbortSignal.timeout(15_000) });
  if (!nres.ok) throw new Error(`node-bind nonce: HTTP ${nres.status}`);
  const { nonce } = (await nres.json()) as { nonce: string };
  const { peerId, sig } = proveIdentity(nonce);
  // NOTE: no `model` field — the route pipes it to shard.probe as a PROFILE dict, not a name
  // (the model NAME rides on node:announce); a string here breaks the role decision server-side
  const bres = await fetch(`${base}/api/node-bind`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ peerId, nonce, sig, cap }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!bres.ok) throw new Error(`node-bind: HTTP ${bres.status}`);
  const bound = (await bres.json()) as { bound: boolean; admission?: { role?: string; error?: string } };
  if (!bound.bound) throw new Error('node-bind refused');
  const adm = bound.admission;
  log(`identity bound: ${peerId}`);
  log(adm?.role ? `admission verdict: ${adm.role}` : `admission pending (${adm?.error || 'no verdict'})`);
  return peerId;
}

/** The two capability shapes: `measured` = the RAW `shard.probe --measure` vector (node-bind
 *  pipes it verbatim into the server-driven role probe — snake_case keys), `announceCap` = the
 *  NodeCapabilities shape `node:announce`/formSwarm read (camelCase). Probe unavailable (engine
 *  or slice not on disk yet) degrades to basic detection; the server re-decides role either way. */
async function buildCapabilities(): Promise<{ measured: Record<string, unknown>; announceCap: Record<string, unknown> }> {
  const pubkey = receiptPubkey();
  const measured = probeMeasure() ?? {};
  const announceCap = {
    pubkey,
    gpu: detectGpuName(),
    freeVramMb: detectFreeVramMB(),
    subnet: await detectSubnet(),
    ...(measured.footprint_mb_per_layer !== undefined && { layerVramMb: measured.footprint_mb_per_layer }),
    ...(measured.total_vram_mb !== undefined && { totalVramMb: measured.total_vram_mb }),
    ...(measured.load_peak_extra_mb !== undefined && { loadPeakExtraMb: measured.load_peak_extra_mb }),
    ...(measured.layer_ms !== undefined && { layerMs: measured.layer_ms }),
  };
  return { measured, announceCap };
}

export async function startShardWorker(opts: ShardWorkerOptions): Promise<void> {
  log(`shard node daemon starting (model ${MODEL}, engine at ${SHARD_REPO}, weights at ${MODEL_DIR})`);

  // ── ENROLL step 0: self-provision (engine, venv, sidecar, probe slice — zero env vars) ──
  await ensureShardSetup();

  // ── the sidecar is a DAEMON-scoped fixture: a standby listener from enroll on (its ADDR
  // lines are the dialable identity peers get in their assignments), restarted with -forward/
  // -allow ring legs when serving, restored to a bare listener on teardown. Generation counter
  // = intentional restarts never trip the death watcher.
  let sidecar: SidecarHandle | null = null;
  let sidecarGen = 0;
  let shuttingDown = false;
  function bootSidecar(cfg: { forwards?: string[]; allow?: string[] } = {}): SidecarHandle {
    const gen = ++sidecarGen;
    sidecar?.proc.kill('SIGTERM');
    const sc = startSidecar(cfg);
    sidecar = sc;
    sc.proc.on('exit', (code) => {
      if (gen !== sidecarGen || shuttingDown) return;   // superseded / operator shutdown
      if (current) {
        release(`sidecar exited (${code}) — the ring leg is dark`);
      } else {
        log(`standby sidecar died (${code}) — restarting in 2s`);
        setTimeout(() => { if (gen === sidecarGen && !shuttingDown) bootSidecar(); }, 2000);
      }
    });
    sc.proc.on('error', (e) => {
      if (gen !== sidecarGen || shuttingDown) return;
      log(`sidecar spawn error: ${e.message}`);
    });
    return sc;
  }

  // ── ENROLL ──
  const myAddrs = await bootSidecar().addrs;
  log(`dialable addrs: ${myAddrs.length ? myAddrs.join(' ') : 'NONE (NAT without relays? set C0MPUTE_SHARD_RELAYS)'}`);
  const { measured, announceCap } = await buildCapabilities();
  announceCap.addrs = myAddrs;              // ring peers dial these for their forward legs
  await bindIdentity(opts, measured);

  const socket: Socket = io(opts.orchestratorUrl, {
    auth: { token: opts.token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
  });

  // one assignment at a time (the server leases one slot per node — swarm.ts nodeToSwarm)
  let current: {
    assignment: StageAssignment;
    stage: StageProcess;
    restarts: number;
    abort: AbortController;                 // kills an in-flight pull when the assignment dies
    retryTimer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  function teardown(reason: string): void {
    if (!current) return;
    log(`leaving swarm ${current.assignment.swarmId}: ${reason} (ranges stay on disk for the warm re-join)`);
    if (current.retryTimer) clearTimeout(current.retryTimer);
    current.abort.abort();
    current.stage.stop();
    current = null;
    bootSidecar();                          // drop the ring legs, back to the standby listener
  }

  /** Local teardown + recycle the socket. The server frees a node's swarm lease ONLY in
   *  onNodeGone (there is no leave event), so a teardown the server didn't see would bench
   *  this node forever and wedge its swarm in `pulling` — the reconnect makes it see one. */
  function release(reason: string): void {
    teardown(reason);
    log('recycling the control-plane connection so the server frees our slot');
    socket.disconnect();
    socket.connect();
  }

  function launchStage(): void {
    if (!current) return;
    const a = current.assignment;
    const stage = new StageProcess();
    current.stage = stage;
    stage.onReady = (info) => {
      log(`stage ${a.stageIndex} READY (layers [${info.lo}:${info.hi}), port ${info.port}) -> swarm:ready`);
      socket.emit('swarm:ready', { swarmId: a.swarmId });
    };
    stage.onExit = (code, fatal) => {
      if (current?.assignment.swarmId !== a.swarmId) return;   // a stale process's death is not ours
      // SELF-HEAL: a crashed stage restarts with backoff; budget exhausted = leave the swarm
      // (LAUNCH.md P0-#6 — nobody babysits home nodes).
      current.restarts += 1;
      if (current.restarts > MAX_STAGE_RESTARTS) {
        release(`stage kept dying (${MAX_STAGE_RESTARTS} restarts; last: ${fatal || `exit ${code}`})`);
        return;
      }
      const delay = 2000 * 2 ** (current.restarts - 1);
      log(`stage exited (${fatal || `code ${code}`}) — restart ${current.restarts}/${MAX_STAGE_RESTARTS} in ${delay / 1000}s`);
      current.retryTimer = setTimeout(() => {
        if (current?.assignment.swarmId === a.swarmId) launchStage();
      }, delay);
    };
    stage.start({
      stageIndex: a.stageIndex,
      nstages: a.peers.length,
      lo: a.layerStart,
      hi: a.layerEnd,
      isTail: a.isTail,
    });
  }

  async function serve(a: StageAssignment): Promise<void> {
    log(`assigned: swarm ${a.swarmId} stage ${a.stageIndex}/${a.peers.length} layers [${a.layerStart}:${a.layerEnd}) `
      + `${a.isHead ? 'HEAD ' : ''}${a.isTail ? 'TAIL ' : ''}(${a.model} @ ${a.manifestRef})`);
    // ring legs: a non-tail stage dials its successor's sidecar (the forward tunnel the engine's
    // --next rides); inbound is pinned to the predecessor's PeerId (the C2 neighbour allowlist —
    // the head stays open for the coordinator return channel, leg 8).
    const forwards: string[] = [];
    const allow: string[] = [];
    if (!a.isTail) {
      const successor = a.peers.find((p) => p.stageIndex === a.stageIndex + 1);
      const dial = pickDialAddrs(successor?.addrs ?? []);
      if (!dial.length) {
        release(`non-tail stage ${a.stageIndex}: successor ${successor?.nodeId ?? '?'} announced no dialable addrs`);
        return;
      }
      forwards.push(`127.0.0.1:${FORWARD_PORT}=${dial[0]}`);
    }
    const predPid = a.peers.find((p) => p.stageIndex === a.stageIndex - 1)
      ?.addrs?.[0]?.split('/p2p/').pop();
    if (predPid) allow.push(predPid);
    const mine = current!;
    try {
      // ring legs FIRST (the sidecar doesn't need the weights): every stage's sidecar is
      // settled minutes before any peer's engine dials in — assign-time restarts never race
      bootSidecar({ forwards, allow });     // same key + ports: the addrs peers hold stay valid
      // peers-first fetch: the OTHER stages' sidecars are the DHT bootstrap for the torrent path
      const bootstrap = a.peers
        .filter((p) => p.stageIndex !== a.stageIndex)
        .flatMap((p) => pickDialAddrs(p.addrs).slice(0, 1));
      log(`pulling layers [${a.layerStart}:${a.layerEnd}) (peers-first: ${bootstrap.length} ringmate seed(s)) ...`);
      await pullRange(a.layerStart, a.layerEnd, a.isHead, a.isTail,
        { bootstrap, role: a.role === 'coordinator' ? 'coordinator' : 'stage' }, mine.abort.signal);
      // dissolved (or re-assigned) while pulling — the new assignment owns the slot
      if (current !== mine) return;
      launchStage();
    } catch (err: any) {
      if (current === mine) release(`serve failed: ${err.message}`);
      else log(`stale serve for ${a.swarmId} ended (${err.message})`);
    }
  }

  socket.on('connect', () => {
    log(`connected to ${opts.orchestratorUrl} — announcing`);
    socket.emit('node:announce', { cap: announceCap, model: MODEL, manifestRef: MANIFEST_REF },
      (res: { ok?: boolean; reason?: string; error?: string }) => {
        if (res?.ok) log('announced: in the candidate pool (STANDBY — placement grabs us from here)');
        else log(`announce refused: ${res?.reason || res?.error || 'unknown'}`);
      });
  });

  socket.on('disconnect', () => {
    // the server frees our slots on disconnect (swarm-loop onNodeGone); mirror it locally
    teardown('control-plane disconnected');
    log('disconnected — reconnecting (the ranges on disk make the re-join warm)');
  });

  socket.on('connect_error', (err: Error) => log(`connect error: ${err.message}`));

  socket.on('swarm:assign', (a: StageAssignment) => {
    if (current) {
      if (current.assignment.swarmId === a.swarmId) {
        log(`duplicate assign for ${a.swarmId} — already on it`);
        return;
      }
      // the server only assigns nodes it considers free — a new assign IS the dissolution
      // notice for the old swarm (peer churn re-form; there is no explicit dissolve event)
      teardown(`preempted by assignment for ${a.swarmId}`);
    }
    current = {
      assignment: a, stage: new StageProcess(), restarts: 0,
      abort: new AbortController(), retryTimer: null,
    };
    void serve(a);
  });

  socket.on('swarm:challenge', (c: { checkId: string }) => {
    // TODO(leg7): produce the BlockSketch via the engine (the judging side — shard.challenge —
    // is server-side; the node-side sketch run over our layer range isn't CLI'd yet) and reply
    // with swarm:challenge_result {checkId, sketch}. Until then a challenge times out server-side.
    log(`spot-check ${c.checkId} received — sketch production not wired yet (leg7 TODO)`);
  });

  const shutdown = (): void => {
    log('shutting down');
    shuttingDown = true;
    teardown('operator shutdown');
    sidecar?.proc.kill('SIGTERM');
    socket.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('daemon up: ENROLL done, entering STANDBY');
}
