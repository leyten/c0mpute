#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { io } from 'socket.io-client';
import { WORKER_MODELS, DEFAULT_WORKER_MODEL, isWorkerModelKey, recommendModel } from './models.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const CONFIG_DIR = join(homedir(), '.config', 'c0mpute-worker');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
function readConfig() {
    try {
        return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function saveConfig(patch) {
    try {
        if (!existsSync(CONFIG_DIR))
            mkdirSync(CONFIG_DIR, { recursive: true });
        const merged = { ...readConfig(), ...patch };
        writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    }
    catch { /* non-fatal */ }
}
function ask(question) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
    });
}
function promptMode() {
    console.log('\nWhat should this worker run?');
    console.log('  1) Max worker      — text/chat inference (Ollama, ~17GB model)');
    console.log('  2) Image generation — text-to-image (ComfyUI + Chroma, ~14GB model)\n');
    return ask('Enter 1 or 2: ').then((a) => (a === '2' ? 'image' : 'max'));
}
// Resolve the worker mode: explicit --mode flag wins, then the saved choice,
// then an interactive first-run prompt. Don't download two models — only the
// chosen stack is set up downstream.
async function resolveMode(flag) {
    if (flag === 'max' || flag === 'image') {
        saveConfig({ mode: flag });
        return flag;
    }
    if (flag)
        throw new Error(`Invalid --mode "${flag}" (use "max" or "image").`);
    const saved = readConfig().mode;
    if (saved)
        return saved;
    if (!process.stdin.isTTY) {
        throw new Error('No mode chosen. Re-run with --mode max  or  --mode image (no interactive terminal available).');
    }
    const chosen = await promptMode();
    saveConfig({ mode: chosen });
    return chosen;
}
// Live count of active workers per model name, read from the orchestrator's
// stats broadcast (fires on connect). Returns null if it can't be reached —
// selection still works, just without the live numbers.
function fetchActiveCounts(url, token) {
    return new Promise((resolve) => {
        let done = false;
        const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 6000 });
        const finish = (v) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            try {
                socket.close();
            }
            catch { /* noop */ }
            resolve(v);
        };
        const timer = setTimeout(() => finish(null), 7000);
        socket.on('stats:update', (s) => finish((s && s.nativeByModel) || {}));
        socket.on('connect_error', () => finish(null));
    });
}
async function promptModel(url, token) {
    console.log('\nFetching live network status...');
    const counts = await fetchActiveCounts(url, token);
    const recommended = recommendModel(counts);
    const keys = Object.keys(WORKER_MODELS);
    console.log('\nWhich model should this Max worker run?');
    keys.forEach((key, i) => {
        const m = WORKER_MODELS[key];
        const active = counts ? `${counts[m.modelName] ?? 0} active` : 'active count unavailable';
        const rec = key === recommended ? '  <- recommended (fewest active)' : '';
        console.log(`  ${i + 1}) ${m.label} — ${m.note} · ${active}${rec}`);
    });
    const recIndex = keys.indexOf(recommended) + 1;
    const ans = await ask(`\nEnter 1-${keys.length} [${recIndex}]: `);
    const idx = ans === '' ? recIndex - 1 : parseInt(ans, 10) - 1;
    return keys[idx] ?? recommended;
}
// Resolve which model a Max worker runs: --model flag wins, then saved choice,
// then an interactive prompt with live counts. Headless with no choice falls
// back to the default model.
async function resolveModel(flag, url, token) {
    if (flag) {
        if (!isWorkerModelKey(flag)) {
            throw new Error(`Invalid --model "${flag}". Options: ${Object.keys(WORKER_MODELS).join(', ')}.`);
        }
        saveConfig({ model: flag });
        return flag;
    }
    const saved = readConfig().model;
    if (saved && isWorkerModelKey(saved))
        return saved;
    if (!process.stdin.isTTY) {
        console.log(`No model chosen, defaulting to ${WORKER_MODELS[DEFAULT_WORKER_MODEL].label}. Use --model to pick (${Object.keys(WORKER_MODELS).join(', ')}).`);
        return DEFAULT_WORKER_MODEL;
    }
    const chosen = await promptModel(url, token);
    saveConfig({ model: chosen });
    return chosen;
}
const program = new Command();
program
    .name('c0mpute-worker')
    .description('Native worker for the c0mpute.ai distributed inference network')
    .version(pkg.version)
    .requiredOption('--token <token>', 'Authentication token from c0mpute.ai')
    .option('--url <url>', 'Orchestrator URL', 'https://c0mpute.ai')
    .option('--mode <mode>', 'Worker mode: "max" (text) or "image" (image gen). Prompts on first run if omitted.')
    .option('--model <model>', `Max model to run: ${Object.keys(WORKER_MODELS).join(' | ')}. Prompts on first run if omitted.`)
    .option('--benchmark', 'Run benchmark only, then exit')
    .action(async (opts) => {
    console.log(`c0mpute worker v${pkg.version}`);
    try {
        const mode = await resolveMode(opts.mode);
        console.log(`Mode: ${mode === 'image' ? 'image generation' : 'max (text)'}`);
        // Max workers pick a model; wire it into the env the config module reads.
        // This MUST happen before worker.js (-> config.js) is imported, so the
        // worker is loaded dynamically below rather than at the top of the file.
        if (mode === 'max') {
            const modelKey = await resolveModel(opts.model, opts.url, opts.token);
            const spec = WORKER_MODELS[modelKey];
            process.env.C0MPUTE_OLLAMA_MODEL = spec.ollamaModel;
            process.env.C0MPUTE_BASE_MODEL = spec.baseModel;
            process.env.C0MPUTE_MODEL_NAME = spec.modelName;
            console.log(`Model: ${spec.label} (${spec.modelName})`);
        }
        const { startWorker } = await import('./worker.js');
        await startWorker({
            token: opts.token,
            orchestratorUrl: opts.url,
            benchmarkOnly: opts.benchmark || false,
            mode,
        });
    }
    catch (err) {
        console.error(`Fatal: ${err.message}`);
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map