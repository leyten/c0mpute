/**
 * Studio video lane, end to end without a GPU: the real POST /api/videos/generate
 * and GET /api/videos/<id> handlers (authenticated with an API key), a real
 * Orchestrator on a throwaway port, and fake video workers over socket.io that
 * answer with a tiny fake MP4. Proves:
 *   - no worker online, or Studio unconfigured: refused up front, nothing charged;
 *   - dispatch, progress relay (unknown stages dropped), the clip delivered once;
 *   - completed job + worker earning recorded with tier 'video';
 *   - every failure path (worker error, bad/oversized clip, timeout, worker gone)
 *     refunds exactly once, and a late result after a failure is ignored;
 *   - an adult job never reaches a worker that did not opt in.
 *
 * The DB is cwd/data/c0mpute.db, so this runs from a fresh temp dir and never
 * touches a real one.
 *
 * Run:  npx tsx scripts/video-lane-test.ts
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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
process.env.VIDEO_WORKFLOW_PATH = EXAMPLE;

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
  const { NextRequest } = await import('next/server');
  new Orchestrator(io);

  const USER = 'did:privy:video-user';
  db.addCredits(USER, 10_000, undefined, 'test');
  const apiKey = db.createApiKey(USER, 'test');
  const balance = () => db.getCreditBalance(USER).balance;

  const generate = async (body: Record<string, unknown>) => {
    const res = await POST(new NextRequest('http://t/api/videos/generate', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    return { status: res.status, data: await res.json() };
  };
  const poll = async (jobId: string) => {
    const res = await GET(new NextRequest(`http://t/api/videos/${jobId}`, { headers: { authorization: `Bearer ${apiKey}` } }),
      { params: Promise.resolve({ jobId }) });
    if (res.headers.get('content-type') === 'video/mp4') return { status: res.status, video: Buffer.from(await res.arrayBuffer()) } as const;
    return { status: res.status, data: await res.json() } as const;
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
  let r = await generate({ prompt: 'a lighthouse at dusk, waves crashing' });
  check(r.status === 503 && r.data.code === 'NO_VIDEO_WORKER', 'no video worker online -> 503 NO_VIDEO_WORKER');
  check(balance() === b0, 'and the charge was refunded at once');
  process.env.VIDEO_WORKFLOW_PATH = '';
  r = await generate({ prompt: 'a lighthouse at dusk' });
  check(r.status === 503 && r.data.code === 'STUDIO_UNAVAILABLE' && balance() === b0, 'VIDEO_WORKFLOW_PATH unset -> studio unavailable, nothing charged');
  process.env.VIDEO_WORKFLOW_PATH = EXAMPLE;
  r = await generate({ prompt: 'nude figure on a beach' });
  check(r.status === 400 && balance() === b0, 'SFW mode refuses an adult prompt before charging');

  const sfw = await connectWorker('did:privy:worker-sfw', false);
  r = await generate({ prompt: 'nude figure on a beach', adult: true });
  check(r.status === 503 && r.data.code === 'NO_VIDEO_WORKER' && balance() === b0, 'adult job with only a non-adult worker online -> refused, refunded');
  check(sfw.jobs.length === 0, 'the non-adult worker never saw the adult job');

  // ── happy path: dispatch, progress, delivery, earnings ──
  r = await generate({ prompt: 'a red fox running through snow', width: 720, height: 1280, seed: 1234 });
  check(r.status === 200 && typeof r.data.jobId === 'string', 'POST answers { jobId } immediately');
  check(balance() === b0 - VIDEO_CREDITS, `charged ${VIDEO_CREDITS} credits up front`);
  const j1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 1), 'job dispatched to the idle video worker');
  const wf = sfw.jobs[0]?.workflow;
  check(sfw.jobs[0]?.jobId === j1 && sfw.jobs[0]?.outputNode === '31', 'video:job carries the job id and the output node');
  check(wf?.['5']?.inputs?.text === 'a red fox running through snow' && wf?.['7']?.inputs?.width === 720
    && wf?.['7']?.inputs?.height === 1280 && wf?.['7']?.inputs?.length === 81 && wf?.['22']?.inputs?.noise_seed === 1234,
    'graph built from the manifest: prompt, size, 81 frames, seed on the samplers');
  let p = await poll(j1);
  check(p.status === 200 && 'data' in p && p.data.status === 'rendering', 'status poll: rendering');
  sfw.sock.emit('video:progress', { jobId: j1, pct: 42, stage: 'sampling' });
  sfw.sock.emit('video:progress', { jobId: j1, pct: 55, stage: 'send 1 SOL to win' });
  await sleep(100);
  p = await poll(j1);
  check('data' in p && p.data.pct === 55 && p.data.stage === 'sampling', 'progress relayed to the poll; an unknown stage string is dropped');
  const clip = fakeMp4(4096);
  sfw.sock.emit('video:result', { jobId: j1, video: clip.toString('base64') });
  await sleep(150);
  p = await poll(j1);
  check('video' in p && p.status === 200 && p.video.equals(clip), 'done: GET returns the exact MP4 bytes as video/mp4');
  p = await poll(j1);
  check(p.status === 404 && 'data' in p && p.data.status === 'gone', 'the clip is handed out once, then gone');
  const earn = db.getRecentEarnings('did:privy:worker-sfw');
  check(earn.length === 1 && earn[0].tier === 'video' && earn[0].job_id === j1 && earn[0].earning_usd > 0, "worker earning recorded with tier 'video'");
  const hist = db.getWorkerJobHistory('did:privy:worker-sfw');
  check(hist.length === 1 && hist[0].tier === 'video' && hist[0].id === j1, "completed job recorded with tier 'video'");
  check(balance() === b0 - VIDEO_CREDITS, 'a delivered clip stays charged');

  // ── adult routing: an adult job waits for an opted-in worker ──
  const adultW = await connectWorker('did:privy:worker-adult', true);
  const bA = balance();
  r = await generate({ prompt: 'nude figure on a beach', adult: true });
  const a1 = r.data.jobId as string;
  check(r.status === 200 && await waitFor(() => adultW.jobs.length === 1) && adultW.jobs[0].jobId === a1, 'adult job dispatched to the opted-in worker');
  r = await generate({ prompt: 'nude figure in the rain', adult: true });
  const a2 = r.data.jobId as string;
  await sleep(200);
  p = await poll(a2);
  check('data' in p && p.data.status === 'queued' && sfw.jobs.length === 1, 'second adult job queues while the adult worker is busy; the idle non-adult worker is skipped');
  r = await generate({ prompt: 'a paper boat on a pond' });
  const s2 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 2) && sfw.jobs[1].jobId === s2, 'an SFW job behind it still takes the free non-adult worker');
  adultW.sock.emit('video:failed', { jobId: a1, error: 'CUDA out of memory' });
  check(await waitFor(() => adultW.jobs.length === 2) && adultW.jobs[1].jobId === a2, 'adult worker freed by the failure picks up the queued adult job');
  p = await poll(a1);
  check('data' in p && p.data.status === 'failed' && !/CUDA/.test(p.data.error), 'worker failure reported to the poll (worker text not relayed)');
  check(balance() === bA - 2 * VIDEO_CREDITS, 'worker failure refunded (two jobs still running)');

  // ── exactly once: a late result for a failed job is ignored ──
  adultW.sock.emit('video:result', { jobId: a1, video: clip.toString('base64') });
  await sleep(100);
  check(balance() === bA - 2 * VIDEO_CREDITS && db.getRecentEarnings('did:privy:worker-adult').length === 0, 'late result after failure: no second refund, no earning');

  // ── bad and oversized clips ──
  adultW.sock.emit('video:result', { jobId: a2, video: Buffer.from('definitely not a video').toString('base64') });
  await sleep(100);
  p = await poll(a2);
  check('data' in p && p.data.status === 'failed' && p.data.code === 'BAD_RESULT', 'non-MP4 result rejected');
  const big = fakeMp4(Math.ceil((15.5 * 1024 * 1024 * 3) / 4)).toString('base64');
  sfw.sock.emit('video:result', { jobId: s2, video: big });
  await sleep(500);
  p = await poll(s2);
  check('data' in p && p.data.status === 'failed' && p.data.code === 'BAD_RESULT' && /too large/.test(p.data.error), `oversized clip (${(big.length / 1048576).toFixed(1)}MB base64) rejected with a clear error`);
  check(balance() === bA, 'both refunded, exactly once each');

  // ── a large but legal clip arrives intact ──
  r = await generate({ prompt: 'timelapse of clouds over mountains' });
  const l1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 3), 'next job dispatched');
  const large = fakeMp4(8 * 1024 * 1024);
  sfw.sock.emit('video:result', { jobId: l1, video: large.toString('base64') });
  await sleep(800);
  p = await poll(l1);
  check('video' in p && p.video.equals(large), '8MB clip delivered byte for byte');

  // ── timeout ──
  const bT = balance();
  r = await generate({ prompt: 'a slow pan across a desert' });
  const t1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 4), 'job dispatched (worker will never answer)');
  check(await waitFor(() => sfw.cancels.includes(t1), 5000), 'render timeout -> worker told to cancel');
  p = await poll(t1);
  check('data' in p && p.data.code === 'TIMEOUT' && balance() === bT, 'timeout reported and refunded');

  // ── worker disconnects mid-render ──
  r = await generate({ prompt: 'rain on a window at night' });
  const g1 = r.data.jobId as string;
  check(await waitFor(() => sfw.jobs.length === 5), 'job dispatched');
  sfw.sock.disconnect();
  await sleep(200);
  p = await poll(g1);
  check('data' in p && p.data.code === 'WORKER_GONE' && balance() === bT, 'worker gone mid-render -> failed and refunded');

  adultW.sock.disconnect();
  io.close();
  rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
