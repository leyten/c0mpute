import { spawn, execSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { homedir } from 'os';
import { COMFY_URL, COMFY_DIR as COMFY_DIR_ENV, IMAGE_MODEL_FILES, IMAGE_MODEL_NAME } from './config.js';
import { comfyOnline } from './image-inference.js';

// Plug-and-play image setup: the worker fully manages ComfyUI — installs it, a
// matched-CUDA PyTorch, the Chroma model, and launches it — so `--mode image`
// is one command, exactly like the Max worker manages ollama + its model. If
// the operator already runs their own ComfyUI (COMFY_URL reachable), we use it.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Managed install location (used unless the operator points COMFY_DIR elsewhere).
const MANAGED_BASE = join(homedir(), '.c0mpute');
const COMFY_DIR = COMFY_DIR_ENV || join(MANAGED_BASE, 'ComfyUI');
const COMFY_VENV = join(MANAGED_BASE, 'comfy-venv');
const isWin = process.platform === 'win32';
const VENV_PY = isWin ? join(COMFY_VENV, 'Scripts', 'python.exe') : join(COMFY_VENV, 'bin', 'python');
const COMFY_PORT = (() => { try { return new URL(COMFY_URL).port || '8188'; } catch { return '8188'; } })();

function have(cmd: string): boolean {
  try { execSync(isWin ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}
// Run a setup command QUIETLY — suppress the tool's own stdout/stderr (pip/git
// spam) and surface only a short tail if it actually fails. Keeps the worker's
// output to clean status lines, like the Max worker.
function sh(cmd: string, cwd?: string) {
  try {
    execSync(cmd, { cwd, env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e: any) {
    const tail = (e?.stderr?.toString() || e?.message || '').trim().split('\n').slice(-3).join('\n');
    throw new Error(`setup step failed: ${tail || cmd}`);
  }
}
function hasNvidia(): boolean { try { execSync('nvidia-smi', { stdio: 'ignore' }); return true; } catch { return false; } }
function pythonCmd(): string { return have('python3') ? 'python3' : 'python'; }

// Is the Chroma diffusion model registered in ComfyUI?
async function modelPresent(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFY_URL}/object_info/UNETLoader`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const d: any = await res.json();
    const names: string[] = d?.UNETLoader?.input?.required?.unet_name?.[0] || [];
    return names.includes(IMAGE_MODEL_FILES[0].file);
  } catch {
    return false;
  }
}

// Install ComfyUI + a matched-CUDA torch + ComfyUI deps into the managed dir.
// Idempotent: each step is skipped if already done, so re-runs are cheap.
function ensureComfyInstalled(): void {
  const freshInstall = !existsSync(join(COMFY_DIR, 'main.py'));
  if (freshInstall) {
    if (!have('git')) throw new Error('git is required to set up image generation. Install git, then re-run.');
    if (!have('python3') && !have('python')) throw new Error('Python 3.10+ is required. Install Python, then re-run.');
    console.log('Setting up image generation — one-time install, this takes a few minutes.');
    mkdirSync(MANAGED_BASE, { recursive: true });
    process.stdout.write('  Installing ComfyUI… ');
    sh(`git clone --depth 1 https://github.com/comfyanonymous/ComfyUI "${COMFY_DIR}"`);
    console.log('done');
  }
  if (!existsSync(VENV_PY)) {
    process.stdout.write('  Creating environment… ');
    sh(`${pythonCmd()} -m venv "${COMFY_VENV}"`);
    console.log('done');
  }
  let torchOk = false;
  try { execSync(`"${VENV_PY}" -c "import torch"`, { stdio: 'ignore' }); torchOk = true; } catch {}
  if (!torchOk) {
    const nv = hasNvidia();
    if (!nv) console.warn('  No NVIDIA GPU detected — installing CPU PyTorch (image generation will be slow without a GPU).');
    process.stdout.write(`  Installing PyTorch${nv ? ' (CUDA)' : ' (CPU)'}… `);
    sh(`"${VENV_PY}" -m pip install --quiet --upgrade pip`);
    const idx = nv ? ' --index-url https://download.pytorch.org/whl/cu124' : '';
    sh(`"${VENV_PY}" -m pip install --quiet torch torchvision torchaudio${idx}`);
    console.log('done');
  }
  process.stdout.write('  Installing dependencies… ');
  sh(`"${VENV_PY}" -m pip install --quiet -r "${join(COMFY_DIR, 'requirements.txt')}"`);
  console.log('done');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  let done = 0, lastPct = -1;
  const out = createWriteStream(dest);
  await new Promise<void>((resolve, reject) => {
    const nodeStream = Readable.fromWeb(res.body as any);
    nodeStream.on('data', (chunk: Buffer) => {
      done += chunk.length;
      if (total) { const pct = Math.round((done / total) * 100); if (pct !== lastPct && pct % 5 === 0) { process.stdout.write(`\r  ${dest.split(/[\\/]/).pop()}: ${pct}%`); lastPct = pct; } }
    });
    nodeStream.pipe(out);
    out.on('finish', () => { if (total) console.log(''); resolve(); });
    out.on('error', reject);
    nodeStream.on('error', reject);
  });
}

async function ensureModels(): Promise<void> {
  for (const m of IMAGE_MODEL_FILES) {
    const dir = join(COMFY_DIR, 'models', m.subdir);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, m.file);
    if (existsSync(dest)) { console.log(`  ${m.file} (present)`); continue; }
    console.log(`Downloading ${m.file} (first run)…`);
    await downloadFile(m.url, dest);
  }
}

async function startComfy(): Promise<void> {
  const py = existsSync(VENV_PY) ? VENV_PY : pythonCmd();
  console.log('Starting ComfyUI…');
  const child = spawn(py, ['main.py', '--port', COMFY_PORT], { cwd: COMFY_DIR, detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await comfyOnline()) return; }
  throw new Error('ComfyUI did not become reachable after launch. See its logs in ' + COMFY_DIR);
}

/**
 * Ensure ComfyUI + the Chroma model are running. Plug-and-play: if nothing is
 * running, the worker installs and launches everything itself.
 */
export async function ensureImageSetup(): Promise<void> {
  // Operator already runs their own ComfyUI — use it (don't touch their setup).
  if (await comfyOnline()) {
    console.log(`ComfyUI: connected (${COMFY_URL})`);
    if (await modelPresent()) { console.log(`Model: ${IMAGE_MODEL_NAME} / Chroma1-HD (ready)`); return; }
    throw new Error(
      `ComfyUI is running at ${COMFY_URL} but the Chroma model isn't installed there.\n` +
      `Add these under <ComfyUI>/models/, or stop that ComfyUI and let the worker manage its own:\n` +
      IMAGE_MODEL_FILES.map((m) => `  - ${m.subdir}/${m.file}`).join('\n')
    );
  }

  // Nothing running — full managed install.
  ensureComfyInstalled();
  await ensureModels();
  await startComfy();
  console.log(`ComfyUI: connected (${COMFY_URL})`);
  if (!(await modelPresent())) throw new Error('ComfyUI started but does not list the Chroma model. Check ' + COMFY_DIR + '/models.');
  console.log(`Model: ${IMAGE_MODEL_NAME} / Chroma1-HD (ready)`);
}
