/**
 * shard-daemon-sim — a LOCAL orchestrator for testing the `--mode shard` node daemon end-to-end
 * with zero cloud: the REAL identity binding (verifyBindingProof), the REAL server-driven role
 * decision (decideRole -> `python3 -m shard.probe`), and the REAL swarm control plane
 * (attachSwarmLoop / SwarmManager event wiring) — only PLACEMENT is stubbed (SimSeam.plan forms
 * one ring over whatever announced, so a GPU-less box the real planner would rightly refuse can
 * still exercise the whole lifecycle). Settlement + challenge judging stay on the real seams.
 *
 * Run (repo root):        npx tsx scripts/shard-daemon-sim.ts [--port 3777] [--once]
 * Then point the daemon:  c0mpute-worker --mode shard --token cwt_sim --url http://127.0.0.1:3777
 * On a box without GPU/weights, shim the heavy calls:
 *                         C0MPUTE_SHARD_PYTHON=$PWD/scripts/shard-python-shim.py
 *
 * SHARD_REPO / SHARD_REPO_PATH locate the shard checkout (probe + settlement seams).
 * --once exits 0 when a swarm reaches READY (harness-able), else keeps serving.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import type { Seam } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch } from '../lib/orchestrator/swarm-types';
import { SubprocessSeam } from '../lib/orchestrator/swarm-seam';
import { verifyBindingProof } from '../lib/identity';
import { decideRole } from '../lib/shard-admission';

const PORT = Number(process.argv[process.argv.indexOf('--port') + 1] || 0) || 3777;
const ONCE = process.argv.includes('--once');
// --serve: once the swarm is READY, dispatch a real serveRequest through the daemon's coordinator
// (leg 8 node half: swarm:job -> SHARD_JOB_TOKEN stream -> swarm:job_complete -> settle).
const SERVE = process.argv.includes('--serve');
// --accept-receipts: SIMULATED settlement verify — receipts are NOT checked; the verdict is
// synthesized from the job's own assignments map so paySplit/earnings wiring can be exercised
// GPU-less (the shim coordinator has no stages to sign real receipts). The REAL receipts path
// is proven on-engine (shard tests + live rings); never use this flag outside the sim.
const ACCEPT = process.argv.includes('--accept-receipts');
// layers assigned per node: small + TAIL-anchored so a real single GPU (e.g. a 24 GB card)
// actually loads its range and READYs for real — 62-layer full stacks are for real rings
const LAYERS = Math.min(62, Math.max(1,
  Number(process.argv[process.argv.indexOf('--layers') + 1] || 0) || 3));
// wait for this many announced nodes before forming (multi-daemon ring tests)
const NODES = Math.max(1, Number(process.argv[process.argv.indexOf('--nodes') + 1] || 0) || 1);

function log(msg: string): void {
  console.log(`[sim] ${msg}`);
}

/** The real seams for settle/challenge; plan stubbed to "one ring over everyone who announced,
 *  layers split evenly" — placement physics is proven elsewhere (fleet-multiswarm receipts),
 *  this harness is about the daemon<->control-plane protocol. */
class SimSeam implements Seam {
  private real = new SubprocessSeam();

  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    const n = r.nodes.length;
    const L = r.model.n_layers;
    // consecutive LAYERS-sized blocks ENDING at the model tail, so every stage's pull is a
    // few real shards (+ lm_head on the tail) instead of an unservable 62-layer stack
    const stages = r.nodes.map((node, i) => ({
      id: node.id, index: i,
      lo: L - (n - i) * LAYERS, hi: L - (n - i - 1) * LAYERS,
      head: i === 0, tail: i === n - 1,
      layers: LAYERS,
    }));
    if (stages[0].lo < 0) { log(`SimSeam.plan: ${n} nodes × ${LAYERS} layers exceeds ${L} — lower --layers`); return null; }
    log(`SimSeam.plan: ${n} node(s) -> ${stages.map((s) => `[${s.lo}:${s.hi})`).join(' ')}`);
    return {
      order: stages.map((s) => s.id), head: stages[0].id, stages,
      dropped: [], step_ms: 100, tok_s_per_g: 10, k: n,
    };
  }

  verify(req: unknown): Promise<SettleResult> {
    if (ACCEPT) {
      const a = (req as { assignments?: Record<string, [number, number]> }).assignments ?? {};
      const stages = Object.entries(a).map(([pubkey, [lo, hi]]) => ({ pubkey, lo, hi, layers: hi - lo }));
      log(`verify: SIMULATED ACCEPT (--accept-receipts) — receipts NOT checked, ${stages.length} stage(s) credited`);
      return Promise.resolve({ ok: true, stages } as SettleResult);
    }
    return this.real.verify(req);
  }

  challenge(req: { a: BlockSketch; b: BlockSketch; cos_thresh?: number }):
    ReturnType<SubprocessSeam['challenge']> { return this.real.challenge(req); }
}

