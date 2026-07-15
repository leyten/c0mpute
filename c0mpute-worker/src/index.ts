#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { io } from 'socket.io-client';
import { WORKER_MODELS, DEFAULT_WORKER_MODEL, isWorkerModelKey, recommendModel, WorkerModelKey } from './models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const CONFIG_DIR = join(homedir(), '.config', 'c0mpute-worker');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

type WorkerMode = 'max' | 'image' | 'shard';

interface SavedConfig {
  mode?: WorkerMode;
  model?: WorkerModelKey;
}

function readConfig(): SavedConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as SavedConfig;
  } catch {
    return {};
  }
}

function saveConfig(patch: SavedConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    const merged = { ...readConfig(), ...patch };
    writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  } catch { /* non-fatal */ }
}

function clearConfig(): void {
  try { if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE); } catch { /* non-fatal */ }
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
  });
}

// Prompt for the worker mode. `current` (the last saved choice) becomes the
// default — pressing Enter keeps it, so re-prompting every startup costs one
// keystroke for unchanged setups.
function promptMode(current?: WorkerMode): Promise<WorkerMode> {
  console.log('\nWhat should this worker run?');
  console.log(`  1) Max worker      — text/chat inference (Ollama, ~17GB model)${current === 'max' ? '  <- current' : ''}`);
  console.log(`  2) Image generation — text-to-image (ComfyUI + Chroma, ~14GB model)${current === 'image' ? '  <- current' : ''}`);
  console.log(`  3) Shard node       — serve a slice of a frontier model with the swarm${current === 'shard' ? '  <- current' : ''}`);
  const def = current === 'image' ? 2 : current === 'shard' ? 3 : current === 'max' ? 1 : null;
  return ask(`\nEnter 1-3${def ? ` [${def}]` : ''}: `).then((a) => {
    if (a === '' && current) return current; // Enter keeps the saved choice
    return a === '2' ? 'image' : a === '3' ? 'shard' : 'max';
  });
}

// Resolve the worker mode: explicit --mode flag wins, otherwise re-prompt on
// every interactive startup (defaulting to the last choice) so switching between
// max and image never requires the --mode flag or a reset. Headless runs (no
// TTY, e.g. pm2/systemd) reuse the saved choice silently. Don't download two
// models — only the chosen stack is set up downstream.
async function resolveMode(flag?: string): Promise<WorkerMode> {
  if (flag === 'max' || flag === 'image' || flag === 'shard') { saveConfig({ mode: flag }); return flag; }
  if (flag) throw new Error(`Invalid --mode "${flag}" (use "max", "image" or "shard").`);
  const saved = readConfig().mode;
  if (!process.stdin.isTTY) {
    if (saved) { console.log(`Using saved mode "${saved}" (no interactive terminal). Pass --mode to change.`); return saved; }
    throw new Error('No mode chosen. Re-run with --mode max, --mode image or --mode shard (no interactive terminal available).');
  }
  const chosen = await promptMode(saved);
  saveConfig({ mode: chosen });
  return chosen;
}

// Live count of active workers per model name, read from the orchestrator's
// stats broadcast (fires on connect). Returns null if it can't be reached —
// selection still works, just without the live numbers.
function fetchActiveCounts(url: string, token: string): Promise<Record<string, number> | null> {
  return new Promise((resolve) => {
    let done = false;
    const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 6000 });
    const finish = (v: Record<string, number> | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* noop */ }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), 7000);
    socket.on('stats:update', (s: any) => finish((s && s.nativeByModel) || {}));
    socket.on('connect_error', () => finish(null));
  });
}

