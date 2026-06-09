import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { COMFY_URL, COMFY_DIR, IMAGE_MODEL_FILES, IMAGE_MODEL_NAME } from './config.js';
import { comfyOnline } from './image-inference.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Is our diffusion model registered in ComfyUI? (Read back the UNETLoader list.)
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

async function startComfy(): Promise<void> {
  if (!COMFY_DIR || !existsSync(COMFY_DIR)) {
    throw new Error(
      `ComfyUI is not running at ${COMFY_URL} and COMFY_DIR is not set.\n` +
      `Install ComfyUI and either start it (python main.py --port 8188) or set COMFY_DIR to its folder so the worker can launch it.`
    );
  }
  console.log('Starting ComfyUI...');
  const child = spawn('python3', ['main.py', '--port', new URL(COMFY_URL).port || '8188'], {
    cwd: COMFY_DIR,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    if (await comfyOnline()) return;
  }
  throw new Error('ComfyUI did not become reachable after launch.');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  let done = 0;
  let lastPct = -1;
  const out = createWriteStream(dest);
  const reader = (res.body as any).getReader ? (res.body as any) : Readable.fromWeb(res.body as any);
  // Node 18+: res.body is a web ReadableStream; pipe via Readable.fromWeb.
  await new Promise<void>((resolve, reject) => {
    const nodeStream = Readable.fromWeb(res.body as any);
    nodeStream.on('data', (chunk: Buffer) => {
      done += chunk.length;
      if (total) {
        const pct = Math.round((done / total) * 100);
        if (pct !== lastPct && pct % 5 === 0) { process.stdout.write(`\r  ${dest.split('/').pop()}: ${pct}%`); lastPct = pct; }
      }
    });
    nodeStream.pipe(out);
    out.on('finish', () => { if (total) console.log(''); resolve(); });
    out.on('error', reject);
    nodeStream.on('error', reject);
  });
  void reader;
}

async function downloadModels(): Promise<void> {
  if (!COMFY_DIR || !existsSync(COMFY_DIR)) {
    throw new Error(
      `The Chroma model files are missing and COMFY_DIR is not set, so the worker can't place them.\n` +
      `Set COMFY_DIR to your ComfyUI folder, or download these into <ComfyUI>/models/:\n` +
      IMAGE_MODEL_FILES.map((m) => `  - ${m.subdir}/${m.file}`).join('\n')
    );
  }
  console.log('Downloading Chroma1-HD model files (~14GB, first run only)...');
  for (const m of IMAGE_MODEL_FILES) {
    const dir = join(COMFY_DIR, 'models', m.subdir);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, m.file);
    if (existsSync(dest)) { console.log(`  ${m.file} (already present)`); continue; }
    await downloadFile(m.url, dest);
  }
}

/**
 * Ensure the local ComfyUI is running and the Chroma model is available. On the
 * common path (operator already runs ComfyUI with the model) this is just two
 * health checks; otherwise it starts ComfyUI and/or downloads the model files.
 */
export async function ensureImageSetup(): Promise<void> {
  if (!(await comfyOnline())) {
    await startComfy();
  }
  console.log(`ComfyUI: connected (${COMFY_URL})`);

  if (await modelPresent()) {
    console.log(`Model: ${IMAGE_MODEL_NAME} / Chroma1-HD (ready)`);
    return;
  }

  await downloadModels();
  // ComfyUI reads its model lists at startup, so restart it to pick up new files.
  console.log('Restarting ComfyUI to load the new model...');
  try {
    const { execSync } = await import('child_process');
    execSync('pkill -f "main.py" || true', { stdio: 'ignore' });
  } catch { /* ignore */ }
  await sleep(2000);
  await startComfy();

  if (!(await modelPresent())) {
    throw new Error('Downloaded the Chroma model but ComfyUI still does not list it. Check the ComfyUI models folder.');
  }
  console.log(`Model: ${IMAGE_MODEL_NAME} / Chroma1-HD (downloaded + ready)`);
}
