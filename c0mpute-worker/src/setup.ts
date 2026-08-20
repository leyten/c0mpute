import { spawn, execSync, execFileSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync, statSync, createWriteStream, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import os from 'os';
import {
  OLLAMA_URL,
  OLLAMA_PORT,
  OLLAMA_MODEL,
  OLLAMA_BASE_MODEL,
  SYSTEM_PROMPT,
  IS_APPLE_SILICON,
  GPU_PIN,
  PINNED,
  GPU_VRAM_MB,
  DETECTED_VRAM_MB,
  GGUF_VARIANT,
  NUM_CTX,
} from './config.js';
import {
  MODEL_LABEL,
  MLX_BASE_MODEL,
  MLX_MIN_MEMORY_GB,
  GGUF_BASE_URL,
  GGUF_VISION_FILE,
  GGUF_VISION_BYTES,
  GgufVariant,
} from './models.js';
import { checkOllama, modelExists } from './inference.js';

// Parameters baked into the custom model. Change any of these and updated
// workers automatically rebuild their local model to match — no manual
// `ollama rm` needed (see modelConfigCurrent). num_gpu is GGUF-only (#3732
// derived-model workaround; meaningless to the MLX engine). The draft/MTP
// parameter is variant-derived and lives in the Modelfile, not here: the
// variant is part of the model NAME, so it can never drift silently.
const MODEL_PARAMETERS: Record<string, number> = {
  temperature: 0.6,
  top_k: 20,
  top_p: 0.95,
  num_ctx: NUM_CTX,    // VRAM-adaptive (see pickGgufVariant / MLX_NUM_CTX)
  ...(IS_APPLE_SILICON ? {} : { num_gpu: 999 }), // Force GPU offloading — ollama bug #3732
};

/** Downloaded GGUF files live here and STAY here: a config-drift rebuild
 *  re-runs `ollama create` from these files instead of re-downloading 17GB. */
const MODELS_DIR = join(os.homedir(), '.config', 'c0mpute-worker', 'models');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// flash-attention + q8 KV cache give ~+36% generation speed and let the 27B hold
// its window on-GPU — but they're CUDA features, so we only enable them when an
// NVIDIA GPU is present (nvidia-smi worked). On Metal/AMD/CPU we leave ollama's
// defaults alone. Set C0MPUTE_MANAGE_OLLAMA=0 to opt out (e.g. if you supervise
// ollama yourself with these flags already set).
function optimalOllamaEnv(): Record<string, string> {
  const env: Record<string, string> = DETECTED_VRAM_MB > 0
    ? { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0' }
    : {};
  // A pinned worker's daemon serves only this worker, so it must bind our own
  // port — otherwise every per-GPU ollama would fight over 11434. The CUDA pin
  // itself is already in process.env and inherited by the spawn.
  if (PINNED) env.OLLAMA_HOST = `127.0.0.1:${OLLAMA_PORT}`;
  return env;
}

function stopOllama(): void {
  try {
    if (process.platform === 'win32') execSync('taskkill /F /IM ollama.exe', { stdio: 'ignore' });
    else execSync('pkill -f "ollama serve"', { stdio: 'ignore' });
  } catch { /* nothing running */ }
}

/** Per-OS download page, used in error messages when auto-install can't proceed. */
function ollamaDownloadLink(): string {
  if (process.platform === 'win32') return 'https://ollama.com/download/windows';
  if (process.platform === 'darwin') return 'https://ollama.com/download/mac';
  return 'https://ollama.com/download/linux';
}

/**
 * Locate the ollama executable. Checks PATH first, then the per-OS default
 * install location — a freshly-installed ollama often isn't on the current
 * process's PATH yet (Windows in particular won't refresh PATH until the
 * terminal is reopened). Returns the full path, or null if not found.
 */
function resolveOllamaBin(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where ollama' : 'command -v ollama';
    const found = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split('\n')[0]
      .trim();
    if (found) return found;
  } catch { /* not on PATH */ }

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
    candidates.push(join(local, 'Programs', 'Ollama', 'ollama.exe'));
    candidates.push('C:\\Program Files\\Ollama\\ollama.exe');
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/opt/homebrew/bin/ollama',
      '/usr/local/bin/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
    );
  } else {
    candidates.push(
      '/usr/local/bin/ollama',
      '/usr/bin/ollama',
      join(os.homedir(), '.ollama', 'bin', 'ollama'),
    );
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${url} → ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Auto-install ollama for the operator — the worker should be plug-and-play, not
 * make contributors hand-install dependencies. Uses winget (Windows), Homebrew
 * (macOS), or the official install.sh (Linux). Returns the resolved binary path
 * on success; throws with the correct per-OS download link if it can't.
 */
async function installOllama(): Promise<string> {
  console.log('Ollama not found — installing it for you (one-time setup)...');
  try {
    if (process.platform === 'win32') {
      let wingetOk = false;
      try {
        execSync('winget --version', { stdio: 'ignore' });
        wingetOk = true;
      } catch { /* winget unavailable */ }

      if (wingetOk) {
        execSync(
          'winget install --id Ollama.Ollama -e --silent ' +
          '--accept-package-agreements --accept-source-agreements',
          { stdio: 'inherit' },
        );
      } else {
        // No winget (older Windows) — fall back to the silent Inno Setup installer.
        const installer = join(os.tmpdir(), 'OllamaSetup.exe');
        console.log('  winget unavailable — downloading the Ollama installer...');
        await downloadFile('https://ollama.com/download/OllamaSetup.exe', installer);
        execSync(`"${installer}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`, { stdio: 'inherit' });
      }
    } else if (process.platform === 'darwin') {
      try {
        execSync('brew --version', { stdio: 'ignore' });
      } catch {
        throw new Error('Homebrew not installed');
      }
      execSync('brew install ollama', { stdio: 'inherit' });
    } else {
      // Linux — the official one-liner.
      execSync('curl -fsSL https://ollama.com/install.sh | sh', { stdio: 'inherit' });
    }
  } catch (e: any) {
    throw new Error(
      `Automatic Ollama install failed (${e?.message || e}).\n` +
      `  Please install it manually from ${ollamaDownloadLink()} and re-run the worker.`,
    );
  }

  const bin = resolveOllamaBin();
  if (!bin) {
    throw new Error(
      'Ollama installed but its binary could not be located. ' +
      `Reopen your terminal so PATH refreshes, or install from ${ollamaDownloadLink()}.`,
    );
  }
  console.log('Ollama installed.');
  return bin;
}

function spawnOllama(bin: string, env: Record<string, string>): void {
  const child = spawn(bin, ['serve'], {
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
async function ensureOllamaRunning(): Promise<void> {
  const env = optimalOllamaEnv();
  // NVIDIA-only tuning: on Metal/AMD/CPU there's nothing to restart ollama for.
  const manage = DETECTED_VRAM_MB > 0 && process.env.C0MPUTE_MANAGE_OLLAMA !== '0';
  const up = await checkOllama();

  if (up && !manage) return; // already running, nothing to tune (non-NVIDIA or opted out)

  // We need to (re)start ollama — make sure the binary exists, auto-installing it
  // if it's missing (plug-and-play: never ask the operator to hand-install).
  let bin = resolveOllamaBin();
  if (!bin) {
    if (up) {
      // Already serving but we can't find the binary to restart it for tuning —
      // just use the running instance as-is rather than reinstalling.
      console.log('Ollama is running but its path is unknown; skipping flash-attn restart.');
      return;
    }
    bin = await installOllama();
  }

  if (up && manage) {
    if (PINNED) {
      // Something already serves our port. Every `ollama serve` looks identical to
      // pkill, so we can't restart just ours — and killing them all would take the
      // sibling per-GPU workers down with it. Use what's there.
      console.log(`Ollama already serving on ${OLLAMA_URL} — using it as-is (--gpu never restarts ollama).`);
      return;
    }
    console.log('Restarting Ollama with flash-attention + q8 KV cache (NVIDIA detected)...');
    stopOllama();
    await sleep(2500);
  } else {
    console.log('Starting Ollama...');
  }

  spawnOllama(bin, env);
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    if (await checkOllama()) return;
  }
  throw new Error(
    'Could not start Ollama after installing/locating it. ' +
    `Try running "ollama serve" manually, or reinstall from ${ollamaDownloadLink()}.`
  );
}

/** Floor: Qwen3.8 arch support + RENDERER/PARSER Modelfile directives + the
 *  CUDA build that restored sm_86 (RTX 30xx silently fell back to CPU on
 *  0.32.14, ollama#17841). Anything older loads nothing and answers with bare
 *  500s — hence a plain-words check here instead of a cryptic runtime error. */
const MIN_OLLAMA = [0, 32, 15] as const;

async function checkOllamaVersion(): Promise<void> {
  let raw = '';
  try {
    const res = await fetch(`${OLLAMA_URL}/api/version`);
    raw = String((await res.json())?.version ?? '');
  } catch {
    return; // daemon hiccup — never brick the worker on the check itself
  }
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return; // dev/nightly build strings — assume new enough
  const v = [Number(m[1]), Number(m[2]), Number(m[3])];
  const tooOld =
    v[0] !== MIN_OLLAMA[0] ? v[0] < MIN_OLLAMA[0]
    : v[1] !== MIN_OLLAMA[1] ? v[1] < MIN_OLLAMA[1]
    : v[2] < MIN_OLLAMA[2];
  if (tooOld) {
    throw new Error(
      `Your ollama is too old for ${MODEL_LABEL} (found v${raw}, need v${MIN_OLLAMA.join('.')}+).\n` +
      '  Upgrade ollama, then re-run the worker:\n' +
      '    Linux:   curl -fsSL https://ollama.com/install.sh | sh\n' +
      '    macOS:   brew upgrade ollama   (or https://ollama.com/download/mac)\n' +
      '    Windows: https://ollama.com/download/windows'
    );
  }
}

/**
 * Ensure ollama is installed, running, new enough, and the c0mpute model for
 * this box (GGUF variant or MLX build) is built and ready.
 */
export async function ensureSetup(): Promise<void> {
  await ensureOllamaRunning();
  console.log('Ollama: connected');
  await checkOllamaVersion();

  if (IS_APPLE_SILICON) {
    const memGb = os.totalmem() / 2 ** 30;
    // ~19GB resident on a GPU-wired ceiling — a 24GB Mac thrashes, a 16GB one
    // won't load. Fail with the requirement, not a mid-download OOM.
    if (memGb < MLX_MIN_MEMORY_GB - 1) {
      throw new Error(
        `${MODEL_LABEL} needs a ${MLX_MIN_MEMORY_GB}GB+ unified-memory Mac (this one has ${Math.round(memGb)}GB).`
      );
    }
    console.log(`Backend: MLX (Apple Silicon) · context window: ${NUM_CTX} tokens`);
  } else if (!OLLAMA_BASE_MODEL) {
    if (!GGUF_VARIANT) {
      const seen = GPU_VRAM_MB.map((m) => `${Math.round(m / 1024)}GB`).join(' + ') || 'none';
      throw new Error(
        `Not enough VRAM for ${MODEL_LABEL} (detected: ${seen}).\n` +
        '  Minimum: a 16GB NVIDIA GPU (24GB recommended), a 24GB AMD GPU, or a 32GB+ Apple Silicon Mac.'
      );
    }
    console.log(
      `Backend: GGUF ${GGUF_VARIANT.weightsFile} · context window: ${NUM_CTX} tokens ` +
      `(detected VRAM: ${DETECTED_VRAM_MB || 'unknown'} MB)`
    );
    if (GGUF_VARIANT.key === 'split') {
      console.log('Multi-GPU layer split: noMTP build, speculative decoding off.');
    }
  }

  // Multi-GPU rigs: one worker drives ONE card (unless no card fits the model
  // alone — then a single worker splits it), so say so instead of printing one
  // card's VRAM and looking blind.
  if (GPU_PIN) {
    console.log(`GPU: pinned to CUDA_VISIBLE_DEVICES=${GPU_PIN}`);
  } else if (GPU_VRAM_MB.length > 1 && GGUF_VARIANT?.key !== 'split') {
    console.log(
      `GPUs detected: ${GPU_VRAM_MB.length} — this worker uses ONE of them. ` +
      'Start one worker per GPU (--gpu 0 ...) to use the whole rig.'
    );
  }

  const exists = await modelExists();
  if (exists) {
    if (await modelConfigCurrent()) {
      console.log(`Model: ${OLLAMA_MODEL} (ready)`);
      return;
    }
    // A newer worker version changed the model config — rebuild. GGUF rebuilds
    // reuse the files kept in MODELS_DIR; MLX rebuilds reuse the pulled base.
    console.log(`Model: ${OLLAMA_MODEL} config out of date — rebuilding...`);
    await buildModel();
    console.log(`Model: ${OLLAMA_MODEL} (rebuilt)`);
    return;
  }

  await buildModel();

  // Verify
  const verify = await modelExists();
  if (!verify) {
    throw new Error('Model creation succeeded but model not found');
  }
  console.log(`Model: ${OLLAMA_MODEL} (created)`);
}

/** Build the local c0mpute model for this box, whichever path applies. */
async function buildModel(): Promise<void> {
  if (OLLAMA_BASE_MODEL) {
    // Testing escape hatch (C0MPUTE_BASE_MODEL): the old registry-pull path.
    await pullBase(OLLAMA_BASE_MODEL);
    await createFromBase(OLLAMA_BASE_MODEL);
    return;
  }
  if (IS_APPLE_SILICON) {
    try {
      await pullBase(MLX_BASE_MODEL);
    } catch (e: any) {
      throw new Error(
        `${e?.message || e}\n` +
        `  Could not fetch the MLX build (${MLX_BASE_MODEL}).\n` +
        '  Make sure ollama is current (brew upgrade ollama) — the MLX engine ships with recent Apple Silicon builds — then re-run the worker.'
      );
    }
    await createFromBase(MLX_BASE_MODEL);
    return;
  }
  await createFromModelfile(GGUF_VARIANT!);
}

/** Pull a base model through ollama (registry or hf.co), streaming progress. */
async function pullBase(base: string): Promise<void> {
  console.log(`Pulling base model: ${base}`);
  console.log('This may take a while on first run (~17GB download)...');

  const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: base, stream: true }),
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
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.status && data.status !== lastStatus) {
            if (data.total && data.completed) {
              const pct = Math.round((data.completed / data.total) * 100);
              process.stdout.write(`\r  ${data.status}: ${pct}%`);
            } else {
              console.log(`  ${data.status}`);
            }
            lastStatus = data.status;
          } else if (data.total && data.completed) {
            const pct = Math.round((data.completed / data.total) * 100);
            process.stdout.write(`\r  ${lastStatus}: ${pct}%`);
          }
          if (data.error) {
            throw new Error(`Pull error: ${data.error}`);
          }
        } catch (e: any) {
          if (e.message?.startsWith('Pull error')) throw e;
        }
      }
    }
    console.log(''); // newline after progress
  }
}