async function promptModel(url: string, token: string, current?: WorkerModelKey): Promise<WorkerModelKey> {
  console.log('\nFetching live network status...');
  const counts = await fetchActiveCounts(url, token);
  const recommended = recommendModel(counts);
  const keys = Object.keys(WORKER_MODELS) as WorkerModelKey[];

  console.log('\nWhich model should this Max worker run?');
  keys.forEach((key, i) => {
    const m = WORKER_MODELS[key];
    const active = counts ? `${counts[m.modelName] ?? 0} active` : 'active count unavailable';
    const tags: string[] = [];
    if (key === current) tags.push('current');
    if (key === recommended) tags.push('recommended (fewest active)');
    const tag = tags.length ? `  <- ${tags.join(', ')}` : '';
    console.log(`  ${i + 1}) ${m.label} — ${m.note} · ${active}${tag}`);
  });
  // Default to the last saved choice; fall back to the recommendation on first run.
  const defKey = current ?? recommended;
  const defIndex = keys.indexOf(defKey) + 1;
  const ans = await ask(`\nEnter 1-${keys.length} [${defIndex}]: `);
  const idx = ans === '' ? defIndex - 1 : parseInt(ans, 10) - 1;
  return keys[idx] ?? defKey;
}

// Resolve which model a Max worker runs: --model flag wins, otherwise re-prompt
// on every interactive startup (defaulting to the last choice) so switching
// models never requires the --model flag or a reset. Headless runs reuse the
// saved choice, or fall back to the default model on first run.
async function resolveModel(flag: string | undefined, url: string, token: string): Promise<WorkerModelKey> {
  if (flag) {
    if (!isWorkerModelKey(flag)) {
      throw new Error(`Invalid --model "${flag}". Options: ${Object.keys(WORKER_MODELS).join(', ')}.`);
    }
    saveConfig({ model: flag });
    return flag;
  }
  const savedRaw = readConfig().model;
  const saved = savedRaw && isWorkerModelKey(savedRaw) ? savedRaw : undefined;
  if (!process.stdin.isTTY) {
    if (saved) {
      console.log(`Using saved model "${saved}" (no interactive terminal). Pass --model to change.`);
      return saved;
    }
    console.log(`No model chosen, defaulting to ${WORKER_MODELS[DEFAULT_WORKER_MODEL].label}. Use --model to pick (${Object.keys(WORKER_MODELS).join(', ')}).`);
    return DEFAULT_WORKER_MODEL;
  }
  const chosen = await promptModel(url, token, saved);
  saveConfig({ model: chosen });
  return chosen;
}

const program = new Command();

program
  .name('c0mpute-worker')
  .description('Native worker for the c0mpute.ai distributed inference network')
  .version(pkg.version)
  .option('--token <token>', 'Authentication token from c0mpute.ai')
  .option('--url <url>', 'Orchestrator URL', 'https://c0mpute.ai')
  .option('--mode <mode>', 'Worker mode: "max" (text), "image" (image gen) or "shard" (serve a model slice). Prompts on first run if omitted.')
  .option('--model <model>', `Max model to run: ${Object.keys(WORKER_MODELS).join(' | ')}. Prompts on first run if omitted.`)
  .option('--benchmark', 'Run benchmark only, then exit')
  .action(async (opts) => {
    console.log(`c0mpute worker v${pkg.version}`);

    if (!opts.token) {
      console.error('Error: --token is required. Get yours at https://c0mpute.ai (Worker tab).\nTo change a remembered mode/model, run "c0mpute-worker reset".');
      process.exit(1);
    }

    try {
      const mode = await resolveMode(opts.mode);
      console.log(`Mode: ${mode === 'image' ? 'image generation' : mode === 'shard' ? 'shard node' : 'max (text)'}`);

      // Shard mode is a long-lived node daemon (enroll -> standby -> serve), not a
      // request/response worker — it has its own lifecycle module and never touches
      // the ollama stack, so it dispatches before any model resolution.
      if (mode === 'shard') {
        if (opts.benchmark) console.log('Note: --benchmark is a max/image flag; shard mode self-measures at enroll (ignored).');
        const { startShardWorker } = await import('./shard-worker.js');
        await startShardWorker({ token: opts.token, orchestratorUrl: opts.url });
        return;
      }

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
    } catch (err: any) {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('reset')
  .description('Clear the saved worker mode/model so the next start re-prompts (e.g. to switch between max and image)')
  .action(() => {
    clearConfig();
    console.log('Saved worker config cleared. Next run will ask for mode (and model) again.');
  });

program.parse();
