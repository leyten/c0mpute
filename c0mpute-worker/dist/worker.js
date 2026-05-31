import { io } from 'socket.io-client';
import { DEFAULT_ORCHESTRATOR_URL, DEFAULT_MODEL_NAME, MAX_TOOL_ROUNDS } from './config.js';
import { runInference } from './inference.js';
import { ensureSetup } from './setup.js';
import { runBenchmark } from './benchmark.js';
/**
 * Main worker lifecycle: ensure ollama setup, benchmark, connect, and serve jobs.
 */
export async function startWorker(options) {
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
    const socket = io(url, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: Infinity,
    });
    let workerId = null;
    let jobsCompleted = 0;
    let activeJobAbort = null;
    function logStatus(msg) {
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
        socket.emit('worker:register', {
            model: DEFAULT_MODEL_NAME,
            authToken: token,
            tokPerSec: Math.round(tokPerSec * 10) / 10,
            type: 'native',
            capabilities: { search: true, uncensored: true, longContext: true, vision: true, tools: true },
        }, (response) => {
            if ('error' in response) {
                logStatus(`Registration failed: ${response.error}`);
                process.exit(2);
            }
            workerId = response.workerId;
            logStatus(`Registered as worker ${workerId}`);
            logStatus(`Capabilities: vision, tools, thinking, uncensored`);
            logStatus(`Status: ready | Jobs completed: ${jobsCompleted}`);
        });
    }
    /**
     * Wait for a tool result from the orchestrator.
     * Returns the tool results as ChatMessages to append to the conversation.
     */
    function waitForToolResults(jobId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                socket.off(`job:tool_result:${jobId}`);
                reject(new Error('Tool execution timed out (30s)'));
            }, 30_000);
            socket.once(`job:tool_result:${jobId}`, (data) => {
                clearTimeout(timeout);
                resolve(data.results);
            });
        });
    }
    socket.on('job:new', async (data) => {
        const { jobId, messages: initialMessages, tools, think } = data;
        logStatus(`Job received: ${jobId}${tools?.length ? ` (${tools.length} tools available)` : ''}`);
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
                const result = await runInference(messages, (token) => {
                    socket.emit('job:token', { jobId, token });
                }, activeJobAbort.signal, tools, think ?? false);
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
                const toolResults = await waitForToolResults(jobId);
                messages.push(...toolResults);
                // Continue the loop — model will generate with tool results
            }
            socket.emit('job:complete', {
                jobId,
                response: fullResponse,
                tokensGenerated: totalTokens,
            });
            jobsCompleted++;
            logStatus(`Job complete: ${jobId} (${totalTokens} tokens) | Total: ${jobsCompleted}`);
        }
        catch (err) {
            if (err.name === 'AbortError') {
                logStatus(`Job cancelled: ${jobId}`);
                return;
            }
            const message = err.message || 'Inference failed';
            logStatus(`Job error: ${jobId} - ${message}`);
            socket.emit('job:error', { jobId, error: message });
        }
        finally {
            activeJobAbort = null;
        }
    });
    socket.on('job:cancel', (data) => {
        logStatus(`Job cancel requested: ${data.jobId}`);
        if (activeJobAbort) {
            activeJobAbort.abort();
        }
    });
    // Graceful shutdown
    async function shutdown() {
        logStatus('Shutting down...');
        if (activeJobAbort)
            activeJobAbort.abort();
        socket.emit('worker:unregister');
        socket.disconnect();
        logStatus('Goodbye');
        process.exit(0);
    }
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
//# sourceMappingURL=worker.js.map