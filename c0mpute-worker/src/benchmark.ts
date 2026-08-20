import { benchmarkInference } from './inference.js';
import { BENCHMARK_TOKENS, MIN_TOK_PER_SEC, DETECTED_VRAM_MB } from './config.js';

/**
 * Run a benchmark generating BENCHMARK_TOKENS tokens and return the speed.
 * Does a warm-up call first to load the model into memory/VRAM,
 * then measures actual generation speed on a second call.
 * Exits the process if speed is below minimum threshold.
 */
export async function runBenchmark(): Promise<number> {
  const timeoutMs = 180_000;

  // Warm-up: load model into VRAM (first call is always slow)
  console.log('Warming up model...');
  await Promise.race([
    benchmarkInference(4),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Warm-up timed out')), timeoutMs)
    ),
  ]);

  // Actual benchmark on warm model
  console.log(`Running benchmark (${BENCHMARK_TOKENS} tokens)...`);
  const tokPerSec = await Promise.race([
    benchmarkInference(BENCHMARK_TOKENS),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Benchmark timed out')), timeoutMs)
    ),
  ]);

  const rounded = Math.round(tokPerSec * 10) / 10;
  console.log(`Benchmark: ${rounded} tok/s`);

  // An NVIDIA box should clear 25 tok/s on this model; single digits usually
  // mean ollama silently fell back to CPU (e.g. a CUDA build missing this
  // card's arch). Warn rather than half-serve at floor speed.
  if (DETECTED_VRAM_MB > 0 && rounded < 15) {
    console.log(
      'Warning: this speed looks CPU-bound for an NVIDIA box. ' +
      'Check `ollama ps` shows "100% GPU" and that ollama is up to date.'
    );
  }

  if (tokPerSec < MIN_TOK_PER_SEC) {
    console.error(
      `Device too slow: ${rounded} tok/s (minimum: ${MIN_TOK_PER_SEC} tok/s)`
    );
    process.exit(1);
  }

  return tokPerSec;
}