/** Create (or overwrite) the custom model from an already-pulled base. */
async function createFromBase(base: string): Promise<void> {
  console.log(`Creating model: ${OLLAMA_MODEL}`);

  const createRes = await fetch(`${OLLAMA_URL}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      from: base,
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

/** Stream a model file to disk with a progress line. Files already present at
 *  the expected size are kept (that's what makes rebuilds free). Partial
 *  downloads land in a .part and only rename on a byte-complete body. */
async function downloadModelFile(url: string, dest: string, expectedBytes: number): Promise<void> {
  if (existsSync(dest) && statSync(dest).size === expectedBytes) return;
  const name = dest.split(/[\\/]/).pop();
  const part = `${dest}.part`;
  console.log(`Downloading ${name} (${(expectedBytes / 1e9).toFixed(1)} GB)...`);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${name} → HTTP ${res.status}`);
  }
  const total = Number(res.headers.get('content-length')) || expectedBytes;

  const out = createWriteStream(part);
  const reader = res.body.getReader();
  let got = 0;
  let lastPct = -1;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      await new Promise<void>((resolve, reject) =>
        out.write(value, (e) => (e ? reject(e) : resolve()))
      );
      const pct = Math.floor((got / total) * 100);
      if (pct !== lastPct) {
        process.stdout.write(`\r  ${name}: ${pct}%`);
        lastPct = pct;
      }
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  console.log('');

  if (got !== total) {
    try { unlinkSync(part); } catch { /* best effort */ }
    throw new Error(`Download incomplete: ${name} (${got}/${total} bytes) — re-run the worker to retry.`);
  }
  renameSync(part, dest);
}

