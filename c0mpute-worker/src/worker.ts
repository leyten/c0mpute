import { io, Socket } from 'socket.io-client';
import { DEFAULT_ORCHESTRATOR_URL, DEFAULT_MODEL_NAME, MAX_TOOL_ROUNDS } from './config.js';
import { runInference, ChatMessage, ToolCall, ToolDefinition } from './inference.js';
import { ensureSetup } from './setup.js';
import { runBenchmark } from './benchmark.js';

interface WorkerOptions {
  token: string;
  orchestratorUrl?: string;
  benchmarkOnly?: boolean;
}

interface JobData {
  jobId: string;
  messages?: ChatMessage[];
  tools?: ToolDefinition[];
  think?: boolean;
  searchContext?: string; // legacy — kept for backwards compat
}

/**
 * Main worker lifecycle: ensure ollama setup, benchmark, connect, and serve jobs.
 */
export async function startWorker(options: WorkerOptions): Promise<void> {
  const { token, orchestratorUrl, benchmarkOnly } = options;
  const url = orchestratorUrl || DEFAULT_ORCHESTRATOR_URL;

  // Step 1: Ensure ollama is running and model is ready
  await ensureSetup();

  // Step 2: Benchmark
  const tokPerSec = await runBenchmark();

  if (benchmarkOnly) {
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
        capabilities: { search: true, uncensored: true, longContext: true, vision: true, tools: true },
      } as any,
      (response: { workerId: string } | { error: string }) => {
        if ('error' in response) {
          logStatus(`Registration failed: ${response.error}`);
          process.exit(2);
        }
        workerId = response.workerId;
        logStatus(`Registered as worker ${workerId}`);
        logStatus(`Capabilities: vision, tools, thinking, uncensored`);
        logStatus(`Status: ready | Jobs completed: ${jobsCompleted}`);
      }
    );
  }

  /**
   * Wait for a tool result from the orchestrator.
   * Returns the tool results as ChatMessages to append to the conversation.
   */
  function waitForToolResults(jobId: string, signal: AbortSignal): Promise<ChatMessage[]> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off(`job:tool_result:${jobId}`);
        signal.removeEventListener('abort', onAbort);
      };
      // Abort immediately when the job is cancelled — e.g. the API tools
      // passthrough returns the call to the agent and cancels us, so no result is
      // coming. Without this the worker would block the full 30s for nothing.
      const onAbort = () => {
        cleanup();
        const e = new Error('Aborted');
        e.name = 'AbortError';
        reject(e);
      };
      if (signal.aborted) {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        reject(e);
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Tool execution timed out (30s)'));
      }, 30_000);

      socket.once(`job:tool_result:${jobId}`, (data: { results: ChatMessage[] }) => {
        cleanup();
        resolve(data.results);
      });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  socket.on('job:new', async (data: JobData) => {
    const { jobId, messages: initialMessages, tools, think } = data;

    if (!initialMessages || initialMessages.length === 0) {
      socket.emit('job:error', { jobId, error: 'No messages provided' });
      return;
    }

    activeJobAbort = new AbortController();
    const messages = [...initialMessages];
    let totalTokens = 0;
    let fullResponse = '';

    try {
      // Tool call loop — model can request tools multiple times
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await runInference(
          messages,
          (token) => {
            socket.emit('job:token', { jobId, token });
          },
          activeJobAbort.signal,
          tools,
          think ?? false,
        );

        totalTokens += result.tokensGenerated;
        fullResponse += result.response;

        // If no tool calls, we're done
        if (!result.toolCalls?.length) {
          break;
        }

        // Model wants to use tools — notify orchestrator
        logStatus(`Job ${jobId}: tool call round ${round + 1} — ${result.toolCalls.map(tc => tc.function.name).join(', ')}`);

        socket.emit('job:tool_call', {
          jobId,
          toolCalls: result.toolCalls,
        });

        // Append assistant's tool call message to conversation history
        messages.push({
          role: 'assistant',
          content: result.response || '',
          tool_calls: result.toolCalls,
        });

        // Wait for orchestrator to execute tools and send results back
        const toolResults = await waitForToolResults(jobId, activeJobAbort.signal);
        messages.push(...toolResults);

        // Continue the loop — model will generate with tool results
      }

      socket.emit('job:complete', {
        jobId,
        response: fullResponse,
        tokensGenerated: totalTokens,
      });
      // No local logging here: the orchestrator emits `job:counted` only for real
      // (paid) jobs, so canaries never surface on the worker terminal.
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

  // Server confirms a real, paid job completed. Canaries return early server-side
  // and never emit this, so the terminal only ever shows genuine work.
  socket.on('job:counted', (data: { jobId: string; tokensGenerated: number }) => {
    jobsCompleted++;
    logStatus(`Job complete: ${data.jobId} (${data.tokensGenerated} tokens) | Total: ${jobsCompleted}`);
  });

  // Graceful shutdown
  async function shutdown() {
    logStatus('Shutting down...');
    if (activeJobAbort) activeJobAbort.abort();
    socket.emit('worker:unregister');
    socket.disconnect();
    logStatus('Goodbye');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
