#!/usr/bin/env node

import { Command } from 'commander';
import { startWorker } from './worker.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const CONFIG_DIR = join(homedir(), '.config', 'c0mpute-worker');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function readSavedMode(): 'max' | 'image' | null {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return cfg.mode === 'max' || cfg.mode === 'image' ? cfg.mode : null;
  } catch {
    return null;
  }
}

function saveMode(mode: 'max' | 'image'): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify({ mode }, null, 2));
  } catch { /* non-fatal */ }
}

function promptMode(): Promise<'max' | 'image'> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nWhat should this worker run?');
    console.log('  1) Max worker      — text/chat inference (Ollama, ~17GB model)');
    console.log('  2) Image generation — text-to-image (ComfyUI + Chroma, ~14GB model)\n');
    rl.question('Enter 1 or 2: ', (ans) => {
      rl.close();
      resolve(ans.trim() === '2' ? 'image' : 'max');
    });
  });
}

// Resolve the worker mode: explicit --mode flag wins, then the saved choice,
// then an interactive first-run prompt. Don't download two models — only the
// chosen stack is set up downstream.
async function resolveMode(flag?: string): Promise<'max' | 'image'> {
  if (flag === 'max' || flag === 'image') { saveMode(flag); return flag; }
  if (flag) throw new Error(`Invalid --mode "${flag}" (use "max" or "image").`);
  const saved = readSavedMode();
  if (saved) return saved;
  if (!process.stdin.isTTY) {
    throw new Error('No mode chosen. Re-run with --mode max  or  --mode image (no interactive terminal available).');
  }
  const chosen = await promptMode();
  saveMode(chosen);
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
  .option('--benchmark', 'Run benchmark only, then exit')
  .action(async (opts) => {
    console.log(`c0mpute worker v${pkg.version}`);

    try {
      const mode = await resolveMode(opts.mode);
      console.log(`Mode: ${mode === 'image' ? 'image generation' : 'max (text)'}`);
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

program.parse();
