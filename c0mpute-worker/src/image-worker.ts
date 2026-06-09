import { io, Socket } from 'socket.io-client';
import { DEFAULT_ORCHESTRATOR_URL, IMAGE_MODEL_NAME } from './config.js';
import { ensureImageSetup } from './image-setup.js';
import { runImageJob } from './image-inference.js';

interface ImageWorkerOptions {
  token: string;
  orchestratorUrl?: string;
}

/**
 * Image worker lifecycle: ensure ComfyUI + Chroma are ready, connect, register
 * as an 'image' worker, and serve the render jobs the orchestrator dispatches.
 */
export async function startImageWorker(options: ImageWorkerOptions): Promise<void> {
  const { token } = options;
  const url = options.orchestratorUrl || DEFAULT_ORCHESTRATOR_URL;

  await ensureImageSetup();

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
  socket.on('disconnect', (reason) => { log(`Disconnected: ${reason}`); workerId = null; });
  socket.on('connect_error', (err) => log(`Connection error: ${err.message}`));

  function register() {
    socket.emit(
      'worker:register',
      {
        model: IMAGE_MODEL_NAME,
        authToken: token,
        tokPerSec: 0, // image workers produce no tokens; orchestrator exempts them from the floor
        type: 'image',
        capabilities: { image: true },
      } as any,
      (response: { workerId: string } | { error: string }) => {
        if ('error' in response) {
          log(`Registration failed: ${response.error}`);
          process.exit(2);
        }
        workerId = response.workerId;
        log(`Registered as image worker ${workerId}`);
        log(`Status: ready | Renders completed: ${jobsCompleted}`);
      }
    );
  }

  socket.on('image:job', async (data: { jobId: string; workflow: Record<string, unknown> }) => {
    const { jobId, workflow } = data;
    if (!workflow) { socket.emit('image:failed', { jobId, error: 'No workflow provided' }); return; }
    const abort = new AbortController();
    active.set(jobId, abort);
    log(`Render started: ${jobId}`);
    try {
      const image = await runImageJob(workflow, abort.signal);
      socket.emit('image:result', { jobId, image });
      jobsCompleted++;
      log(`Render complete: ${jobId} | Total: ${jobsCompleted}`);
    } catch (err: any) {
      if (err?.name === 'AbortError') { log(`Render cancelled: ${jobId}`); return; }
      const message = err?.message || 'Image generation failed';
      log(`Render error: ${jobId} - ${message}`);
      socket.emit('image:failed', { jobId, error: message });
    } finally {
      active.delete(jobId);
    }
  });

  socket.on('image:cancel', (data: { jobId: string }) => {
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
