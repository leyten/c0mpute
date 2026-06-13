// Selectable models for a Max (text) worker. Pure data, no side effects, so the
// CLI can import it without pulling in the env-derived config constants.
//
// `modelName` MUST match a `workerModel` in the orchestrator's MODEL_CATALOG —
// that string is what the worker advertises at registration and how jobs route
// to it. `ollamaModel` is the local custom model the worker builds from
// `baseModel` (system prompt + tuned params baked in by setup.ts).
export interface WorkerModelSpec {
  key: string;
  label: string;
  ollamaModel: string;
  baseModel: string;
  modelName: string;
  approxSizeGb: number;
  note: string;
}

export const WORKER_MODELS: Record<string, WorkerModelSpec> = {
  qwen: {
    key: 'qwen',
    label: 'Qwen3.5 27B',
    ollamaModel: 'c0mpute-max',
    baseModel: 'huihui_ai/qwen3.5-abliterated:27b',
    modelName: 'qwen3.5-27b-abliterated',
    approxSizeGb: 17,
    note: 'tools, vision, thinking',
  },
  supergemma: {
    key: 'supergemma',
    label: 'SuperGemma4 26B',
    ollamaModel: 'c0mpute-supergemma',
    baseModel: '0xIbra/supergemma4-26b-uncensored-gguf-v2:Q4_K_M',
    modelName: 'supergemma4-26b',
    approxSizeGb: 17,
    note: 'MoE, newer, faster, tools (text-only)',
  },
  code: {
    key: 'code',
    label: 'Devstral 24B (code)',
    ollamaModel: 'c0mpute-code',
    baseModel: 'devstral',
    modelName: 'devstral-24b',
    approxSizeGb: 14,
    note: 'agentic coding model — powers c0mpute code',
  },
};

export type WorkerModelKey = keyof typeof WORKER_MODELS;

/** Default when none is chosen (headless install, no flag, no saved choice). */
export const DEFAULT_WORKER_MODEL: WorkerModelKey = 'qwen';

export function isWorkerModelKey(k: string | undefined): k is WorkerModelKey {
  return !!k && Object.prototype.hasOwnProperty.call(WORKER_MODELS, k);
}

/**
 * Pick the model with the FEWEST active workers, so new supply lands where it's
 * most needed (balances the network instead of piling onto one model). `counts`
 * is keyed by modelName (as the orchestrator reports it); null/unknown counts
 * fall back to the default model.
 */
export function recommendModel(counts: Record<string, number> | null): WorkerModelKey {
  if (!counts) return DEFAULT_WORKER_MODEL;
  let best: WorkerModelKey = DEFAULT_WORKER_MODEL;
  let bestCount = Infinity;
  for (const key of Object.keys(WORKER_MODELS) as WorkerModelKey[]) {
    const c = counts[WORKER_MODELS[key].modelName] ?? 0;
    if (c < bestCount) { bestCount = c; best = key; }
  }
  return best;
}