// ── HTTP: the node-bind route (nonce -> proof -> real verify -> real role decision) ─────────────
const nonces = new Map<string, number>();                    // nonce -> expiry (sim: in-memory)

const http = createServer(async (req, res) => {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.url?.startsWith('/manifests/') && req.method === 'GET') {
    // the static /manifests/<name>.json doc the daemon resolves at enroll/assign. The FIXTURE pin
    // pair: export C0MPUTE_SHARD_MANIFEST_PUBKEY=sim-publisher-pin on the daemon. Engine-side
    // crypto verification is exercised in shard's own suite (test_manifest_resolution.py); the
    // sim proves the daemon RESOLVES + pins + threads the ref through to the pull args.
    log(`manifest doc served (${req.url})`);
    return send(200, SIM_MANIFEST);
  }
  if (req.url?.startsWith('/api/node-bind') && req.method === 'GET') {
    const nonce = randomBytes(16).toString('hex');
    nonces.set(nonce, Date.now() + 5 * 60_000);
    log(`node-bind: nonce issued`);
    return send(200, { nonce });
  }
  if (req.url?.startsWith('/api/node-bind') && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const { peerId, nonce, sig, cap } = JSON.parse(raw);
      if (!nonces.has(nonce) || nonces.get(nonce)! < Date.now()) return send(400, { error: 'bad nonce' });
      nonces.delete(nonce);                                  // single-use, like the real route
      if (!verifyBindingProof(peerId, nonce, sig)) return send(400, { error: 'bad proof' });
      log(`node-bind: PROOF VERIFIED for ${peerId}`);
      let admission: unknown;
      try {
        admission = cap ? await decideRole(cap) : undefined; // the REAL server-driven role probe
        log(`node-bind: admission verdict ${JSON.stringify((admission as { role?: string })?.role)}`);
      } catch (e: any) {
        admission = { error: e.message };                    // binding survives a probe hiccup (real-route semantics)
        log(`node-bind: probe error (${e.message.slice(0, 120)})`);
      }
      return send(200, { bound: true, peerId, account: 'sim-account', admission });
    } catch (e: any) {
      return send(400, { error: e.message });
    }
  }
  send(404, { error: 'not found' });
});

// ── Socket.io: any cwt_ token is the sim account; then the REAL swarm loop ──────────────────────
const io = new Server(http, { transports: ['websocket', 'polling'] });
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('no token'));
  (socket as unknown as { privyUserId: string }).privyUserId = 'sim-account';
  next();
});

// The sim now drives formation through the SERVER's own auto-form (opts.resolveModel) instead of
// calling formSwarm by hand — so this harness tests the real live-server path. minStages = --nodes
// so the ring forms once the expected pool has announced.
// mf1 fixture ref: the CID part is a fixture (the shim's fetch never hashes it); what the sim
// proves is the daemon accepting an mf1 ref, resolving /manifests/, and forwarding --manifest-cid.
const SIM_MANIFEST = {
  schema: 'shard-manifest/1', model_id: 'nvidia/MiniMax-M2.5-NVFP4', version: 1,
  layer_count: 62, weight_map: {}, shards: [],
  publisher_pubkey: 'sim-publisher-pin', signature: 'sim-fixture',
};
const SIM_SPEC = {
  model: 'minimax-m2.5',
  manifestRef: 'mf1:m25-nvfp4-v1@bafkreisimfixturecidnotarealhashbutshapedlikeone0000000000',
  minStages: NODES,
  profile: { layerCount: 62, prefill_bytes: 1.0e8, decode_bytes: 1.6e4, decode_steps: 64 },
};

