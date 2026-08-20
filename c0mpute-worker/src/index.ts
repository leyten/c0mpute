#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { MODEL_NAME, MODEL_LABEL, APPROX_DOWNLOAD_GB } from './models.js';
import { listGpuIndexes, queryVramMB } from './gpus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const CONFIG_DIR = join(homedir(), '.config', 'c0mpute-worker');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// 'max' is the historical name for the text/LLM mode — kept as the stored
// value so configs saved by 2.8.x keep working headless after an upgrade.
type WorkerMode = 'max' | 'image';

interface SavedConfig {
  mode?: WorkerMode;
}

function readConfig(): SavedConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as SavedConfig;
  } catch {
    return {};
  }
}

function saveConfig(patch: SavedConfig): void {
  // Supervisor children are told their mode on the command line; the parent
  // already saved the operator's choice, and eight children rewriting one
  // config file at once is only a way to corrupt it.
  if (process.env.C0MPUTE_GPU_CHILD === '1') return;
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
  console.log(`  1) Qwen worker  — text/chat LLM (${MODEL_LABEL}, ~${APPROX_DOWNLOAD_GB}GB)${current === 'max' ? '  <- current' : ''}`);
  console.log(`  2) Image worker — text-to-image (ComfyUI + Chroma, ~14GB model)${current === 'image' ? '  <- current' : ''}`);
  const def = current === 'image' ? 2 : current === 'max' ? 1 : null;
  return ask(`\nEnter 1-2${def ? ` [${def}]` : ''}: `).then((a) => {
    if (a === '' && current) return current; // Enter keeps the saved choice
    return a === '2' ? 'image' : 'max';
  });
}

// Resolve the worker mode: explicit --mode flag wins, otherwise re-prompt on
// every interactive startup (defaulting to the last choice) so switching between
// the Qwen and image workers never requires the --mode flag or a reset. Headless
// runs (no TTY, e.g. pm2/systemd) reuse the saved choice silently. Don't
// download two models — only the chosen stack is set up downstream.
async function resolveMode(flag?: string): Promise<WorkerMode> {
  if (flag === 'max' || flag === 'image') { saveConfig({ mode: flag }); return flag; }
  if (flag) throw new Error(`Invalid --mode "${flag}" (use "max" or "image").`);
  const saved = readConfig().mode;
  if (!process.stdin.isTTY) {
    if (saved) { console.log(`Using saved mode "${saved}" (no interactive terminal). Pass --mode to change.`); return saved; }
    throw new Error('No mode chosen. Re-run with --mode max or --mode image (no interactive terminal available).');
  }
  const chosen = await promptMode(saved);
  saveConfig({ mode: chosen });
  return chosen;
}

/** Highest card index we run: each one owns ollama's port 11434+index. */
const MAX_GPU_INDEX = 15;

/** Minimum VRAM for one card to run its own worker (the 16GB/IQ4_XS floor —
 *  must stay in step with pickGgufVariant's ladder in models.ts). */
const MIN_SOLO_VRAM_MB = 15500;

// Which GPUs this invocation drives. `--gpu` names them explicitly (one index or
// a comma list); without it, a rig with more than one capable card takes them
// all — one worker per GPU, since a card that fits the model shouldn't share.
// An EMPTY list means "pin nothing", which is the classic single-daemon path a
// one-GPU or non-NVIDIA box has always taken — and, new in 2.9.0, also the path
// for rigs where NO card can hold the model alone: a single unpinned worker
// lets ollama layer-split it across the cards (setup picks the noMTP build).
function resolveGpus(flag: string | undefined, benchmarkOnly: boolean): number[] {
  if (flag !== undefined) {
    const list = flag.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    if (!list.length || list.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_GPU_INDEX)) {
      throw new Error(`Invalid --gpu "${flag}" (expected GPU indexes 0-${MAX_GPU_INDEX}, e.g. --gpu 0 or --gpu 0,2,5).`);
    }
    const pins = [...new Set(list)];
    if (benchmarkOnly && pins.length > 1) {
      console.log(`Note: --benchmark measures one card; using GPU ${pins[0]}.`);
      return [pins[0]];
    }
    return pins;
  }
  // --benchmark is a one-shot diagnostic, not a deployment: measure this box once
  // rather than fanning out into children that would each exit and be restarted.
  if (benchmarkOnly) return [];
  const all = listGpuIndexes();
  if (all.length < 2) return []; // one card or no NVIDIA GPU — nothing changes
  const vram = queryVramMB('');
  if (vram.length !== all.length) {
    // VRAM unreadable — can't filter, so take every card like 2.8.x did.
    const gpus = all.filter((n) => n <= MAX_GPU_INDEX);
    console.log(`${gpus.length} GPUs detected — starting one worker per GPU (use --gpu <n> to run a single card).`);
    return gpus;
  }
  const solo = all.filter((_, i) => vram[i] >= MIN_SOLO_VRAM_MB);
  if (!solo.length) {
    console.log(`${all.length} GPUs detected, none with enough VRAM to run ${MODEL_LABEL} alone — running one worker split across the cards.`);
    return [];
  }
  if (solo.length < all.length) {
    console.log(`${all.length} GPUs detected, ${solo.length} with enough VRAM for a worker — skipping GPU ${all.filter((n) => !solo.includes(n)).join(', ')}.`);
  }
  // Each card gets a private ollama on 11434+index, so the same ceiling the flag
  // enforces applies here — never auto-spawn a child whose own --gpu we'd reject.
  const gpus = solo.filter((n) => n <= MAX_GPU_INDEX);
  if (gpus.length < solo.length) {
    console.log(`Using the first ${gpus.length} (--gpu supports indexes 0-${MAX_GPU_INDEX}).`);
  } else if (gpus.length > 1 && solo.length === all.length) {
    console.log(`${gpus.length} GPUs detected — starting one worker per GPU (use --gpu <n> to run a single card).`);
  }
  return gpus;
}

