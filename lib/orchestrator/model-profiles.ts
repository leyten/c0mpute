// The models the network knows how to shard, with the placement profile the planner needs.
// Mirrors shard/plan.py M25_PROFILE (MEASURED footprint/timings) so the live server forms rings
// with the same physics the engine proved. A model absent here is never auto-formed — the loop
// simply keeps its nodes in standby until an operator adds a spec.

import type { ModelProfile } from './swarm';

export interface ModelSpec {
  model: string;
  /** the manifest ref every assignment for this model carries (the announced ref is advisory —
   *  stored, never load-bearing). At launch this flips to the full `mf1:<name>@<cid>` form the
   *  operator's one-time publish mints: the CID pins the exact signed manifest a joiner's
   *  `shard.fetch --manifest-cid` verifies bytes against (shard INTEGRATION.md §4). */
  manifestRef: string;
  profile: ModelProfile;
  minStages: number;     // don't auto-form below this many candidates (must be able to hold the model)
  // Requester price, USD per 1M generated tokens (display: "$/M"). PHASE 2 (per-token billing):
  // this drives what the requester is charged, replacing the flat pro-tier credit cost for swarm
  // models. Phase 1 (the payout landed here) splits the ALREADY-collected charge, so this number
  // is staged/documented but not yet wired into billing — turning it on modifies the live submit
  // path and is its own reviewed deploy. leyten's number.
  pricePerMTokensUsd?: number;
}

const H = 3072;   // MiniMax-M2.5 hidden size

export const MODEL_SPECS: Record<string, ModelSpec> = {
  'minimax-m2.5': {
    model: 'minimax-m2.5',
    manifestRef: 'mf:m25-nvfp4-v1',
    minStages: 2,
    pricePerMTokensUsd: 0.50,   // $0.50 / 1M generated tokens — undercuts the ~$1.20/M centralized
                                // option; operators keep 70-80%. Phase-2 billing (see interface).

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
