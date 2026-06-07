import { spawn, execSync } from 'child_process';
import { OLLAMA_URL, OLLAMA_MODEL, OLLAMA_BASE_MODEL, SYSTEM_PROMPT, } from './config.js';
import { checkOllama, modelExists } from './inference.js';
// Detect total GPU VRAM (MB) so the worker self-tunes its context window to its
// own hardware — a fixed num_ctx would OOM small cards and starve big ones.
// Returns 0 if undetectable (e.g. Apple Silicon / no nvidia-smi) → safe default.
function detectVramMB() {
    try {
        const out = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', {
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim()
            .split('\n')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !Number.isNaN(n));
        return out.length ? Math.max(...out) : 0;
    }
    catch {
        return 0;
    }
}
// Pick a safe context window for the 27B from VRAM. Weights are ~17GB (q4); the
// KV cache grows with num_ctx. Measured on a 24GB 4090: 32K fits ~19GB, 100% on
// GPU (flash-attn + q8 KV add headroom + speed but aren't required for 32K at
// f16). Smaller cards stay conservative to avoid CPU spill.
function pickNumCtx(vramMB) {
    if (vramMB >= 40000)
        return 65536; // 48GB+ cards
    if (vramMB >= 22000)
        return 32768; // 24GB cards (3090/4090)
    if (vramMB >= 18000)
        return 16384; // ~20GB, tighter
    return 8192; // small / undetectable → safe default
}
const DETECTED_VRAM_MB = detectVramMB();
const NUM_CTX = pickNumCtx(DETECTED_VRAM_MB);
// Parameters baked into the custom model. Change any of these and updated
// workers automatically rebuild their local model to match — no manual
// `ollama rm` needed (see modelConfigCurrent).
const MODEL_PARAMETERS = {
    temperature: 0.6,
    top_k: 20,
    top_p: 0.95,
    num_gpu: 999, // Force GPU offloading — ollama bug #3732: derived models lose GPU layers
    num_ctx: NUM_CTX, // VRAM-adaptive (see pickNumCtx). 24GB → 32K, verified fits ~19GB on-GPU.
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// flash-attention + q8 KV cache give ~+36% generation speed and let the 27B hold
// 32K+ context — but they're CUDA features, so we only enable them when an NVIDIA
// GPU is present (nvidia-smi worked). On Metal/AMD/CPU we leave ollama's defaults
// alone. Set C0MPUTE_MANAGE_OLLAMA=0 to opt out (e.g. if you supervise ollama
// yourself with these flags already set).
function optimalOllamaEnv() {
    return DETECTED_VRAM_MB > 0
        ? { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0' }
        : {};
}
function stopOllama() {
    try {
        if (process.platform === 'win32')
            execSync('taskkill /F /IM ollama.exe', { stdio: 'ignore' });
        else
            execSync('pkill -f "ollama serve"', { stdio: 'ignore' });
    }
    catch { /* nothing running */ }
}
function spawnOllama(env) {
    const child = spawn('ollama', ['serve'], {
        env: { ...process.env, ...env },
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
}
/**
 * Make sure ollama is running with our optimal config. On NVIDIA we (re)start it
 * so the flash-attention + q8 KV flags are guaranteed active (they can only be
 * set at server launch, not per request); elsewhere we just start it if it's
 * down. Throws with install guidance if ollama can't be reached/launched.
 */
async function ensureOllamaRunning() {
    const env = optimalOllamaEnv();
    const manage = Object.keys(env).length > 0 && process.env.C0MPUTE_MANAGE_OLLAMA !== '0';
    const up = await checkOllama();
    if (up && !manage)
        return; // already running, nothing to tune (non-NVIDIA or opted out)
    if (up && manage) {
        console.log('Restarting Ollama with flash-attention + q8 KV cache (NVIDIA detected)...');
        stopOllama();
        await sleep(2500);
    }
    else {
        console.log('Starting Ollama...');
    }
    spawnOllama(env);
    for (let i = 0; i < 40; i++) {
        await sleep(1000);
        if (await checkOllama())
            return;
    }
    throw new Error('Could not start Ollama. Install it and ensure it is on PATH:\n' +
        '  curl -fsSL https://ollama.com/install.sh | sh');
}
/**
 * Ensure ollama is installed, running, and the c0mpute-max model is available.
 */
export async function ensureSetup() {
    await ensureOllamaRunning();
    console.log('Ollama: connected');
    console.log(`Context window: ${NUM_CTX} tokens (detected VRAM: ${DETECTED_VRAM_MB || 'unknown'} MB)`);
    // Check if our custom model exists
    const exists = await modelExists();
    if (exists) {
        if (await modelConfigCurrent()) {
            console.log(`Model: ${OLLAMA_MODEL} (ready)`);
            return;
        }
        // A newer worker version changed the model config — rebuild from the
        // already-present base model (no multi-GB re-download).
        console.log(`Model: ${OLLAMA_MODEL} config out of date — rebuilding...`);
        await createModel();
        console.log(`Model: ${OLLAMA_MODEL} (rebuilt)`);
        return;
    }
    // Need to create the model — first pull the base model
    console.log(`Pulling base model: ${OLLAMA_BASE_MODEL}`);
    console.log('This may take a while on first run (~17GB download)...');
    const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: OLLAMA_BASE_MODEL, stream: true }),
    });
    if (!pullRes.ok) {
        throw new Error(`Failed to pull model: ${pullRes.status}`);
    }
    // Stream pull progress
    if (pullRes.body) {
        const reader = pullRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastStatus = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const data = JSON.parse(line);
                    if (data.status && data.status !== lastStatus) {
                        if (data.total && data.completed) {
                            const pct = Math.round((data.completed / data.total) * 100);
                            process.stdout.write(`\r  ${data.status}: ${pct}%`);
                        }
                        else {
                            console.log(`  ${data.status}`);
                        }
                        lastStatus = data.status;
                    }
                    else if (data.total && data.completed) {
                        const pct = Math.round((data.completed / data.total) * 100);
                        process.stdout.write(`\r  ${lastStatus}: ${pct}%`);
                    }
                    if (data.error) {
                        throw new Error(`Pull error: ${data.error}`);
                    }
                }
                catch (e) {
                    if (e.message?.startsWith('Pull error'))
                        throw e;
                }
            }
        }
        console.log(''); // newline after progress
    }
    // Create custom model from base model
    await createModel();
    // Verify
    const verify = await modelExists();
    if (!verify) {
        throw new Error('Model creation succeeded but model not found');
    }
    console.log(`Model: ${OLLAMA_MODEL} (created)`);
}
/** Create (or overwrite) the custom model from the base model. */
async function createModel() {
    console.log(`Creating model: ${OLLAMA_MODEL}`);
    const createRes = await fetch(`${OLLAMA_URL}/api/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            from: OLLAMA_BASE_MODEL,
            system: SYSTEM_PROMPT,
            parameters: MODEL_PARAMETERS,
            stream: false,
        }),
    });
    if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(`Failed to create model: ${text}`);
    }
}
/**
 * Whether the existing model's parameters already match MODEL_PARAMETERS.
 * Reads them back via /api/show, whose `parameters` field is a newline-
 * separated "name   value" list. Compared numerically so formatting
 * differences don't trigger a needless rebuild. On any error, returns false
 * (triggering a safe rebuild from the already-present base model).
 */
async function modelConfigCurrent() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: OLLAMA_MODEL }),
        });
        if (!res.ok)
            return false;
        const data = await res.json();
        const paramStr = typeof data.parameters === 'string' ? data.parameters : '';
        const current = {};
        for (const line of paramStr.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            const sep = trimmed.search(/\s/);
            if (sep === -1)
                continue;
            current[trimmed.slice(0, sep)] = trimmed.slice(sep).trim();
        }
        for (const [key, value] of Object.entries(MODEL_PARAMETERS)) {
            if (current[key] === undefined || parseFloat(current[key]) !== value) {
                return false;
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=setup.js.map