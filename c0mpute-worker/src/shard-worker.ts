/**
 * Shard worker runtime — a c0mpute worker that serves ONE pipeline stage of a big model
 * split across a ring of GPUs. The live counterpart to shard-mode.ts's pure command
 * builders: it queries the box's VRAM + libp2p PeerId, registers as a 'shard' worker, and
 * on each `job:ring_assign` spawns the sidecar tunnel + a specpipe stage (and, for the
 * head, the coordinator that drives generation, streams tokens, forwards receipts).
 *
 * This is the integration layer — proven end-to-end on the fleet smoke, not unit tests
 * (it spawns real processes). The argv it spawns comes entirely from the tested builders.
 */
import { io, Socket } from 'socket.io-client';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { DEFAULT_ORCHESTRATOR_URL } from './config.js';
import {
  buildSidecarArgs, buildStageArgs, buildCoordinatorArgs, shardEngineEnv,
  SHARD_PORTS, type RingAssignment, type ShardPaths,
} from './shard-mode.js';

interface ShardWorkerOptions {
  token: string;
  orchestratorUrl?: string;
}

// Resolve the shard toolchain paths from env (set on the box), with sane defaults that
// match the fleet layout (/root). The sidecar binary + specpipe.py are pushed to the box.
function resolvePaths(): ShardPaths {
  return {
    sidecar: process.env.SHARD_SIDECAR || '/root/sidecar',
    specpipe: process.env.SHARD_SPECPIPE || '/root/specpipe.py',
    python: process.env.SHARD_PYTHON || 'python3',
    nodeKey: process.env.SHARD_NODE_KEY || '/root/node.key',
    workdir: process.env.SHARD_WORKDIR || '/root',
  };
}

/** Total GPU VRAM in GB (sum across GPUs), via nvidia-smi. 0 if unavailable. */
function queryVramGb(): number {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader', { timeout: 10000 }).toString();
    let mib = 0;
    for (const ln of out.split('\n')) {
      const v = parseFloat(ln.trim().split(/\s+/)[0]);
      if (Number.isFinite(v)) mib += v;
    }
    return Math.round((mib / 1024) * 10) / 10;
  } catch {
    return 0;
  }
}

/** The node's libp2p PeerId (stable, from the persisted key) via `sidecar -prove`. */
function queryPeerId(paths: ShardPaths): string {
  const out = execSync(`${paths.sidecar} -key ${paths.nodeKey} -prove ping`, { timeout: 30000 }).toString();
  for (const ln of out.split('\n')) {
    if (ln.startsWith('PEERID ')) return ln.split(/\s+/)[1];
  }
  throw new Error('sidecar did not return a PeerId');
}

/** This box's public ip:port for the libp2p listen port, for the dialable multiaddr. */
function publicEndpoint(): { ip: string; port: number } {
  // On Vast the container's public addr + mapped port come from env; default to the
  // listen port and a best-effort public IP. Operators set SHARD_PUBLIC_IP/PORT.
  const ip = process.env.SHARD_PUBLIC_IP || process.env.PUBLIC_IPADDR || '127.0.0.1';
  const port = Number(process.env.SHARD_PUBLIC_PORT || SHARD_PORTS.LIBP2P);
  return { ip, port };
}

