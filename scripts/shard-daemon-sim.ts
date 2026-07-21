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
import { readFileSync } from 'node:fs';
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
// --p11: the restart-degraded proof (coordinator stall-kill -> daemon relaunches it EAGLE-off).
const P11 = process.argv.includes('--p11');
const SERVE = process.argv.includes('--serve') || process.argv.includes('--churn') || P11;
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
// ring width: plan over the FIRST N announced only, leaving the rest as FREE candidates — the
// standby spares a churn re-form draws from (P0-#6). Default: everyone (the old behavior).
const STAGES = Math.max(1, Number(process.argv[process.argv.indexOf('--stages') + 1] || 0) || NODES);
// --churn (implies --serve): the P0-#6 churn-survival proof. serve request 1 -> print CHURN_NOW
// (the driver SIGKILLs a placed stage daemon) -> the swarm must RE-FORM from the free spare ->
// serve request 2 -> CHURN_PROOF COMPLETE, exit 0. A network that can't re-form times out red.
const CHURN = process.argv.includes('--churn');
// --manifest-file PATH: serve a REAL signed manifest at /manifests/<name>.json (real-ring runs —
// daemons then do the full verified pull against it; pair with the publisher pin env on daemons).
// --relays-file PATH: serve a real relay list at /relays.json (default: the unreachable fixture).
const MANIFEST_FILE_ARG = process.argv.includes('--manifest-file')
  ? process.argv[process.argv.indexOf('--manifest-file') + 1] : null;