const earnings: unknown[] = [];
const loop = attachSwarmLoop(io, {
  recordStageEarning: (e) => { earnings.push(e); log(`EARNING recorded: ${JSON.stringify(e)}`); },
  config: {
    admission: { mode: 'open', minFreeVramMb: 0 },           // sim: a 0-VRAM box may exercise the protocol
    paySplit: 'layers', minCandidates: NODES, privacy: null, spotCheckTimeoutMs: 300_000,
  },
  seam: new SimSeam(),
  resolveModel: (m) => (m === 'minimax-m2.5' ? SIM_SPEC : undefined),   // auto-form this model
  autoFormDebounceMs: 900,
  log: (m) => {
    log(`loop: ${m}`);
    if (/ READY — all /.test(m)) {
      log('*** LIFECYCLE COMPLETE — every stage pulled, connected, and reported ready ***');
      if (SERVE) serveOnce(1);
      else if (ONCE) setTimeout(() => { log('(--once) success, exiting 0'); process.exit(0); }, 500);
    }
  },
});

/** Leg-8 node-half proof: one request through the REAL dispatch path — serveRequest ->
 *  swarm:job to the daemon's coordinator -> SHARD_JOB_TOKEN deltas relayed as swarm:job_token
 *  -> swarm:job_complete -> settleJob. The coordinator process may still be probing its return
 *  tunnel when the swarm READYs; jobs queue in its stdin, so one dispatch suffices — retries
 *  cover a coordinator that crashed and is in its restart backoff. */
function serveOnce(attempt: number): void {
  const deltas: string[] = [];
  const r = loop.serveRequest({
    model: 'minimax-m2.5',
    messages: [{ role: 'user', content: 'What is a scattered ring?' }],
    params: { maxNew: 48 },
    timeoutMs: 240_000,
    onToken: (d: string) => deltas.push(d),
    onDone: (response: string, tokens: number) => {
      const joinOk = response === deltas.join('');
      log(`*** SERVED — ${tokens} token(s) in ${deltas.length} delta(s); stream==response: ${joinOk}`);
      // settlement runs AFTER the client stream finishes (the complete handler relays onDone,
      // then awaits settleJob) — poll for the earnings instead of judging synchronously
      const t0 = Date.now();
      const judge = (): void => {
        const settled = !ACCEPT || earnings.length > 0;
        if (settled || Date.now() - t0 > 10_000) {
          log(`settlement credited: ${earnings.length} earning(s)`);
          if (tokens > 0 && joinOk && settled) {
            log('*** LEG-8 NODE HALF COMPLETE — request -> served -> settled ***');
            if (ONCE) setTimeout(() => { log('(--once) success, exiting 0'); process.exit(0); }, 500);
          } else if (ONCE) {
            log(`(--once) FAIL: tokens=${tokens} joinOk=${joinOk} settled=${settled}`);
            process.exit(1);
          }
          return;
        }
        setTimeout(judge, 300);
      };
      judge();
    },
    onError: (m: string) => {
      log(`serve error: ${m}${attempt < 4 ? ' — retrying in 5s' : ''}`);
      if (attempt < 4) setTimeout(() => serveOnce(attempt + 1), 5000);
      else if (ONCE) process.exit(1);
    },
  });
  if (!r) log('serveRequest returned null (no ready swarm?) — waiting for the next READY');
}

io.on('connection', (socket) => {
  log(`node connected: ${socket.id}`);
  socket.on('disconnect', (why) => log(`node disconnected: ${socket.id} (${why})`));
});

http.listen(PORT, () => {
  log(`mock orchestrator up on http://127.0.0.1:${PORT}`);
  log(`point a daemon at it:  c0mpute-worker --mode shard --token cwt_sim --url http://127.0.0.1:${PORT}`);
});
