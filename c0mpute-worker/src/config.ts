/** Default orchestrator URL */
export const DEFAULT_ORCHESTRATOR_URL = 'https://c0mpute.ai';

/** Port of the ollama this worker talks to. Default is ollama's own 11434; a
 *  worker pinned to one GPU (`--gpu N`) runs its own daemon on 11434+N so a
 *  multi-GPU rig can host one worker per card. The CLI puts the port in the env
 *  before this module loads (see index.ts). */
export const OLLAMA_PORT = Number(process.env.C0MPUTE_OLLAMA_PORT) || 11434;

/** Ollama API base URL */
export const OLLAMA_URL = `http://127.0.0.1:${OLLAMA_PORT}`;

// A worker runs THE model — Qwen3.8 27B Uncensored, the network's single
// public model. Which build it runs is platform-derived here, once, so every
// module (setup, inference, registration) sees the same picture:
// Apple Silicon → the GGUF noMTP build on Metal; everything else → a GGUF
// variant picked from VRAM (see models.ts).
import { MODEL_NAME, METAL, pickGgufVariant, GgufVariant } from './models.js';
import { detectGpuVramMB } from './gpus.js';

export const IS_APPLE_SILICON = process.platform === 'darwin' && process.arch === 'arm64';

/** The GPU this worker is pinned to, if any (`--gpu N` sets CUDA_VISIBLE_DEVICES,
 *  which is what actually restricts the ollama we spawn to that one card). */
export const GPU_PIN = (process.env.CUDA_VISIBLE_DEVICES || '').trim();

/** This worker owns a private per-GPU ollama (set by `--gpu`), rather than sharing
 *  the box-wide daemon on 11434. Pinned workers must never pkill their siblings. */
export const PINNED = !!process.env.C0MPUTE_OLLAMA_PORT;

/** VRAM of every GPU this worker may use — the pinned card when `--gpu` is set,
 *  the whole box otherwise. Empty if undetectable → variant falls back safe. */
export const GPU_VRAM_MB = IS_APPLE_SILICON ? [] : detectGpuVramMB(GPU_PIN);

/** Largest single card — what an unsplit model actually lands on. */
export const DETECTED_VRAM_MB = GPU_VRAM_MB.length ? Math.max(...GPU_VRAM_MB) : 0;

/** GGUF variant for this box (the Metal build on Apple Silicon; null when the
 *  detected VRAM is under the floor, which ensureSetup turns into a plain
 *  hardware-requirements error before anything downloads). */
export const GGUF_VARIANT: GgufVariant | null =
  IS_APPLE_SILICON ? METAL : pickGgufVariant(GPU_VRAM_MB);

/** The context window this worker actually runs with — baked into the model
 *  (and rebuilt if it ever drifts, see setup.ts), so it's the effective
 *  window, not an intent. Reported at registration. */
export const NUM_CTX = GGUF_VARIANT?.numCtx ?? 8192;

/** Local ollama model name (the custom model setup.ts builds). Variant- AND
 *  ctx-suffixed: per-GPU workers share ~/.ollama, and two cards that agree on
 *  the quant but not the window (24GB + 48GB both land on q4km) would
 *  otherwise rebuild one name back and forth forever — each round a full
 *  multi-minute GGUF re-import. */
export const OLLAMA_MODEL = process.env.C0MPUTE_OLLAMA_MODEL
  || `compute-qwen38-${GGUF_VARIANT?.key ?? 'q4km'}-${(GGUF_VARIANT?.numCtx ?? 8192) / 1024}k`;

/** Escape hatch for testing: when set, setup skips the packaged GGUF build
 *  and takes the old pull-a-registry-base + create path with this base. */
export const OLLAMA_BASE_MODEL = process.env.C0MPUTE_BASE_MODEL || '';

/** Model name sent to orchestrator (the catalog routing key). */
export const DEFAULT_MODEL_NAME = process.env.C0MPUTE_MODEL_NAME || MODEL_NAME;

/**
 * How long ollama keeps the model resident in VRAM after a request. Default -1 =
 * stay loaded for as long as ollama runs, so an idle worker doesn't get its model
 * evicted (which makes the next job pay a slow cold reload, ~20s on a 27B). Sent
 * on every inference + the warmup so the model is pinned from startup on. Override
 * with C0MPUTE_KEEP_ALIVE (an ollama duration like "30m", or a number of seconds,
 * or "-1"). Passed per-request so it works on every platform, including a Mac
 * ollama daemon we don't restart.
 */
export const KEEP_ALIVE: number | string = (() => {
  const raw = process.env.C0MPUTE_KEEP_ALIVE;
  if (raw === undefined || raw === '') return -1;
  // numeric (incl. -1) → number of seconds; anything else → ollama duration string
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
})();

/** Number of tokens to generate during benchmark */
export const BENCHMARK_TOKENS = 64;

/** Minimum tok/s to serve. Matches the orchestrator's own registration floor —
 *  a lower local floor just moves the same rejection one network round-trip
 *  later and turns it into an exit(2) restart loop. */
export const MIN_TOK_PER_SEC = 5;

/** Maximum output tokens per job */
export const MAX_OUTPUT_TOKENS = 4096;

/** Larger budget when thinking is on — reasoning + final answer must both fit */
export const MAX_OUTPUT_TOKENS_THINKING = 8192;

/** Maximum tool call rounds per job (prevents infinite loops) */
export const MAX_TOOL_ROUNDS = 5;

/** System prompt baked into the model. The model identifies as itself — the
 *  product sells the model under its real name, on Compute Network; no
 *  invented assistant persona. (Jobs normally carry the orchestrator's richer
 *  injected prompt; this is the local fallback.) */
export const SYSTEM_PROMPT = 'You are Qwen3.8 27B Uncensored, served on Compute Network (compute.tech), a decentralized inference network. Be direct and concise. Always respond in English. Do not use emojis.';



// ─────────────────────────────────────────────────────────────────────────
// Image generation mode (decentralized image gen). A worker runs EITHER as a
// Max text worker (above) OR as an image worker — never both — chosen on first
// run. Image workers run ComfyUI + the Chroma1-HD model and execute the
// workflow the orchestrator hands them.
// ─────────────────────────────────────────────────────────────────────────

/** Model name an image worker advertises to the orchestrator. */
export const IMAGE_MODEL_NAME = 'c0mpute-image';

/** Local ComfyUI HTTP endpoint the image worker drives. */
export const COMFY_URL = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');

/** ComfyUI install dir (for starting it + placing model files). */
export const COMFY_DIR = process.env.COMFY_DIR || '';

/** Per-render timeout (ms). */
export const IMAGE_GEN_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 150_000);

/** The three model files an image worker needs, with download sources.
 *  subdir is relative to <ComfyUI>/models/. All fp8 to fit a 24GB card + disk. */
export const IMAGE_MODEL_FILES: { subdir: string; file: string; url: string }[] = [
  {
    subdir: 'diffusion_models',
    file: 'Chroma1-HD-fp8mixed.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Chroma1-HD_repackaged/resolve/main/split_files/diffusion_models/Chroma1-HD-fp8mixed.safetensors',
  },
  {
    subdir: 'text_encoders',
    file: 't5xxl_flan_fp8_scaled.safetensors',
    url: 'https://huggingface.co/silveroxides/t5xxl_flan_enc/resolve/main/t5xxl_flan_fp8_scaled.safetensors',
  },
  {
    subdir: 'vae',
    file: 'ae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/vae/ae.safetensors',
  },
];
