/**
 * Studio video lane, end to end without a GPU: the real POST /api/videos/generate
 * and GET /api/videos/<id> handlers (authenticated with an API key), a real
 * Orchestrator on a throwaway port, and fake video workers over socket.io that
 * answer with a tiny fake MP4. Proves:
 *   - no worker online, Studio (or its 18+ side) unconfigured, or an overlong
 *     prompt: refused up front, nothing charged;
 *   - SFW requests get the SFW graph and adult requests the 18+ graph, never the
 *     other, and a user negative prompt is ignored;
 *   - dispatch, progress relay (unknown stages dropped), the clip delivered and
 *     re-deliverable until it expires;
 *   - completed job + worker earning recorded with tier 'video';
 *   - every failure path (worker error, bad/oversized clip, timeout, worker gone
 *     or unregistered mid-render) refunds exactly once, and a late result after a
 *     failure is ignored;
 *   - a queued job outlives its only capable worker dropping and reconnecting;
 *   - a clip under the 100KB junk floor is refused: refunded, no earning;
 *   - a third job in flight for one account, or new work while held clips are
 *     over budget, is refused before anything is charged;
 *   - an adult job never reaches a worker that did not opt in;
 *   - network stats count video workers as video, never as browser workers;
 *   - a submit that reaches the orchestrator after its accept deadline is refused;
 *   - every charge is a video_charges row: settled on delivery, refunded on
 *     failure, refunded by the next orchestrator's startup sweep after a crash,
 *     and never refunded twice across processes; a clip whose charge was already
 *     refunded (a lost ack) earns nothing.
 *
 * The DB is cwd/data/c0mpute.db, so this runs from a fresh temp dir and never
 * touches a real one.
 *
 * Run:  npx tsx scripts/video-lane-test.ts
 */
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../lib/orchestrator/types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(20); }
  return cond();
}

const EXAMPLE = resolve(__dirname, '..', 'deploy', 'video-workflow.example.json');
const tmp = mkdtempSync(join(tmpdir(), 'video-lane-test-'));
mkdirSync(join(tmp, 'data'));
process.chdir(tmp);
process.env.INTERNAL_API_SECRET = 'video-lane-test-secret';
process.env.VIDEO_JOB_TIMEOUT_MS = '3000';
process.env.VIDEO_HELD_MAX_MB = '10'; // the 8MB clip at the end tips it over
process.env.MIN_WORKER_ACCOUNT_AGE_HOURS = '0.000001'; // so fresh test workers appear in the stats
process.env.VIDEO_WORKFLOW_PATH = EXAMPLE;
// The 18+ manifest: the example plus a marker node, so a test can tell which
// graph a job was built from.
const ADULT = join(tmp, 'adult.manifest.json');
const adultManifest = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
adultManifest.workflow['40'] = { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'adult-marker.safetensors' } };
writeFileSync(ADULT, JSON.stringify(adultManifest));
process.env.VIDEO_WORKFLOW_PATH_ADULT = ADULT;
const EXAMPLE_NEGATIVE: string = adultManifest.params.negative.default;

function fakeMp4(size: number): Buffer {
  const b = Buffer.alloc(size, 7);
  b.writeUInt32BE(24, 0);
  b.write('ftypisom', 4, 'latin1');
  return b;
}

interface FakeWorker { sock: ClientSocket; jobs: { jobId: string; workflow: Record<string, { inputs?: Record<string, unknown> }>; outputNode?: string }[]; cancels: string[] }

