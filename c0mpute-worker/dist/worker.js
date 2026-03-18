import { io } from 'socket.io-client';
import { DEFAULT_ORCHESTRATOR_URL, DEFAULT_MODEL_NAME } from './config.js';
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
            capabilities: { search: true, uncensored: true, longContext: true },
        }, (response) => {
            if ('error' in response) {
                logStatus(`Registration failed: ${response.error}`);
                process.exit(2);
            }
            workerId = response.workerId;
            logStatus(`Registered as worker ${workerId}`);
            logStatus(`Status: ready | Jobs completed: ${jobsCompleted}`);
        });
    }
    socket.on('job:new', async (data) => {
        const { jobId, messages } = data;
        logStatus(`Job received: ${jobId}`);
        if (!messages || messages.length === 0) {
            socket.emit('job:error', { jobId, error: 'No messages provided' });
            return;
        }
        activeJobAbort = new AbortController();
        try {
            const result = await runInference(messages, (token) => {
                socket.emit('job:token', { jobId, token });
            }, activeJobAbort.signal);
            socket.emit('job:complete', {
                jobId,
                response: result.response,
                tokensGenerated: result.tokensGenerated,
            });
            jobsCompleted++;
            logStatus(`Job complete: ${jobId} (${result.tokensGenerated} tokens) | Total: ${jobsCompleted}`);
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