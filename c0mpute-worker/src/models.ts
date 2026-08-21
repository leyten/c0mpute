// The single model this worker serves: Qwen3.8 27B Uncensored — one public
// model, network-wide (the old qwen/supergemma picker is gone as of 2.9.0).
// Pure data + pure functions, no side effects, so the CLI can import it
// without pulling in the env-derived config constants.
//
// `MODEL_NAME` MUST match a `workerModel` in the orchestrator's MODEL_CATALOG —
// that string is what the worker advertises at registration and how jobs route
// to it. It is also the public model id users see: same name everywhere.

export const MODEL_NAME = 'qwen3.8-27b-uncensored';
export const MODEL_LABEL = 'Qwen3.8 27B Uncensored';

/** Rough first-run download, for prompt text (weights + vision projector). */
export const APPROX_DOWNLOAD_GB = 18;

// ─────────────────────────────────────────────────────────────────────────
// GGUF build (every platform except Apple Silicon), self-packaged from
// JonathanColetti/Qwen3.8-27B-Uncensored-GGUF: weights + vision projector are
// separate files, assembled locally via a Modelfile (see setup.ts). The URL
// pins the repo revision so every worker downloads byte-identical weights —
// the exact files validated on the 4090 — even if the repo moves later.
// ─────────────────────────────────────────────────────────────────────────

const GGUF_REVISION = 'dee0a3164d9e11bbbebf5b63f52ba99443d14fc3';
export const GGUF_BASE_URL =
  `https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF/resolve/${GGUF_REVISION}`;

/** Vision projector (image input) — shipped alongside every GGUF variant. */
export const GGUF_VISION_FILE = 'Qwen3.8-27B-Uncensored-vision-f16.gguf';
export const GGUF_VISION_BYTES = 927_606_912;
export const GGUF_VISION_SHA256 = '5ac423f8a29059dc24e51bc6a43e9380dcd57a9347f28b62591e0b3f60b7081c';

export interface GgufVariant {
  /** Part of the local ollama model name, so a mixed rig can hold two
   *  variants in the shared ~/.ollama store without clobbering each other. */
  key: 'q4km' | 'iq4xs' | 'split' | 'metal';
  weightsFile: string;
  weightsBytes: number;
  /** sha256 of the weights file at the pinned revision (HF's LFS etag) —
   *  downloads are verified against it before they're ever trusted. */
  sha256: string;
  /** In-model MTP speculative decoding (PARAMETER draft_num_predict 4).
   *  Lossless and ~1.5-2.4x faster, but CUDA single-GPU only: it slows
   *  layer-split loads and Metal, and is unverified on ROCm. */
  draft: boolean;
  /** Context window baked into the model. Conservative on purpose: weights
   *  must stay 100% on GPU — partial offload is a ~10x slowdown, far worse
   *  than a smaller window. */
  numCtx: number;
}

const Q4_K_M: Omit<GgufVariant, 'draft' | 'numCtx'> = {
  key: 'q4km',
  weightsFile: 'Qwen3.8-27B-Uncensored-Q4_K_M.gguf',
  weightsBytes: 16_810_714_528,
  sha256: '4c5e2db039e9325ac7724c8846c71356a24ad1cdfa28002d73ecb6be645f9675',
};
const IQ4_XS: Omit<GgufVariant, 'draft' | 'numCtx'> = {
  key: 'iq4xs',
  weightsFile: 'Qwen3.8-27B-Uncensored-IQ4_XS.gguf',
  weightsBytes: 15_309_039_008,
  sha256: '53adc4bbed67044d662273356bbf3a50fdec667ac21bbf18d13e5815fbccc7f5',
};
/** noMTP build for multi-GPU layer splits: the MTP head halves prefill when
 *  the model spans cards, so those rigs run a build without it. */
const SPLIT: Omit<GgufVariant, 'draft' | 'numCtx'> = {
  key: 'split',
  weightsFile: 'Qwen3.8-27B-Uncensored-noMTP-IQ4_XS.gguf',
  weightsBytes: 15_082_506_720,
  sha256: '21969928166406e8b3b63249568fb28d54a3c595c0793756acdf0d38cd73bc77',
};

/** VRAM floors, shared by the ladder below and the CLI's fan-out logic so the
 *  two can never disagree about which boxes qualify. */
export const MIN_SOLO_VRAM_MB = 15500;   // one card runs the model alone (IQ4_XS)
export const MIN_SPLIT_TOTAL_MB = 20000; // combined floor for a layer-split rig

/**
 * Quant ladder by VRAM. `vramMb` is one entry per GPU this worker may use (the
 * pinned card, or the whole box), empty when undetectable (AMD / no
 * nvidia-smi). Detected VRAM implies NVIDIA (the query is nvidia-smi), which
 * is what gates the CUDA-only draft/MTP speedup. Returns null when the
 * detected hardware can't hold the model at all — callers turn that into a
 * requirements error instead of shipping a partial-offload worker.
 */
export function pickGgufVariant(vramMb: number[]): GgufVariant | null {
  const largest = vramMb.length ? Math.max(...vramMb) : 0;
  const total = vramMb.reduce((a, b) => a + b, 0);
  if (largest === 0) {
    // VRAM unknown (AMD/other): assume the documented floor for these boxes —
    // a 24GB-class card — and skip the CUDA-only draft. A box that can't
    // actually hold it fails the benchmark speed floor instead of half-serving.
    return { ...Q4_K_M, draft: false, numCtx: 8192 };
  }
  if (largest >= 22000) {
    return { ...Q4_K_M, draft: true, numCtx: largest >= 40000 ? 32768 : 16384 };
  }
  if (largest >= MIN_SOLO_VRAM_MB) {
    return { ...IQ4_XS, draft: true, numCtx: 8192 };
  }
  // No card fits the model alone, but together they might: one unpinned worker,
  // ollama splits layers across the cards, and the noMTP build keeps prefill
  // sane. Below that, the box is under the floor.
  if (vramMb.length >= 2 && total >= MIN_SPLIT_TOTAL_MB) {
    return { ...SPLIT, draft: false, numCtx: 8192 };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Apple Silicon runs the GGUF noMTP build on Metal through the same ollama
// path as everything else. (2.9.0 tried ollama-pulling an MLX repo; ollama's
// hf.co ingestion is GGUF-only and 400s on MLX safetensors — a field failure
// on day one. The faster mlx-vlm backend is a planned upgrade; the noMTP file
// is the right Metal build regardless, since MTP measures slower there.)
// ─────────────────────────────────────────────────────────────────────────

export const METAL: GgufVariant = {
  key: 'metal',
  weightsFile: 'Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf',
  weightsBytes: 16_547_400_160,
  sha256: 'dfd8fee6cd48899bb8dae0c2f59c36cac5e5ee718287d6fa1b5bcfc169c419eb',
  draft: false,   // never on Metal
  numCtx: 16384,
};

/** ~16.5GB of weights resident in unified memory: needs a 32GB+ Mac. */
export const MAC_MIN_MEMORY_GB = 32;
