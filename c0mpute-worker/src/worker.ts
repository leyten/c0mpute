import { io, Socket } from 'socket.io-client';
import { DEFAULT_ORCHESTRATOR_URL, DEFAULT_MODEL_NAME } from './config.js';
import { downloadModel, loadModel, runInference, disposeModel, ChatMessage } from './inference.js';
import { runBenchmark } from './benchmark.js';

interface WorkerOptions {
  token: string;
  orchestratorUrl?: string;
  modelPath?: string;
  benchmarkOnly?: boolean;
}

/**
 * Main worker lifecycle: download model, benchmark, connect, and serve jobs.
 */
export async function startWorker(options: WorkerOptions): Promise<void> {
  const { token, orchestratorUrl, modelPath, benchmarkOnly } = options;
  const url = orchestratorUrl || DEFAULT_ORCHESTRATOR_URL;

  // Step 1: Download and load model
  const resolvedPath = await downloadModel(modelPath);
  console.log(`Model: ${resolvedPath.split('/').pop()}`);

  await loadModel(resolvedPath);

  // Step 2: Benchmark
  const tokPerSec = await runBenchmark();

  if (benchmarkOnly) {
    await disposeModel();
    return;
  }

  // Step 3: Connect to orchestrator
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
  let activeJobAbort: AbortController | null = null;

  function logStatus(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  socket.on('connect', () => {
    logStatus('Connected to orchestrator');
    register();
  });

  socket.on('disconnect', (reason) => {
    logStatus(`Disconnected: ${reason}`);
    workerId = null;
  });

  socket.on('connect_error', (err) => {
    logStatus(`Connection error: ${err.message}`);
  });

  function register() {
    socket.emit(
      'worker:register',
      {
        model: DEFAULT_MODEL_NAME,
        authToken: token,
        tokPerSec: Math.round(tokPerSec * 10) / 10,
        type: 'native',
        capabilities: { search: true, uncensored: false, longContext: true },
      } as any,
      (response: { workerId: string } | { error: string }) => {
        if ('error' in response) {
          logStatus(`Registration failed: ${response.error}`);
          process.exit(2);
        }
        workerId = response.workerId;
        logStatus(`Registered as worker ${workerId}`);
        logStatus(`Status: ready | Jobs completed: ${jobsCompleted}`);
      }
    );
  }

  socket.on('job:new', async (data: { jobId: string; messages?: ChatMessage[]; searchContext?: string }) => {
    const { jobId, messages } = data;
    logStatus(`Job received: ${jobId}`);

    if (!messages || messages.length === 0) {
      socket.emit('job:error', { jobId, error: 'No messages provided' });
      return;
    }

    activeJobAbort = new AbortController();

    try {
      const result = await runInference(
        messages,
        (token) => {
          socket.emit('job:token', { jobId, token });
        },
        activeJobAbort.signal,
      );

      socket.emit('job:complete', {
        jobId,
        response: result.response,
        tokensGenerated: result.tokensGenerated,
      });

      jobsCompleted++;
      logStatus(`Job complete: ${jobId} (${result.tokensGenerated} tokens) | Total: ${jobsCompleted}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logStatus(`Job cancelled: ${jobId}`);
        return;
      }
      const message = err.message || 'Inference failed';
      logStatus(`Job error: ${jobId} - ${message}`);
      socket.emit('job:error', { jobId, error: message });
    } finally {
      activeJobAbort = null;
    }
  });

  socket.on('job:cancel', (data: { jobId: string }) => {
    logStatus(`Job cancel requested: ${data.jobId}`);
    if (activeJobAbort) {
      activeJobAbort.abort();
    }
  });

  // Graceful shutdown
  async function shutdown() {
    logStatus('Shutting down...');
    if (activeJobAbort) activeJobAbort.abort();
    socket.emit('worker:unregister');
    socket.disconnect();
    await disposeModel();
    logStatus('Goodbye');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