async function main() {
  const http = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, { maxHttpBufferSize: 16 * 1024 * 1024 });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  process.env.INTERNAL_ORCHESTRATOR_URL = url;

  // Everything below reads the env and the cwd at import, so import it now.
  const db = await import('../lib/db');
  const { Orchestrator } = await import('../lib/orchestrator/orchestrator');
  const { POST } = await import('../app/api/videos/generate/route');
  const { GET } = await import('../app/api/videos/[jobId]/route');
  const { VIDEO_CREDITS } = await import('../lib/video-gen');
  const { refundVideoCharge } = await import('../lib/video-charges');
  const { NextRequest } = await import('next/server');
  const orch = new Orchestrator(io);

  const USER = 'did:privy:video-user';
  db.addCredits(USER, 10_000, undefined, 'test');
  const apiKey = db.createApiKey(USER, 'test');
  const balance = () => db.getCreditBalance(USER).balance;
  const txCount = () => db.getCreditTransactions(USER, 100_000).length;
  const USER2 = 'did:privy:video-user-2';
  db.addCredits(USER2, 10_000, undefined, 'test');
  const apiKey2 = db.createApiKey(USER2, 'test');
  const balance2 = () => db.getCreditBalance(USER2).balance;

  const generate = async (body: Record<string, unknown>, key = apiKey) => {
    const res = await POST(new NextRequest('http://t/api/videos/generate', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    return { status: res.status, data: await res.json() };
  };
  const poll = async (jobId: string, key = apiKey) => {
    const res = await GET(new NextRequest(`http://t/api/videos/${jobId}`, { headers: { authorization: `Bearer ${key}` } }),
      { params: Promise.resolve({ jobId }) });
    if (res.headers.get('content-type') === 'video/mp4') return { status: res.status, video: Buffer.from(await res.arrayBuffer()) } as const;
    return { status: res.status, data: await res.json() } as const;
  };
  const internalSubmit = async (payload: Record<string, unknown>) => {
    const s = ioc(url, { auth: { token: process.env.INTERNAL_API_SECRET }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((r) => s.on('connect', () => r()));
    const res = await new Promise<{ jobId?: string; error?: string; code?: string }>((r) => s.emit('video:submit', payload, r));
    s.disconnect();
    return res;
  };
  const connectWorker = async (privyId: string, adult: boolean): Promise<FakeWorker> => {
    const token = db.createWorkerToken(privyId);
    const sock = ioc(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    const w: FakeWorker = { sock, jobs: [], cancels: [] };
    sock.on('video:job', (d: FakeWorker['jobs'][number]) => w.jobs.push(d));
    sock.on('video:cancel', (d: { jobId: string }) => w.cancels.push(d.jobId));
    await new Promise<void>((r) => sock.on('connect', () => r()));
    const reg = await new Promise<{ workerId?: string; error?: string }>((r) => sock.emit('worker:register',
      { model: 'c0mpute-video', authToken: token, tokPerSec: 0, type: 'video', capabilities: { adult } }, r));
    if (!reg.workerId) throw new Error(`register failed: ${reg.error}`);
    return w;
  };

  // ── refused up front: nothing charged ──
  const b0 = balance();
  const tx0 = txCount();
  let r = await generate({ prompt: 'a lighthouse at dusk, waves crashing' });
  check(r.status === 503 && r.data.code === 'NO_VIDEO_WORKER', 'no video worker online -> 503 NO_VIDEO_WORKER');
  check(balance() === b0 && txCount() === tx0, 'refused before charging (no credit transaction at all)');
  process.env.VIDEO_WORKFLOW_PATH = '';
  r = await generate({ prompt: 'a lighthouse at dusk' });
  check(r.status === 503 && r.data.code === 'STUDIO_UNAVAILABLE' && balance() === b0, 'VIDEO_WORKFLOW_PATH unset -> studio unavailable, nothing charged');
  process.env.VIDEO_WORKFLOW_PATH = EXAMPLE;
  process.env.VIDEO_WORKFLOW_PATH_ADULT = '';
  r = await generate({ prompt: 'nude figure on a beach', adult: true });
  check(r.status === 503 && r.data.code === 'STUDIO_ADULT_UNAVAILABLE' && balance() === b0,
    'VIDEO_WORKFLOW_PATH_ADULT unset -> 18+ studio unavailable (no fallback to the SFW graph), nothing charged');
  process.env.VIDEO_WORKFLOW_PATH_ADULT = ADULT;
  r = await generate({ prompt: 'nude figure on a beach' });
  check(r.status === 400 && balance() === b0, 'SFW mode refuses an adult prompt before charging');
  r = await generate({ prompt: 'a'.repeat(2001) });
  check(r.status === 400 && /2000/.test(r.data.error) && balance() === b0, 'prompt over 2000 characters refused before charging');

  const sfw = await connectWorker('did:privy:worker-sfw', false);
  r = await generate({ prompt: 'nude figure on a beach', adult: true });
  check(r.status === 503 && r.data.code === 'NO_VIDEO_WORKER' && balance() === b0 && txCount() === tx0, 'adult job with only a non-adult worker online -> refused before charging');
  check(sfw.jobs.length === 0, 'the non-adult worker never saw the adult job');
  const st = orch.getStats();
  check(st.videoWorkers === 1 && st.browserWorkers === 0, 'stats count the video worker as video, not as a browser worker');

  // ── happy path: dispatch, progress, delivery, earnings ──
  r = await generate({ prompt: 'a red fox running through snow', width: 720, height: 1280, seed: 1234, negative_prompt: 'adult, mature' });
  check(r.status === 200 && typeof r.data.jobId === 'string', 'POST answers { jobId } immediately');
  check(balance() === b0 - VIDEO_CREDITS, `charged ${VIDEO_CREDITS} credits up front`);
  const j1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 1), 'job dispatched to the idle video worker');
  const wf = sfw.jobs[0]?.workflow;
  check(sfw.jobs[0]?.jobId === j1 && sfw.jobs[0]?.outputNode === '31', 'video:job carries the job id and the output node');
  check(wf?.['5']?.inputs?.text === 'a red fox running through snow' && wf?.['7']?.inputs?.width === 720
    && wf?.['7']?.inputs?.height === 1280 && wf?.['7']?.inputs?.length === 81 && wf?.['22']?.inputs?.noise_seed === 1234,
    'graph built from the manifest: prompt, size, 81 frames, seed on the samplers');
  check(!wf?.['40'], 'an SFW job gets the SFW graph (no 18+ marker node)');
  check(wf?.['6']?.inputs?.text === EXAMPLE_NEGATIVE, 'the user negative_prompt is ignored; the manifest negative is used');
  let p = await poll(j1);
  check(p.status === 200 && 'data' in p && p.data.status === 'rendering', 'status poll: rendering');
  sfw.sock.emit('video:progress', { jobId: j1, pct: 42, stage: 'sampling' });
  sfw.sock.emit('video:progress', { jobId: j1, pct: 55, stage: 'send 1 SOL to win' });
  await sleep(100);
  p = await poll(j1);
  check('data' in p && p.data.pct === 55 && p.data.stage === 'sampling', 'progress relayed to the poll; an unknown stage string is dropped');
  const clip = fakeMp4(200 * 1024);
  sfw.sock.emit('video:result', { jobId: j1, video: clip.toString('base64') });
  await sleep(150);
  p = await poll(j1);
  check('video' in p && p.status === 200 && p.video.equals(clip), 'done: GET returns the exact MP4 bytes as video/mp4');
  p = await poll(j1);
  check(db.getVideoChargeStatus(j1) === 'settled', "the first hand-out settles the job's charge row");
  check('video' in p && p.video.equals(clip), 'a re-fetch gets the same clip again (kept until it expires, so a failed download can retry)');
  const earn = db.getRecentEarnings('did:privy:worker-sfw');
  check(earn.length === 1 && earn[0].tier === 'video' && earn[0].job_id === j1 && earn[0].earning_usd > 0, "worker earning recorded with tier 'video'");
  const hist = db.getWorkerJobHistory('did:privy:worker-sfw');
  check(hist.length === 1 && hist[0].tier === 'video' && hist[0].id === j1, "completed job recorded with tier 'video'");
  check(balance() === b0 - VIDEO_CREDITS, 'a delivered clip stays charged');

  // ── accept deadline: the route waits longer than it, so a late submit is never accepted ──
  const late = await internalSubmit({ jobId: 'late-job', acceptBy: Date.now() - 1, workflow: { '1': {} }, privyUserId: USER, adult: false, creditsCharged: VIDEO_CREDITS });
  p = await poll('late-job');
  check(late.code === 'SUBMIT_EXPIRED' && p.status === 404 && sfw.jobs.length === 1, 'a submit past its accept deadline is refused and creates no job');

  // ── adult routing: an adult job waits for an opted-in worker ──
  const adultW = await connectWorker('did:privy:worker-adult', true);
  const bA = balance();
  const b2 = balance2();
  r = await generate({ prompt: 'nude figure on a beach', adult: true });
  const a1 = r.data.jobId as string;
  check(r.status === 200 && await waitFor(() => adultW.jobs.length === 1) && adultW.jobs[0].jobId === a1, 'adult job dispatched to the opted-in worker');
  check(adultW.jobs[0]?.workflow?.['40']?.inputs?.lora_name === 'adult-marker.safetensors', 'an adult job gets the 18+ graph');
  r = await generate({ prompt: 'nude figure in the rain', adult: true });
  const a2 = r.data.jobId as string;
  await sleep(200);
  p = await poll(a2);
  check('data' in p && p.data.status === 'queued' && sfw.jobs.length === 1, 'second adult job queues while the adult worker is busy; the idle non-adult worker is skipped');

  // ── per-account cap: two in flight, the third is refused before charging ──
  const txA = txCount();
  r = await generate({ prompt: 'a third clip while two are in flight' });
  check(r.status === 429 && r.data.code === 'TOO_MANY_VIDEOS' && txCount() === txA, 'a third job in flight for one account -> 429 before charging');

  r = await generate({ prompt: 'a paper boat on a pond' }, apiKey2);
  const s2 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 2) && sfw.jobs[1].jobId === s2, "another account's SFW job takes the free non-adult worker meanwhile");
  adultW.sock.emit('video:failed', { jobId: a1, error: 'CUDA out of memory' });
  check(await waitFor(() => adultW.jobs.length === 2) && adultW.jobs[1].jobId === a2, 'adult worker freed by the failure picks up the queued adult job');
  p = await poll(a1);
  check('data' in p && p.data.status === 'failed' && !/CUDA/.test(p.data.error), 'worker failure reported to the poll (worker text not relayed)');
  check(balance() === bA - VIDEO_CREDITS && db.getVideoChargeStatus(a1) === 'refunded', 'worker failure refunded, charge row refunded (a2 still charged)');

  // ── exactly once: a late result for a failed job is ignored ──
  adultW.sock.emit('video:result', { jobId: a1, video: clip.toString('base64') });
  await sleep(100);
  check(balance() === bA - VIDEO_CREDITS && db.getRecentEarnings('did:privy:worker-adult').length === 0, 'late result after failure: no second refund, no earning');

  // ── bad and oversized clips ──
  adultW.sock.emit('video:result', { jobId: a2, video: Buffer.from('definitely not a video').toString('base64') });
  await sleep(100);
  p = await poll(a2);
  check('data' in p && p.data.status === 'failed' && p.data.code === 'BAD_RESULT', 'non-MP4 result rejected');
  const big = fakeMp4(Math.ceil((15.5 * 1024 * 1024 * 3) / 4)).toString('base64');
  sfw.sock.emit('video:result', { jobId: s2, video: big });
  await sleep(500);
  p = await poll(s2, apiKey2);
  check('data' in p && p.data.status === 'failed' && p.data.code === 'BAD_RESULT' && /too large/.test(p.data.error), `oversized clip (${(big.length / 1048576).toFixed(1)}MB base64) rejected with a clear error`);
  check(balance() === bA && balance2() === b2, 'both refunded, exactly once each');
  r = await generate({ prompt: 'nude figure on a balcony', adult: true });
  const a3 = r.data.jobId as string;
  check(await waitFor(() => adultW.jobs.length === 3), 'next adult job dispatched');
  adultW.sock.emit('video:result', { jobId: a3, video: fakeMp4(50 * 1024).toString('base64') });
  await sleep(100);
  p = await poll(a3);
  check('data' in p && p.data.code === 'BAD_RESULT' && balance() === bA && db.getRecentEarnings('did:privy:worker-adult').length === 0,
    'a valid-looking MP4 under the 100KB floor is refused: refunded, no earning');

  // ── lost ack: the route refunded an accepted job; its clip must not earn ──
  const bL = balance();
  r = await generate({ prompt: 'a kite over a beach' });
  const k1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 3), 'job dispatched');
  check(refundVideoCharge(k1, 'test: route gave up on a lost ack') && balance() === bL, 'route-side refund (lost ack) goes through the latch');
  sfw.sock.emit('video:result', { jobId: k1, video: clip.toString('base64') });
  await sleep(150);
  p = await poll(k1);
  check('data' in p && p.data.code === 'CHARGE_VOID' && balance() === bL && !db.getRecentEarnings('did:privy:worker-sfw').some((e) => e.job_id === k1),
    'its clip is not delivered, earns nothing, and is not refunded a second time');

  // ── crash: the next orchestrator refunds what the last one left pending ──
  r = await generate({ prompt: 'fog rolling over hills' });
  const c1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 4) && balance() === bL - VIDEO_CREDITS, 'job charged and rendering');
  new Orchestrator(new Server<ClientToServerEvents, ServerToClientEvents>());
  check(balance() === bL && db.getVideoChargeStatus(c1) === 'refunded', 'a restarted orchestrator refunds the pending charge at startup');
  new Orchestrator(new Server<ClientToServerEvents, ServerToClientEvents>());
  check(balance() === bL, 'a second restart refunds nothing more');
  sfw.sock.emit('video:failed', { jobId: c1, error: 'lost the GPU' });
  await sleep(100);
  check(balance() === bL, 'the old process failing the same job does not refund it again');

  // ── timeout ──
  const bT = balance();
  r = await generate({ prompt: 'a slow pan across a desert' });
  const t1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 5), 'job dispatched (worker will never answer)');
  check(await waitFor(() => sfw.cancels.includes(t1), 5000), 'render timeout -> worker told to cancel');
  p = await poll(t1);
  check('data' in p && p.data.code === 'TIMEOUT' && balance() === bT, 'timeout reported and refunded');

  // ── worker disconnects mid-render; the job queued behind it waits it out ──
  r = await generate({ prompt: 'nude figure in the rain at night', adult: true });
  const g1 = r.data.jobId as string;
  check(await waitFor(() => adultW.jobs.length === 4), 'job dispatched');
  r = await generate({ prompt: 'nude figure in the snow', adult: true });
  const g2 = r.data.jobId as string;
  adultW.sock.disconnect();
  await sleep(200);
  p = await poll(g1);
  check('data' in p && p.data.code === 'WORKER_GONE', 'worker gone mid-render -> failed');
  p = await poll(g2);
  check('data' in p && p.data.status === 'queued' && balance() === bT - VIDEO_CREDITS,
    'the adult job queued behind it is kept (not wiped) while no 18+ worker is connected; g1 refunded');
  const adultW2 = await connectWorker('did:privy:worker-adult-2', true);
  check(await waitFor(() => adultW2.jobs.length === 1) && adultW2.jobs[0].jobId === g2, 'a reconnecting 18+ worker picks the queued job up');

  // ── worker unregisters mid-render: failed and refunded at once ──
  adultW2.sock.emit('worker:unregister');
  check(await waitFor(() => adultW2.cancels.includes(g2), 1000), 'unregister mid-render -> the worker is told to cancel straight away');
  p = await poll(g2);
  check('data' in p && p.data.code === 'WORKER_GONE' && balance() === bT, 'and the job is failed and refunded, not left to the timeout');
  adultW2.sock.disconnect();

  // ── a large but legal clip arrives intact; then held clips are over budget ──
  r = await generate({ prompt: 'timelapse of clouds over mountains' });
  const l1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 6), 'next job dispatched');
  const large = fakeMp4(8 * 1024 * 1024);
  sfw.sock.emit('video:result', { jobId: l1, video: large.toString('base64') });
  await sleep(800);
  p = await poll(l1);
  check('video' in p && p.video.equals(large), '8MB clip delivered byte for byte');
  const txB = txCount();
  r = await generate({ prompt: 'one more clip' });
  check(r.status === 503 && r.data.code === 'STUDIO_BUSY' && txCount() === txB, 'held clips over budget -> "studio busy" before charging');

  sfw.sock.disconnect();
  io.close();
  rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
