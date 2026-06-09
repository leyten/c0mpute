import { IMAGE_MODEL_FILES } from './config.js';
import { runImageJob } from './image-inference.js';

// Render self-check: a small, fast Chroma render the worker runs against its
// own ComfyUI BEFORE registering. It proves the GPU can actually produce an
// image (ComfyUI up, model loads, inference + VAE decode work) and measures how
// long a render takes — the image-worker equivalent of the text tok/s benchmark.

const [UNET, T5, VAE] = IMAGE_MODEL_FILES.map((m) => m.file);

function benchWorkflow(): Record<string, unknown> {
  return {
    '10': { class_type: 'UNETLoader', inputs: { unet_name: UNET, weight_dtype: 'default' } },
    '11': { class_type: 'CLIPLoader', inputs: { clip_name: T5, type: 'chroma' } },
    '12': { class_type: 'VAELoader', inputs: { vae_name: VAE } },
    '13': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['10', 0], shift: 1.0 } },
    '14': { class_type: 'CLIPTextEncode', inputs: { text: 'a red apple on a wooden table', clip: ['11', 0] } },
    '15': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['11', 0] } },
    '16': { class_type: 'CFGGuider', inputs: { model: ['13', 0], positive: ['14', 0], negative: ['15', 0], cfg: 4.0 } },
    '17': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '18': { class_type: 'BetaSamplingScheduler', inputs: { model: ['13', 0], steps: 8, alpha: 0.45, beta: 0.45 } },
    '19': { class_type: 'EmptySD3LatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    '20': { class_type: 'RandomNoise', inputs: { noise_seed: 12345 } },
    '21': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['20', 0], guider: ['16', 0], sampler: ['17', 0], sigmas: ['18', 0], latent_image: ['19', 0] } },
    '22': { class_type: 'VAEDecode', inputs: { samples: ['21', 0], vae: ['12', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'bench', images: ['22', 0] } },
  };
}

/** Run the render self-check. Returns seconds taken; throws if it can't render a valid PNG. */
export async function runImageBenchmark(): Promise<number> {
  const t0 = Date.now();
  const b64 = await runImageJob(benchWorkflow());
  const buf = Buffer.from(b64, 'base64');
  if (!(buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
    throw new Error('render check did not return a valid PNG');
  }
  return (Date.now() - t0) / 1000;
}