const RELAYS_FILE_ARG = process.argv.includes('--relays-file')
  ? process.argv[process.argv.indexOf('--relays-file') + 1] : null;

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
    const n = Math.min(r.nodes.length, STAGES);        // spares beyond STAGES stay free candidates
    const L = r.model.n_layers;
    // consecutive LAYERS-sized blocks ENDING at the model tail, so every stage's pull is a
    // few real shards (+ lm_head on the tail) instead of an unservable 62-layer stack
    const stages = r.nodes.slice(0, n).map((node, i) => ({
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
  if (req.url?.startsWith('/relays.json') && req.method === 'GET') {
    if (RELAYS_FILE_ARG) {
      try { return send(200, JSON.parse(readFileSync(RELAYS_FILE_ARG, 'utf8'))); }
      catch (e: any) { return send(500, { error: e.message }); }
    }
    // P0-#3 auto-discovery: a well-formed (unreachable) fixture relay — the daemon must validate,
    // pass it via -relays, and the real sidecar must survive the failed connect (Printf, not fatal)
    return send(200, { relays: ['/ip4/192.0.2.1/tcp/29600/p2p/12D3KooWQoQPY5dJhdaXbzBFhSqCJoDwPPkQZJEHYYyBXVCbdJNs'] });
  }
  if (req.url?.startsWith('/manifests/') && req.method === 'GET') {
    if (MANIFEST_FILE_ARG) {
      try {
        log(`manifest doc served from ${MANIFEST_FILE_ARG} (${req.url})`);
        return send(200, JSON.parse(readFileSync(MANIFEST_FILE_ARG, 'utf8')));
      } catch (e: any) { return send(500, { error: e.message }); }
    }
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
  minStages: STAGES,        // a ring needs STAGES nodes; spares beyond it are the churn reserve
  profile: { layerCount: 62, prefill_bytes: 1.0e8, decode_bytes: 1.6e4, decode_steps: 64 },
};

const earnings: unknown[] = [];
const loop = attachSwarmLoop(io, {
  recordStageEarning: (e) => { earnings.push(e); log(`EARNING recorded: ${JSON.stringify(e)}`); },
  config: {
    admission: { mode: 'open', minFreeVramMb: 0 },           // sim: a 0-VRAM box may exercise the protocol
    paySplit: 'layers', minCandidates: STAGES, privacy: null, spotCheckTimeoutMs: 300_000,
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
let served = 0;                                       // churn proof: completions across re-forms
let churnTimer: ReturnType<typeof setTimeout> | null = null;
// P11 (restart-degraded): serve #1 -> a STALL request that wedges the coordinator (L3 signature)
// -> the daemon must relaunch the coordinator EAGLE-off and serve #2. The EAGLE-off assertion is
// grepped from the daemon log (two SHIM_COORD_EAGLE lines: true then false) by p11-restart-test.sh.
let p11Phase: 'normal1' | 'stalling' | 'recovering' = 'normal1';
let p11Timer: ReturnType<typeof setTimeout> | null = null;

function serveOnce(attempt: number, opts: { stall?: boolean } = {}): void {
  const deltas: string[] = [];
  const r = loop.serveRequest({
    model: 'minimax-m2.5',
    messages: [{ role: 'user',
      content: opts.stall ? '__P11_STALL__ wedge the coordinator' : 'What is a scattered ring?' }],
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
          // P11: the STALL request finishes fail-closed (0 tokens) once the coordinator wedges +
          // exits — that IS the trigger, not a failure. Advance to the recovery serve.
          if (P11 && p11Phase === 'stalling') {
            p11Phase = 'recovering';
            log('P11_STALL_TRIGGERED (coordinator wedged, fail-closed) — waiting for the EAGLE-off relaunch, then re-serving');
            setTimeout(() => serveOnce(1), 12_000);
            return;
          }
          if (tokens > 0 && joinOk && settled) {
            served += 1;
            if (CHURN && served === 1) {
              // request 1 proven end-to-end — now the survival half: the driver kills a placed
              // stage; the network must re-form from the FREE spare and serve again, on its own
              log('CHURN_NOW — kill a placed stage daemon; expecting re-form + request 2');
              churnTimer = setTimeout(() => {
                log('*** CHURN_PROOF FAILED — no re-formed swarm served within 120s ***');
                process.exit(1);
              }, 120_000);
            } else if (CHURN && served >= 2) {
              if (churnTimer) clearTimeout(churnTimer);
              log('*** CHURN_PROOF COMPLETE — stage killed mid-serve, swarm re-formed from the spare, next request served + settled ***');
              if (ONCE) setTimeout(() => { log('(--once) success, exiting 0'); process.exit(0); }, 500);
            } else if (P11 && p11Phase === 'normal1') {
              // serve #1 clean — now wedge the coordinator with a stall request
              p11Phase = 'stalling';
              log('P11_STALL_NOW — dispatching a stall request to wedge the coordinator');
              p11Timer = setTimeout(() => {
                log('*** P11_PROOF FAILED — no degraded re-serve within 120s ***'); process.exit(1);
              }, 120_000);
              serveOnce(1, { stall: true });
            } else if (P11 && p11Phase === 'recovering') {
              if (p11Timer) clearTimeout(p11Timer);
              log('*** P11_PROOF COMPLETE — coordinator stall-killed, relaunched EAGLE-off, next request served ***');
              if (ONCE) setTimeout(() => { log('(--once) success, exiting 0'); process.exit(0); }, 500);
            } else {
              log('*** LEG-8 NODE HALF COMPLETE — request -> served -> settled ***');
              if (ONCE) setTimeout(() => { log('(--once) success, exiting 0'); process.exit(0); }, 500);
            }
          } else if (ONCE && !CHURN) {
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
      // P11: the stall request is SUPPOSED to fail (the coordinator wedged + exited). That is the
      // trigger, not a failure — wait for the daemon's EAGLE-off relaunch, then serve the recovery.
      if (P11 && opts.stall && p11Phase === 'stalling') {
        p11Phase = 'recovering';
        log(`P11_STALL_TRIGGERED (coordinator down: ${m}) — waiting for the EAGLE-off relaunch, then re-serving`);
        setTimeout(() => serveOnce(1), 12_000);
        return;
      }
      log(`serve error: ${m}${attempt < 4 ? ' — retrying in 5s' : ''}`);
      if (attempt < 4) setTimeout(() => serveOnce(attempt + 1, opts), 5000);
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
