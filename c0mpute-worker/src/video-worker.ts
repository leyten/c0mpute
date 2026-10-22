import { io, Socket } from 'socket.io-client';
import { DEFAULT_ORCHESTRATOR_URL, VIDEO_MODEL_NAME, COMFY_URL } from './config.js';
import { checkVideoComfy, runVideoJob, GraphNode, VideoStage } from './video-inference.js';

interface VideoWorkerOptions {
  token: string;
  orchestratorUrl?: string;
  // Opted in to adult (18+) jobs. Without it the orchestrator sends SFW jobs only.
  adult: boolean;
}

/**
 * Video worker lifecycle: self-check the local ComfyUI, connect, register as a
 * 'video' worker, and serve the text-to-video jobs the orchestrator dispatches,
 * reporting progress while each renders.
 */
export async function startVideoWorker(options: VideoWorkerOptions): Promise<void> {
  const { token, adult } = options;
  const url = options.orchestratorUrl || DEFAULT_ORCHESTRATOR_URL;

  console.log(`Checking ComfyUI at ${COMFY_URL}…`);
  const problem = await checkVideoComfy();
  if (problem) {
    console.error(`Self-check FAILED: ${problem}`);
    console.error('Not registering. Video mode needs a running ComfyUI with the Wan 2.2 video models already installed (setup is not automated yet). Set COMFY_URL if it is not on 127.0.0.1:8188, then restart.');
    process.exit(1);
  }
  console.log('Self-check passed.');
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') {
    console.log('Note: this Node has no built-in WebSocket (needs Node 22+), so render progress will not be reported.');
  }
  console.log(`Adult (18+) jobs: ${adult ? 'on' : 'off (pass --adult to opt in)'}`);

  console.log(`Connecting to ${url}`);
  const socket: Socket = io(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
  });

  let workerId: string | null = null;
  let jobsCompleted = 0;
  const active = new Map<string, AbortController>();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

  socket.on('connect', () => { log('Connected to orchestrator'); register(); });
  socket.on('disconnect', (reason) => {
    log(`Disconnected: ${reason}`);
    workerId = null;
    // The orchestrator fails a job whose worker drops, so a clip finished
    // after this could never be delivered. Stop the GPU work now.
    for (const a of active.values()) a.abort();
  });
  socket.on('connect_error', (err) => log(`Connection error: ${err.message}`));

  function register() {
    socket.emit(
      'worker:register',
      {
        model: VIDEO_MODEL_NAME,
        authToken: token,
        tokPerSec: 0, // video workers produce no tokens; orchestrator exempts them from the floor
        type: 'video',
        capabilities: { adult },
      },
      (response: { workerId: string } | { error: string }) => {
        if ('error' in response) {
          log(`Registration failed: ${response.error}`);
          process.exit(2);
        }
        workerId = response.workerId;
        log(`Registered as video worker ${workerId}`);
        log(`Status: ready | Renders completed: ${jobsCompleted}`);
      }
    );
  }

  socket.on('video:job', async (data: { jobId: string; workflow: Record<string, GraphNode>; outputNode?: string }) => {
    const { jobId, workflow, outputNode } = data;
    if (!workflow) { socket.emit('video:failed', { jobId, error: 'No workflow provided' }); return; }
    const abort = new AbortController();
    active.set(jobId, abort);
    log(`Render started: ${jobId}`);
    // One progress message a second at most; a stage change goes out at once.
    let lastAt = 0;
    let lastStage: VideoStage | undefined;
    let lastPct = -1;
    const onProgress = (pct: number, stage: VideoStage) => {
      const now = Date.now();
      if (stage === lastStage && (pct === lastPct || now - lastAt < 1000)) return;
      lastAt = now; lastStage = stage; lastPct = pct;
      socket.emit('video:progress', { jobId, pct, stage });
    };
    try {
      const video = await runVideoJob(workflow, outputNode, abort.signal, onProgress);
      socket.emit('video:result', { jobId, video });
      jobsCompleted++;
      log(`Render complete: ${jobId} | ${(video.length / 1048576).toFixed(1)}MB | Total: ${jobsCompleted}`);
    } catch (err) {
      const e = err as Error;
      if (e?.name === 'AbortError') { log(`Render cancelled: ${jobId}`); return; }
      const message = e?.message || 'Video generation failed';
      log(`Render error: ${jobId} - ${message}`);
      socket.emit('video:failed', { jobId, error: message });
    } finally {
      active.delete(jobId);
    }
  });

  socket.on('video:cancel', (data: { jobId: string }) => {
    log(`Render cancel requested: ${data.jobId}`);
    active.get(data.jobId)?.abort();
  });

  async function shutdown() {
    log('Shutting down...');
    for (const a of active.values()) a.abort();
    socket.emit('worker:unregister');
    socket.disconnect();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
