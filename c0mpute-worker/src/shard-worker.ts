// Shard mode — the long-lived node daemon (c0mpute NODE_DAEMON.md): the gateway between a
// stranger's machine and the network. Lifecycle: ENROLL (bind identity, self-measure, announce)
// -> STANDBY (stay announced, wait) -> SERVE (on swarm:assign: pull the layer range, launch
// `python -m shard.stage` + the sidecar, report ready, self-heal) -> back to STANDBY.
//
// The control plane is the same socket.io connection the other modes use (cwt_ token auth);
// the server-side handlers live in lib/orchestrator/swarm-loop.ts. Role is NEVER self-reported:
// the HTTP node-bind step submits the measured vector and the server decides (#19 semantics).

import { io, Socket } from 'socket.io-client';
import { existsSync } from 'fs';
import { hostname } from 'os';
import {
  proveIdentity, receiptPubkey, detectGpuName, detectFreeVramMB, probeMeasure,
  pullRange, startSidecar, pickDialAddrs, answerChallenge, StageProcess, CoordinatorProcess,
  FORWARD_PORT, RETURN_PORT, MANIFEST_DEV_FILE, MANIFEST_FILE, MANIFEST_REF, MODEL_DIR,
  MODEL_REPO, SHARD_REPO,
  type SidecarHandle, type CoordJob,
} from './shard-runner.js';
import { ensureShardSetup, resolveManifest, resolveRelays } from './shard-setup.js';

