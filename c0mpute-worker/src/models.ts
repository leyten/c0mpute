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

export interface GgufVariant {
  /** Suffix of the local ollama model name, so a mixed rig can hold two
   *  variants in the shared ~/.ollama store without clobbering each other. */
  key: 'q4km' | 'iq4xs' | 'split';
  weightsFile: string;
  weightsBytes: number;
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
};
const IQ4_XS: Omit<GgufVariant, 'draft' | 'numCtx'> = {
  key: 'iq4xs',
  weightsFile: 'Qwen3.8-27B-Uncensored-IQ4_XS.gguf',
  weightsBytes: 15_309_039_008,
};
/** noMTP build for multi-GPU layer splits: the MTP head halves prefill when
 *  the model spans cards, so those rigs run a build without it. */
const SPLIT: Omit<GgufVariant, 'draft' | 'numCtx'> = {
  key: 'split',
  weightsFile: 'Qwen3.8-27B-Uncensored-noMTP-IQ4_XS.gguf',
  weightsBytes: 15_082_506_720,
};

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
  if (largest >= 15500) {
    return { ...IQ4_XS, draft: true, numCtx: 8192 };
  }
  // No card fits the model alone, but together they might: one unpinned worker,
  // ollama splits layers across the cards, and the noMTP build keeps prefill
  // sane. Below that, the box is under the floor.
  if (vramMb.length >= 2 && total >= 20000) {
    return { ...SPLIT, draft: false, numCtx: 8192 };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// MLX build (Apple Silicon): PocketAiHub/Qwen3.8-27B-Abliterated-MLX, 4bit
// ONLY (the 2bit build ships broken tool calling — 0/8). Served through
// ollama's MLX engine, so inference/benchmark ride the same HTTP API as GGUF.
// No draft/MTP on Metal — it's measurably slower there.
// ─────────────────────────────────────────────────────────────────────────

export const MLX_BASE_MODEL = 'hf.co/PocketAiHub/Qwen3.8-27B-Abliterated-MLX:4bit';

/** ~16.1GB of weights (~19GB resident): needs a 32GB+ unified-memory Mac. */
export const MLX_MIN_MEMORY_GB = 32;
export const MLX_NUM_CTX = 16384;
