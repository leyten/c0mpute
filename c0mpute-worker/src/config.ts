/** Default orchestrator URL */
export const DEFAULT_ORCHESTRATOR_URL = 'https://c0mpute.ai';

/** Ollama API base URL */
export const OLLAMA_URL = 'http://127.0.0.1:11434';

// A worker runs one model. The CLI picks the model and sets these env vars
// before this module loads (see index.ts); when unset we fall back to the
// registry default (Qwen3.5 27B). The model name must match a workerModel in the
// orchestrator's MODEL_CATALOG so jobs route here.
import { WORKER_MODELS, DEFAULT_WORKER_MODEL } from './models.js';

const defaultModel = WORKER_MODELS[DEFAULT_WORKER_MODEL];

/** Ollama model name (custom model created from Modelfile). */
export const OLLAMA_MODEL = process.env.C0MPUTE_OLLAMA_MODEL || defaultModel.ollamaModel;

/** Base model to pull from ollama registry. */
export const OLLAMA_BASE_MODEL = process.env.C0MPUTE_BASE_MODEL || defaultModel.baseModel;

/** Human-readable model name sent to orchestrator (the catalog routing key). */
export const DEFAULT_MODEL_NAME = process.env.C0MPUTE_MODEL_NAME || defaultModel.modelName;

/** Number of tokens to generate during benchmark */
export const BENCHMARK_TOKENS = 64;

/** Minimum tok/s to register with orchestrator */
export const MIN_TOK_PER_SEC = 2;

/** Maximum output tokens per job */
export const MAX_OUTPUT_TOKENS = 4096;

/** Larger budget when thinking is on — reasoning + final answer must both fit */
export const MAX_OUTPUT_TOKENS_THINKING = 8192;

/** Maximum tool call rounds per job (prevents infinite loops) */
export const MAX_TOOL_ROUNDS = 5;

/** System prompt baked into the model */
export const SYSTEM_PROMPT = 'You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.';



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