export async function startShardWorker(options: ShardWorkerOptions): Promise<void> {
  const url = options.orchestratorUrl || DEFAULT_ORCHESTRATOR_URL;
  const paths = resolvePaths();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

  // Preflight: the shard toolchain must be present, or this worker can't serve a stage.
  if (!existsSync(paths.sidecar)) throw new Error(`sidecar not found at ${paths.sidecar} (set SHARD_SIDECAR)`);
  if (!existsSync(paths.specpipe)) throw new Error(`specpipe.py not found at ${paths.specpipe} (set SHARD_SPECPIPE)`);

  const vramGb = queryVramGb();
  if (vramGb <= 0) throw new Error('could not read GPU VRAM (nvidia-smi)');
  const peerId = queryPeerId(paths);
  const { ip, port } = publicEndpoint();
  const multiaddr = `/ip4/${ip}/tcp/${port}/p2p/${peerId}`;
  const announce = `/ip4/${ip}/tcp/${port}`;
  log(`Shard worker: ${vramGb}GB VRAM, peer ${peerId.slice(0, 16)}.., addr ${multiaddr}`);

  const model = process.env.SHARD_MODEL_NAME || 'GLM-5.2';

  const socket: Socket = io(url, {
    auth: { token: options.token }, transports: ['websocket'],
    reconnection: true, reconnectionDelay: 2000, reconnectionAttempts: Infinity,
  });

  // Per-job process handles so a teardown kills exactly this ring's procs.
  const procs = new Map<string, ChildProcess[]>();

  function killJob(jobId: string) {
    for (const p of procs.get(jobId) || []) {
      try { p.kill('SIGKILL'); } catch { /* already gone */ }
    }
    procs.delete(jobId);
    // free the engine + libp2p ports for the next ring (never pkill -f: self-match footgun)
    for (const portN of [SHARD_PORTS.ENG_IN, SHARD_PORTS.LIBP2P]) {
      try { execSync(`fuser -k ${portN}/tcp 2>/dev/null`); } catch { /* noop */ }
    }
  }

  socket.on('connect', () => {
    log('Connected to orchestrator');
    socket.emit('worker:register', {
      model, authToken: options.token, type: 'shard',
      tokPerSec: 0, capabilities: {}, vramGb, peerId, multiaddr,
    } as any, (res: { workerId: string } | { error: string }) => {
      if ('error' in res) { log(`Registration failed: ${res.error}`); process.exit(2); }
      log(`Registered as shard worker ${res.workerId} (model ${model})`);
    });
  });

  socket.on('disconnect', (r) => log(`Disconnected: ${r}`));
  socket.on('connect_error', (e) => log(`Connection error: ${e.message}`));

  // The core: spawn this stage's sidecar + engine (+ coordinator if head).
  socket.on('job:ring_assign', (a: RingAssignment) => {
    log(`Ring ${a.jobId}: stage ${a.stage}/${a.nstages} layers [${a.lo}:${a.hi}]${a.isCoordinator ? ' (coordinator)' : ''}`);
    killJob(a.jobId); // clean any stale procs/ports first
    const jobProcs: ChildProcess[] = [];
    const env = shardEngineEnv();
    try {
      // 1) sidecar tunnel (TCP<->libp2p), wired to this stage's neighbours
      const sidecarArgs = buildSidecarArgs(a, paths, announce);
      const sidecar = spawn(paths.sidecar, sidecarArgs, { cwd: paths.workdir, env, stdio: 'inherit' });
      jobProcs.push(sidecar);

      // 2) the specpipe stage holding layers [lo,hi)
      const stageArgs = buildStageArgs(a, paths);
      const stage = spawn(paths.python, stageArgs, { cwd: paths.workdir, env, stdio: 'inherit' });
      jobProcs.push(stage);
      stage.on('exit', (code) => {
        if (code && code !== 0) {
          socket.emit('job:ring_failed', { jobId: a.jobId, stage: a.stage, error: `stage exited ${code}` });
        }
      });

      // 3) head also runs the coordinator that drives generation
      if (a.isCoordinator) {
        // small delay so neighbour sidecars/stages are listening before the coordinator
        // dials them (mirrors launch_libp2p.py's tail-first ordering).
        setTimeout(() => {
          // The coordinator writes its output + verified receipts to FILES (--dump /
          // --receipts-out), which is far more reliable than scraping stdout. We read
          // them on exit. Tokens still stream from stdout for live UX.
          const dumpPath = `${paths.workdir}/ring-${a.jobId}.json`;
          const receiptsPath = `${paths.workdir}/ring-${a.jobId}.receipts.json`;
          const coordArgs = [...buildCoordinatorArgs(a, paths),
            '--dump', dumpPath, '--receipts-out', receiptsPath];
          const coord = spawn(paths.python, coordArgs, { cwd: paths.workdir, env, stdio: ['ignore', 'pipe', 'inherit'] });
          jobProcs.push(coord);
          coord.stdout?.on('data', (b) => {
            // forward streamed tokens for live UX (best-effort)
            socket.emit('job:token', { jobId: a.jobId, token: b.toString() });
          });
          coord.on('exit', (code) => {
            if (code === 0) {
              const { response, receipts } = readResult(dumpPath, receiptsPath);
              socket.emit('job:complete', { jobId: a.jobId, response, tokensGenerated: 0, receipts });
            } else {
              socket.emit('job:ring_failed', { jobId: a.jobId, stage: a.stage, error: `coordinator exited ${code}` });
            }
            killJob(a.jobId);
          });
        }, 3000);
      }

      procs.set(a.jobId, jobProcs);
      socket.emit('job:ring_ready', { jobId: a.jobId, stage: a.stage });
    } catch (err) {
      log(`Ring ${a.jobId} stage ${a.stage} launch error: ${(err as Error).message}`);
      for (const p of jobProcs) { try { p.kill('SIGKILL'); } catch { /* noop */ } }
      socket.emit('job:ring_failed', { jobId: a.jobId, stage: a.stage, error: (err as Error).message });
    }
  });

  socket.on('job:ring_teardown', (d: { jobId: string }) => {
    log(`Ring ${d.jobId}: teardown`);
    killJob(d.jobId);
  });

  async function shutdown() {
    log('Shutting down...');
    for (const jobId of [...procs.keys()]) killJob(jobId);
    socket.emit('worker:unregister');
    socket.disconnect();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Read the coordinator's result from the files it wrote: --dump {prompt,output_ids,
// text/tok_s} and --receipts-out {ok, receipts:[...]}. Fail closed on receipts: if the
// file is missing/garbled, return [] so handleJobComplete treats the ring as unverifiable
// and pays nobody (better than paying on an unproven run).
function readResult(dumpPath: string, receiptsPath: string): { response: string; receipts: Record<string, unknown>[] } {
  let response = '';
  let receipts: Record<string, unknown>[] = [];
  try {
    const d = JSON.parse(readFileSync(dumpPath, 'utf-8'));
    response = typeof d.text === 'string' ? d.text : (typeof d.response === 'string' ? d.response : '');
  } catch { /* no dump → empty response */ }
  try {
    const r = JSON.parse(readFileSync(receiptsPath, 'utf-8'));
    if (r && r.ok && Array.isArray(r.receipts)) receipts = r.receipts;
  } catch { /* no receipts → fail closed (unpaid) */ }
  return { response, receipts };
}
