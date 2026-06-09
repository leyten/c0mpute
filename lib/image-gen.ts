// Image generation backend client.
//
// MVP (single-worker): this talks DIRECTLY to a ComfyUI instance over HTTP
// (COMFY_URL), running an uncensored SDXL/Pony/Flux checkpoint on one GPU. This
// is the fastest path to something showable. The decentralized path (route
// image jobs through the orchestrator to contributor GPUs) is a later step and
// can reuse everything below — only the transport changes.
//
// ComfyUI API used: POST /prompt {prompt: <graph>, client_id} -> {prompt_id};
// poll GET /history/{prompt_id} until outputs appear; GET /view?filename=...
// returns the PNG bytes.

import { randomUUID } from 'crypto';

export const IMAGE_CREDITS = Number(process.env.IMAGE_CREDITS || 20); // $0.20 at 1 credit = $0.01
export const COMFY_URL = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
// Chroma1-HD (Flux-schnell-derived) is a 3-file model: the diffusion UNet, a T5
// text encoder, and the Flux VAE. Unlike SDXL there is no all-in-one checkpoint.
const CHROMA_UNET = process.env.CHROMA_UNET || 'Chroma1-HD-fp8mixed.safetensors';
const CHROMA_T5 = process.env.CHROMA_T5 || 't5xxl_flan_fp8_scaled.safetensors';
const CHROMA_VAE = process.env.CHROMA_VAE || 'ae.safetensors';
const GEN_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 120_000);

export const IMAGE_MODEL_ID = 'c0mpute-image';

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
}

// Clamp user-supplied dims/steps to sane bounds so a request can't ask the GPU
// for an 8k 150-step job.
function clampDim(v: number | undefined, def: number): number {
  const n = Math.round(Number(v) || def);
  if (!Number.isFinite(n)) return def;
  return Math.min(1536, Math.max(512, Math.round(n / 64) * 64));
}

// Build a Chroma1-HD txt2img graph for ComfyUI. Chroma uses the Flux sampling
// stack: UNETLoader + T5-only CLIPLoader (type "chroma") + Flux VAE, driven by
// SamplerCustomAdvanced (RandomNoise + CFGGuider + KSamplerSelect + a Beta
// scheduler), not SDXL's single KSampler node.
// Baseline negative prompt, always applied (web + API). These are universal
// "AI slop" artifacts nobody wants — oversaturation, heavy vignette, plastic
// skin, the deep-fried over-processed look. Medium-specific negatives (cgi/3d/
// cartoon vs photo) are added per style preset on the client, not here.
const BASE_NEGATIVE =
  'oversaturated, hdr, heavy vignette, dark corners, excessive bokeh, plastic skin, ' +
  'overprocessed, deep fried, airbrushed, blurry, low quality, jpeg artifacts, watermark, text, extra limbs, deformed';

function buildWorkflow(p: GenerateParams) {
  const width = clampDim(p.width, 1024);
  const height = clampDim(p.height, 1024);
  const steps = Math.min(60, Math.max(10, Math.round(Number(p.steps) || 32)));
  // Chroma wants low guidance (~3.5-4.5); much above ~6 fries the image.
  const cfg = Math.min(15, Math.max(1, Number(p.cfg) || 4.0));
  const seed = Number.isFinite(Number(p.seed)) && Number(p.seed) > 0
    ? Math.floor(Number(p.seed))
    : Math.floor(Math.abs(hashSeed(p.prompt + ':' + randomUUID())));
  // Always fold the baseline anti-slop terms into the negative.
  const negative = [BASE_NEGATIVE, (p.negativePrompt || '').trim()].filter(Boolean).join(', ');

  return {
    '10': { class_type: 'UNETLoader', inputs: { unet_name: CHROMA_UNET, weight_dtype: 'default' } },
    '11': { class_type: 'CLIPLoader', inputs: { clip_name: CHROMA_T5, type: 'chroma' } },
    '12': { class_type: 'VAELoader', inputs: { vae_name: CHROMA_VAE } },
    '13': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['10', 0], shift: 1.0 } },
    '14': { class_type: 'CLIPTextEncode', inputs: { text: p.prompt, clip: ['11', 0] } },
    '15': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['11', 0] } },
    '16': { class_type: 'CFGGuider', inputs: { model: ['13', 0], positive: ['14', 0], negative: ['15', 0], cfg } },
    '17': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '18': { class_type: 'BetaSamplingScheduler', inputs: { model: ['13', 0], steps, alpha: 0.45, beta: 0.45 } },
    '19': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    '20': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '21': {
      class_type: 'SamplerCustomAdvanced',
      inputs: { noise: ['20', 0], guider: ['16', 0], sampler: ['17', 0], sigmas: ['18', 0], latent_image: ['19', 0] },
    },
    '22': { class_type: 'VAEDecode', inputs: { samples: ['21', 0], vae: ['12', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'c0mpute', images: ['22', 0] } },
  };
}

// Deterministic 31-bit-ish seed from a string (no Math.random dependency).
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2_000_000_000;
}

async function jget(path: string): Promise<any> {
  const res = await fetch(`${COMFY_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ComfyUI GET ${path} -> ${res.status}`);
  return res.json();
}

export interface GenerateResult {
  png: Buffer;
  seed: number;
  width: number;
  height: number;
}

// Generate one image. Throws on backend/timeout errors (the API route maps
// these to HTTP + refunds credits).
export async function generateImage(params: GenerateParams): Promise<GenerateResult> {
  const clientId = randomUUID();
  const workflow = buildWorkflow(params);

  // Submit.
  const submit = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!submit.ok) {
    const t = await submit.text().catch(() => '');
    throw new Error(`ComfyUI rejected workflow (${submit.status}): ${t.slice(0, 300)}`);
  }
  const { prompt_id: promptId } = await submit.json();
  if (!promptId) throw new Error('ComfyUI did not return a prompt_id.');

  // Poll history until this prompt has outputs.
  const deadline = Date.now() + GEN_TIMEOUT_MS;
  let outputs: any = null;
  while (Date.now() < deadline) {
    await sleep(1000);
    let hist: any;
    try {
      hist = await jget(`/history/${promptId}`);
    } catch {
      continue;
    }
    const entry = hist?.[promptId];
    if (entry?.outputs) { outputs = entry.outputs; break; }
    if (entry?.status?.status_str === 'error') {
      throw new Error('ComfyUI reported an execution error for this job.');
    }
  }
  if (!outputs) throw new Error('Image generation timed out.');

  // Find the SaveImage output.
  let image: { filename: string; subfolder: string; type: string } | null = null;
  for (const nodeId of Object.keys(outputs)) {
    const imgs = outputs[nodeId]?.images;
    if (Array.isArray(imgs) && imgs.length) { image = imgs[0]; break; }
  }
  if (!image) throw new Error('No image in ComfyUI output.');

  const q = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
  const view = await fetch(`${COMFY_URL}/view?${q.toString()}`, { cache: 'no-store' });
  if (!view.ok) throw new Error(`ComfyUI /view -> ${view.status}`);
  const png = Buffer.from(await view.arrayBuffer());

  const width = clampDim(params.width, 1024);
  const height = clampDim(params.height, 1024);
  const seed = (workflow as any)['20'].inputs.noise_seed; // RandomNoise node
  return { png, seed, width, height };
}

// Quick reachability probe for the /models + status surfaces.
export async function imageBackendOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
