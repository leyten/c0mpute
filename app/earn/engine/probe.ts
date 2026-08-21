'use client';

// DEV-ONLY INSTRUMENTATION. Nothing in the worker path imports this module
// statically: useWorkerEngine only dynamic-imports it when
// NEXT_PUBLIC_ENGINE_PROBE=1, so a production build never loads the chunk.
//
// It exists because we have no first-party measurement of the WebLLM engine.
// The 0.2.80 -> 0.2.84 bump is an experiment (batched command encoder, see
// docs/BROWSER_ENGINE_UPGRADE.md) and this is how it gets judged on a real
// worker GPU instead of on upstream's benchmark numbers.
//
// Usage, in the tab running the worker, once the engine is loaded and idle:
//
//   await window.__computeEngineProbe()
//
// Run it on 0.2.80 and on 0.2.84 on the SAME machine, same browser, nothing
// else on the GPU. It takes ~30s and generates two throwaway completions.
import type { MLCEngine } from '@mlc-ai/web-llm';

export interface EngineProbeResult {
  /**
   * GPU kernel dispatches per decoded token. NOTE: this counts
   * dispatchWorkgroups calls, NOT queue.submit calls — lib/index.js:4734
   * increments shaderSubmitCounter once per dispatch inside the shader
   * closure. 0.2.84's win is that it batches many dispatches into one submit,
   * so this number is expected to stay around 590 on BOTH versions. That is
   * not the fix failing. The win shows up in decode_tokens_per_s and
   * us_per_dispatch; this figure is here to confirm the kernel count did not
   * change underneath us, so a tok/s delta can be attributed to submission
   * batching rather than to a different amount of work.
   */
  dispatches_per_decode_token: number;
  /** Microseconds of wall-clock per decode step, divided by the dispatch count. */
  us_per_dispatch: number;
  decode_tokens_per_s: number;
  prefill_tokens_per_s: number;
  time_to_first_token_s: number;
  /**
   * Fraction of a decode step NOT accounted for by the post-logits sampling
   * path. latencyBreakdown covers only logit processing, logit bias, penalty,
   * sampling and grammar; the residual is the model forward — its CPU enqueue
   * plus the GPU execution it waits on. The hypothesis 0.2.84 tests is that
   * on 0.2.80 this residual is dominated by CPU enqueue of ~590 separate
   * submissions. A residual that shrinks between versions while
   * dispatches_per_decode_token holds is that hypothesis confirmed.
   */
  cpu_share_of_step: number;
  /** Raw inputs, so a surprising ratio can be checked by hand. */
  raw: {
    short_tokens: number;
    long_tokens: number;
    short_dispatches: number;
    long_dispatches: number;
    time_per_output_token_s: number;
    mean_sample_path_s: number;
  };
}

// Long enough that neither run stops early on its own, and identical across
// both runs so the prefill dispatches cancel in the subtraction.
const PROBE_PROMPT = 'Count from 1 to 500, one number per line, nothing else.';
const SHORT_TOKENS = 32;
const LONG_TOKENS = 160;

/**
 * Cumulative dispatch count since engine load. It is not on
 * engine.runtimeStatsText() — that one is deprecation-warned and only returns
 * prefill/decode rates. The counter lives on the TVM context behind the
 * pipeline, and there is no reset, so callers subtract two readings.
 */
function readDispatches(engine: MLCEngine): number {
  const pipeline = (engine as any).loadedModelIdToPipeline?.values().next().value;
  const text: string | undefined = pipeline?.tvm?.runtimeStatsText?.();
  const match = text?.match(/shader-submissions=(\d+)/);
  if (!match) {
    throw new Error(`engine probe: no shader-submissions in "${text}"`);
  }
  return Number(match[1]);
}

async function measure(engine: MLCEngine, maxTokens: number) {
  // Same starting state for both runs: multi-round chat only prefills the new
  // portion of the prompt, which would break the cancellation.
  await engine.resetChat();
  const before = readDispatches(engine);
  const response = await engine.chat.completions.create({
    messages: [{ role: 'user', content: PROBE_PROMPT }],
    max_tokens: maxTokens,
    temperature: 0,
    extra_body: { enable_thinking: false, enable_latency_breakdown: true },
  });
  const after = readDispatches(engine);
  const usage = response.usage;
  if (!usage) throw new Error('engine probe: response carried no usage');
  return { dispatches: after - before, tokens: usage.completion_tokens, usage };
}

export async function runEngineProbe(engine: MLCEngine): Promise<EngineProbeResult> {
  const short = await measure(engine, SHORT_TOKENS);
  const long = await measure(engine, LONG_TOKENS);
  await engine.resetChat();

  const tokenDelta = long.tokens - short.tokens;
  if (tokenDelta <= 0) {
    throw new Error(
      `engine probe: both runs produced the same length (${short.tokens} vs ${long.tokens}); ` +
        'the model stopped early, so prefill does not cancel',
    );
  }
  const dispatchesPerToken = (long.dispatches - short.dispatches) / tokenDelta;

  const extra = long.usage.extra;
  const perToken = extra.time_per_output_token_s;
  // latencyBreakdown arrays are in SECONDS (lib/index.js:11163-66 divides the
  // performance.now() delta by 1e3), one entry per generated token.
  const samplePath = extra.latencyBreakdown?.totalTime ?? [];
  const meanSamplePath = samplePath.length
    ? samplePath.reduce((a, b) => a + b, 0) / samplePath.length
    : 0;

  return {
    dispatches_per_decode_token: dispatchesPerToken,
    us_per_dispatch: (perToken * 1e6) / dispatchesPerToken,
    decode_tokens_per_s: extra.decode_tokens_per_s,
    prefill_tokens_per_s: extra.prefill_tokens_per_s,
    time_to_first_token_s: extra.time_to_first_token_s,
    cpu_share_of_step: (perToken - meanSamplePath) / perToken,
    raw: {
      short_tokens: short.tokens,
      long_tokens: long.tokens,
      short_dispatches: short.dispatches,
      long_dispatches: long.dispatches,
      time_per_output_token_s: perToken,
      mean_sample_path_s: meanSamplePath,
    },
  };
}

/** Exposes the probe on window for console use. Dev builds only. */
export function attachEngineProbe(engine: MLCEngine): void {
  (window as any).__computeEngineProbe = async () => {
    const result = await runEngineProbe(engine);
    console.table(result);
    return result;
  };
  console.info('[Worker] engine probe ready: await window.__computeEngineProbe()');
}