const program = new Command();

program
  .name('c0mpute-worker')
  .description('Native worker for the c0mpute.ai distributed inference network')
  .version(pkg.version)
  .option('--token <token>', 'Authentication token from c0mpute.ai')
  .option('--url <url>', 'Orchestrator URL', 'https://c0mpute.ai')
  .option('--mode <mode>', 'Worker mode: "max" (text/LLM) or "image" (image gen). Prompts on first run if omitted.')
  .option('--model <model>', `Deprecated: the network runs a single model (${MODEL_NAME}); ignored.`)
  .option('--gpu <indexes>', 'Text mode: run only these GPUs — one index (--gpu 3) or a comma list (--gpu 0,2,5). Omitted, a multi-GPU rig runs every capable card, one worker each.')
  .option('--benchmark', 'Run benchmark only, then exit')
  .action(async (opts) => {
    console.log(`c0mpute worker v${pkg.version}`);

    if (!opts.token) {
      console.error('Error: --token is required. Get yours at https://c0mpute.ai (Worker tab).\nTo change a remembered mode, run "c0mpute-worker reset".');
      process.exit(1);
    }

    try {
      const mode = await resolveMode(opts.mode);
      console.log(`Mode: ${mode === 'image' ? 'image generation' : 'Qwen (text)'}`);

      if (opts.model) {
        console.log(`Note: --model is deprecated — every text worker now serves ${MODEL_LABEL}.`);
      }
      if (opts.gpu !== undefined && mode !== 'max') {
        console.log('Note: --gpu is a text-mode flag (per-GPU ollama); ignored in this mode.');
      }

      if (mode === 'max') {
        const gpus = resolveGpus(opts.gpu, opts.benchmark);

        // More than one card: this process becomes a supervisor and runs a child
        // per GPU through the single-card path below. Mode is already resolved,
        // so the interactive prompt happens exactly once, here.
        if (gpus.length > 1) {
          console.log(`Model: ${MODEL_LABEL} (${MODEL_NAME})`);
          const { startGpuSupervisor } = await import('./supervisor.js');
          startGpuSupervisor({ gpus, token: opts.token, url: opts.url });
          return;
        }

        // One card: pin it. CUDA_VISIBLE_DEVICES restricts the ollama we spawn to
        // that GPU, and the port offset gives this worker its own daemon instead
        // of one shared 11434 the siblings would fight over. This MUST happen
        // before worker.js (-> config.js) is imported, so the worker is loaded
        // dynamically below rather than at the top of the file.
        if (gpus.length === 1) {
          const gpu = gpus[0];
          // CUDA numbers devices fastest-first by default while nvidia-smi (and so
          // our --gpu index and our VRAM query) numbers them by PCI bus, which can
          // select different cards on a mixed rig. Make the two agree, unless the
          // operator has already chosen an order.
          if (!process.env.CUDA_DEVICE_ORDER) process.env.CUDA_DEVICE_ORDER = 'PCI_BUS_ID';
          process.env.CUDA_VISIBLE_DEVICES = String(gpu);
          process.env.C0MPUTE_OLLAMA_PORT = String(11434 + gpu);
          console.log(`GPU: pinned to GPU ${gpu} (private ollama on port ${11434 + gpu})`);
        }

        console.log(`Model: ${MODEL_LABEL} (${MODEL_NAME})`);
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
  .description('Clear the saved worker mode so the next start re-prompts (e.g. to switch between text and image)')
  .action(() => {
    clearConfig();
    console.log('Saved worker config cleared. Next run will ask for the mode again.');
  });

program.parse();
