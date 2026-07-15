// The models the network knows how to shard, with the placement profile the planner needs.
// Mirrors shard/plan.py M25_PROFILE (MEASURED footprint/timings) so the live server forms rings
// with the same physics the engine proved. A model absent here is never auto-formed — the loop
// simply keeps its nodes in standby until an operator adds a spec.

import type { ModelProfile } from './swarm';

export interface ModelSpec {
  model: string;
  manifestRef: string;   // default content-addressed manifest; the candidates' announced ref wins if present
  profile: ModelProfile;
  minStages: number;     // don't auto-form below this many candidates (must be able to hold the model)
}

const H = 3072;   // MiniMax-M2.5 hidden size

export const MODEL_SPECS: Record<string, ModelSpec> = {
  'minimax-m2.5': {
    model: 'minimax-m2.5',
    manifestRef: 'mf:m25-nvfp4-v1',
    minStages: 2,
    profile: {
      layerCount: 62,
      layer_vram_mb: 2330,        // NVFP4 experts + bf16 attn + norms, per decoder layer (measured)
      kv_mb_per_layer: 150,       // at the 40960 KV cap, B=1
      layer_ms_base: 0.65,        // per-layer decode on an idle fast-CPU 5090 box
      reserve_mb: 1500,           // CUDA context + allocator slack per box
      head_reserve_mb: 4096,      // coordinator: embed + EAGLE head + context
      cap_layers: 12,             // 32 GB ceiling by measured footprint (bigger cards density-scale)
      prefill_bytes: 4096 * H * 2, // one [chunk,H] prefill hop (~25 MB) — upload-aware placement
      decode_bytes: 9 * H * 2,     // one draft round's hidden bundle (~54 KB)
      decode_steps: 256,
      losslessWire: true,
    },
  },
};

export function specForModel(model: string): ModelSpec | undefined {
  return MODEL_SPECS[model];
}