const MODEL = process.env.C0MPUTE_SHARD_MODEL || 'minimax-m2.5';
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
  /** standby seeders' sidecar addrs (free candidates + operator seed boxes) — extra block
   *  sources beyond the ringmates; unverified, safe (every byte re-hashed vs the manifest) */
  seeders?: string[];
  /** per-swarm C2 engine-auth token (orchestrator-minted, shared by every ring member) */
  swarmToken?: string;
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

  // ── ENROLL step 0: self-provision (engine, venv, sidecar, network manifest, probe slice —
  // zero env vars) ──
  await ensureShardSetup({ orchestratorUrl: opts.orchestratorUrl });
  // P0-#3: the network's public circuit relays, resolved once per daemon run (a NAT'd box needs
  // them from the FIRST sidecar boot — its announced addrs must include the circuit addrs)
  const relays = await resolveRelays(opts.orchestratorUrl);

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
    // STANDBY SEEDING (P0-#1): every sidecar boot seeds whatever complete manifest shards this
    // disk already holds — enroll (a warm node's prior ranges), assign (seed while pulling/serving),
    // teardown-restore (the Go seeder scans holdings ONCE at boot, so this restore is exactly the
    // moment the just-served range enters the seed set). Harmless with nothing on disk.
    const seed = existsSync(MANIFEST_FILE) ? `${MANIFEST_FILE}=${MODEL_DIR}` : undefined;
    const sc = startSidecar({ ...cfg, seed, relays });
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
    coord: CoordinatorProcess | null;       // HEAD only: the serving half (leg 8)
    coordDegraded: boolean;                 // P11: relaunch the coordinator EAGLE-off after a stall-kill
    jobs: Map<string, { swarmId: string; nonce: string }>;  // in-flight swarm:job bookkeeping
  } | null = null;

  function teardown(reason: string): void {
    if (!current) return;
    log(`leaving swarm ${current.assignment.swarmId}: ${reason} (ranges stay on disk for the warm re-join)`);
    if (current.retryTimer) clearTimeout(current.retryTimer);
    current.abort.abort();
    current.coord?.stop();
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

  /** Fail-closed job finish: the server has no job-error event, so a failed job completes
   *  with zero tokens and no receipts — the client stream ends (no 300s hang) and settlement
   *  fails closed (nothing to pay). */
  function failJob(swarmId: string, jobId: string, nonce: string, error: string): void {
    log(`job ${jobId} failed: ${error} — completing fail-closed`);
    socket.emit('swarm:job_complete', {
      swarmId, jobId, nonce, tokensGenerated: 0, response: '', receipts: [],
    });
  }

  /** HEAD only: the long-lived `python -m shard.coordinate` beside the head stage (leg 8's
   *  serving half). Started on stage READY; its death fails in-flight jobs closed and
   *  restarts with the stage's own restart budget (a dead coordinator = an unservable swarm). */
  function launchCoordinator(): void {
    if (!current || !current.assignment.isHead) return;
    const a = current.assignment;
    current.coord?.stop();
    const coord = new CoordinatorProcess();
    current.coord = coord;
    coord.onReady = () => log('coordinator READY (head-engine pipe + tail return tunnel up) — swarm can serve');
    coord.onToken = (jobId, delta) => socket.emit('swarm:job_token', { jobId, delta });
    coord.onDone = (done) => {
      const j = current?.jobs.get(done.jobId);
      if (!j) { log(`job ${done.jobId} completed but is not tracked — dropping`); return; }
      current!.jobs.delete(done.jobId);
      if (!done.ok) { failJob(j.swarmId, done.jobId, j.nonce, done.error || 'job failed'); return; }
      log(`job ${done.jobId} DONE (${done.tokensGenerated} tokens, ${done.receipts?.length ?? 0} receipts) -> swarm:job_complete`);
      socket.emit('swarm:job_complete', {
        swarmId: j.swarmId, jobId: done.jobId, nonce: j.nonce,
        tokensGenerated: done.tokensGenerated, response: done.response,
        receipts: done.receipts ?? [],
      });
    };
    coord.onJobError = (jobId, error) => {
      const j = jobId ? current?.jobs.get(jobId) : undefined;
      if (jobId && j) { current!.jobs.delete(jobId); failJob(j.swarmId, jobId, j.nonce, error); }
      else log(`coordinator error (no job): ${error}`);
    };
    coord.onExit = (code, fatal) => {
      if (current?.assignment.swarmId !== a.swarmId || current.coord !== coord) return;
      for (const [jobId, j] of current.jobs) failJob(j.swarmId, jobId, j.nonce, 'coordinator died mid-job');
      current.jobs.clear();
      current.restarts += 1;
      // P11 restart-degraded: a stall-watchdog kill (P0-#5 L3) is an EAGLE-implicated wedge — the
      // relaunch must drop the speculative levers or it walks straight back into the same stall.
      // Belt-and-braces: any 2nd+ coordinator death also degrades (a coordinator that keeps dying
      // is better slow-but-serving than fast-but-dead). Sticky for the swarm session.
      if (!current.coordDegraded
          && (/stall-watchdog/.test(fatal ?? '') || current.restarts >= 2)) {
        current.coordDegraded = true;
        log('coordinator: relaunching EAGLE-off (degraded) after a stall/repeat death — plain ring, reliable serve');
      }
      if (current.restarts > MAX_STAGE_RESTARTS) {
        release(`coordinator kept dying (last: ${fatal || `exit ${code}`})`);
        return;
      }
      const delay = 2000 * 2 ** (current.restarts - 1);
      log(`coordinator exited (${fatal || `code ${code}`}) — restart in ${delay / 1000}s`
        + (current.coordDegraded ? ' (EAGLE-off)' : ''));
      current.retryTimer = setTimeout(() => {
        if (current?.assignment.swarmId === a.swarmId) launchCoordinator();
      }, delay);
    };
    coord.start({ degraded: current.coordDegraded, swarmToken: a.swarmToken });
  }

  function launchStage(): void {
    if (!current) return;
    const a = current.assignment;
    const stage = new StageProcess();
    current.stage = stage;
    stage.onReady = (info) => {
      log(`stage ${a.stageIndex} READY (layers [${info.lo}:${info.hi}), port ${info.port}) -> swarm:ready`);
      socket.emit('swarm:ready', { swarmId: a.swarmId });
      // the serving half rides the head: coordinator up only once the local engine listens
      // (its pipe socket dials the head stage loopback; a stage restart re-runs this)
      if (a.isHead) launchCoordinator();
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
      swarmToken: a.swarmToken,          // ring-wide C2 engine-auth (closes the head allow-all hole)
    });
  }

  async function serve(a: StageAssignment): Promise<void> {
    log(`assigned: swarm ${a.swarmId} stage ${a.stageIndex}/${a.peers.length} layers [${a.layerStart}:${a.layerEnd}) `
      + `${a.isHead ? 'HEAD ' : ''}${a.isTail ? 'TAIL ' : ''}(${a.model} @ ${a.manifestRef})`);
    // a real network ref must never be satisfied by the local dev-manifest hatch — the hatch is
    // for offline harnesses only, and refusing here keeps a leaked env inert against production
    if (a.manifestRef.startsWith('mf1:') && MANIFEST_DEV_FILE) {
      release('assignment carries a network manifest ref but C0MPUTE_SHARD_MANIFEST_FILE forces a dev manifest — refusing');
      return;
    }
    // re-resolve against the ASSIGNMENT's ref (idempotent; offline-tolerant). The engine still
    // pins bytes==CID + publisher on the pull — this just refreshes the doc the pull reads.
    try {
      await resolveManifest(opts.orchestratorUrl, a.manifestRef);
    } catch (e: any) {
      release(`manifest resolution failed: ${e.message}`);
      return;
    }
    // ring legs: a non-tail stage dials its successor's sidecar (the forward tunnel the engine's
    // --next rides); inbound is pinned to the predecessor's PeerId (the C2 neighbour allowlist).
    // Leg 8 closes the loop (the m25_scatter_pipe layout, proven on real rings): the HEAD also
    // -forwards a local return port to the TAIL's sidecar (the coordinator dials it loopback and
    // its hello_return classifies the stream tail-side), and the TAIL additionally allows the
    // head's PeerId so that return dial lands.
    const forwards: string[] = [];
    const allow: string[] = [];
    const peerPid = (p?: StagePeer) => p?.addrs?.[0]?.split('/p2p/').pop();
    if (!a.isTail) {
      const successor = a.peers.find((p) => p.stageIndex === a.stageIndex + 1);
      const dial = pickDialAddrs(successor?.addrs ?? []);
      if (!dial.length) {
        release(`non-tail stage ${a.stageIndex}: successor ${successor?.nodeId ?? '?'} announced no dialable addrs`);
        return;
      }
      forwards.push(`127.0.0.1:${FORWARD_PORT}=${dial[0]}`);
    }
    if (a.isHead) {
      const tail = a.peers.find((p) => p.stageIndex === a.peers.length - 1);
      const dial = pickDialAddrs(tail?.addrs ?? []);
      if (!dial.length) {
        release(`head: tail ${tail?.nodeId ?? '?'} announced no dialable addrs (no return leg)`);
        return;
      }
      forwards.push(`127.0.0.1:${RETURN_PORT}=${dial[0]}`);
    }
    const predPid = peerPid(a.peers.find((p) => p.stageIndex === a.stageIndex - 1));
    if (predPid) allow.push(predPid);
    if (a.isTail) {
      const headPid = peerPid(a.peers.find((p) => p.stageIndex === 0));
      if (headPid && !allow.includes(headPid)) allow.push(headPid);
    }
    const mine = current!;
    try {
      // ring legs FIRST (the sidecar doesn't need the weights): every stage's sidecar is
      // settled minutes before any peer's engine dials in — assign-time restarts never race
      bootSidecar({ forwards, allow });     // same key + ports: the addrs peers hold stay valid
      // peers-first fetch: ringmate sidecars + the assignment's standby seeders are the block
      // sources (the fetcher direct-dials each — no DHT-health dependency); mirror = fallback
      const ringmates = a.peers
        .filter((p) => p.stageIndex !== a.stageIndex)
        .flatMap((p) => pickDialAddrs(p.addrs).slice(0, 1));
      const seeders = (a.seeders ?? []).filter((s) => !ringmates.includes(s));
      const bootstrap = [...ringmates, ...seeders].slice(0, 10);
      log(`pulling layers [${a.layerStart}:${a.layerEnd}) (peers-first: ${ringmates.length} ringmate(s) `
        + `+ ${seeders.length} standby seeder(s)) ...`);
      await pullRange(a.layerStart, a.layerEnd, a.isHead, a.isTail,
        {
          bootstrap, role: a.role === 'coordinator' ? 'coordinator' : 'stage',
          manifestRef: a.manifestRef, expectModelId: MODEL_REPO,
          // what the ASSIGNMENT believes the model's depth is — the manifest must agree
          expectLayerCount: Math.max(...a.peers.map((p) => p.layerEnd)),
        }, mine.abort.signal);
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
      coord: null, coordDegraded: false, jobs: new Map(),
    };
    void serve(a);
  });

  // leg 8, the serving half: the server dispatches a job to the swarm's coordinator (us,
  // iff head). Stream deltas ride swarm:job_token; ONE swarm:job_complete finishes the
  // client stream AND settles (nonce echoed for settlement freshness).
  socket.on('swarm:job', (job: {
    swarmId: string; jobId: string; nonce: string; messages: unknown[];
    maxNew?: number; reasoning?: boolean; tools?: unknown[];
  }) => {
    if (!current || current.assignment.swarmId !== job.swarmId || !current.assignment.isHead) {
      log(`swarm:job ${job.jobId} refused: not the serving head of ${job.swarmId}`);
      failJob(job.swarmId, job.jobId, job.nonce, 'not the serving head');
      return;
    }
    if (!current.coord) {
      failJob(job.swarmId, job.jobId, job.nonce, 'coordinator not running');
      return;
    }
    log(`swarm:job ${job.jobId} accepted (${job.maxNew ?? 512} max tokens)`);
    current.jobs.set(job.jobId, { swarmId: job.swarmId, nonce: job.nonce });
    try {
      current.coord.submit({
        jobId: job.jobId, swarmId: job.swarmId, nonce: job.nonce, messages: job.messages,
        maxNew: job.maxNew, reasoning: job.reasoning, tools: job.tools,
      });
    } catch (err: any) {
      current.jobs.delete(job.jobId);
      failJob(job.swarmId, job.jobId, job.nonce, `submit failed: ${err.message}`);
    }
  });

  // P0-#1 spot-checks: produce the BlockSketch via the engine's loopback probe door. An honest
  // node ALWAYS replies (sketch or structured error) — silence is scored as a cheat server-side.
  socket.on('swarm:challenge', (c: {
    checkId: string; layerStart: number; layerEnd: number;
    seed: string; projSeed?: string; nTokens: number; deadlineAt?: number;
  }) => {
    const respond = (r: { sketch?: unknown; error?: string }) =>
      socket.emit('swarm:challenge_result', { checkId: c.checkId, ...r });
    const a = current?.assignment;
    if (!a || a.layerStart !== c.layerStart || a.layerEnd !== c.layerEnd) {
      log(`spot-check ${c.checkId} refused: not serving layers [${c.layerStart}:${c.layerEnd})`);
      respond({ error: 'range_mismatch' });
      return;
    }
    if (!c.projSeed) {                      // an old orchestrator's check has no commit-first
      log(`spot-check ${c.checkId} refused: no projSeed (orchestrator too old)`);   // projection
      respond({ error: 'no_proj_seed' });   // seed — the engine door requires it, refuse loudly
      return;
    }
    const deadline = c.deadlineAt ?? Date.now() + 120_000;
    log(`spot-check ${c.checkId}: probing local stage layers [${c.layerStart}:${c.layerEnd})`);
    void answerChallenge({
      token: current!.stage.probeToken, proj_seed: c.projSeed, n_tokens: c.nTokens,
      lo: c.layerStart, hi: c.layerEnd, seed: c.seed,
    }, deadline).then((r) => {
      if (r.ok && r.sketch) {
        log(`spot-check ${c.checkId}: sketch produced (${r.t_ms?.toFixed(1)}ms)`);
        respond({ sketch: r.sketch });
      } else {
        log(`spot-check ${c.checkId}: ${r.error}`);
        respond({ error: r.error ?? 'probe failed' });
      }
    });
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