function ggufModelfile(v: GgufVariant): string {
  const lines = [
    `FROM ./${v.weightsFile}`,
    `FROM ./${GGUF_VISION_FILE}`,
    // ollama's own Qwen3.8 chat renderer + Qwen3.5 tool-call parser: the pair
    // validated with these GGUFs. Keeps tool calls parsing (and think:"high"
    // requests working) without carrying a hand-written TEMPLATE.
    'RENDERER qwen3.8',
    'PARSER qwen3.5',
    `SYSTEM """${SYSTEM_PROMPT}"""`,
    ...Object.entries(MODEL_PARAMETERS).map(([k, val]) => `PARAMETER ${k} ${val}`),
  ];
  if (v.draft) {
    lines.push('PARAMETER draft_num_predict 4'); // in-model MTP speculative decoding
  }
  return lines.join('\n') + '\n';
}

/** Download the variant's GGUF files and assemble the model via the ollama
 *  CLI — the CLI, not /api/create, because RENDERER/PARSER only exist as
 *  Modelfile directives. */
async function createFromModelfile(v: GgufVariant): Promise<void> {
  mkdirSync(MODELS_DIR, { recursive: true });
  await downloadModelFile(`${GGUF_BASE_URL}/${v.weightsFile}`, join(MODELS_DIR, v.weightsFile), v.weightsBytes);
  await downloadModelFile(`${GGUF_BASE_URL}/${GGUF_VISION_FILE}`, join(MODELS_DIR, GGUF_VISION_FILE), GGUF_VISION_BYTES);

  const modelfilePath = join(MODELS_DIR, `Modelfile.${v.key}`);
  writeFileSync(modelfilePath, ggufModelfile(v));

  const bin = resolveOllamaBin();
  if (!bin) {
    throw new Error(
      `Ollama is running but its binary could not be located (needed for "ollama create"). Install from ${ollamaDownloadLink()} and re-run.`
    );
  }
  console.log(`Creating model: ${OLLAMA_MODEL} (${v.weightsFile})`);
  execFileSync(bin, ['create', OLLAMA_MODEL, '-f', modelfilePath], {
    stdio: ['ignore', 'inherit', 'inherit'],
    // Target this worker's daemon — a pinned worker's ollama lives on its own port.
    env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${OLLAMA_PORT}` },
  });
}

/**
 * Whether the existing model's parameters already match MODEL_PARAMETERS.
 * Reads them back via /api/show, whose `parameters` field is a newline-
 * separated "name   value" list. Compared numerically so formatting
 * differences don't trigger a needless rebuild. On any error, returns false
 * (triggering a safe rebuild — cheap, since weights stay on disk).
 */
async function modelConfigCurrent(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: OLLAMA_MODEL }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const paramStr: string = typeof data.parameters === 'string' ? data.parameters : '';

    const current: Record<string, string> = {};
    for (const line of paramStr.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const sep = trimmed.search(/\s/);
      if (sep === -1) continue;
      current[trimmed.slice(0, sep)] = trimmed.slice(sep).trim();
    }

    for (const [key, value] of Object.entries(MODEL_PARAMETERS)) {
      if (current[key] === undefined || parseFloat(current[key]) !== value) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
