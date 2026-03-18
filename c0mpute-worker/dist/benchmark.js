import { benchmarkInference } from './inference.js';
import { BENCHMARK_TOKENS, MIN_TOK_PER_SEC } from './config.js';
/**
 * Run a benchmark generating BENCHMARK_TOKENS tokens and return the speed.
 * Does a warm-up call first to load the model into memory/VRAM,
 * then measures actual generation speed on a second call.
 * Exits the process if speed is below minimum threshold.
 */
export async function runBenchmark() {
    const timeoutMs = 180_000;
    // Warm-up: load model into VRAM (first call is always slow)
    console.log('Warming up model...');
    await Promise.race([
        benchmarkInference(4),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Warm-up timed out')), timeoutMs)),
    ]);
    // Actual benchmark on warm model
    console.log(`Running benchmark (${BENCHMARK_TOKENS} tokens)...`);
    const tokPerSec = await Promise.race([
        benchmarkInference(BENCHMARK_TOKENS),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Benchmark timed out')), timeoutMs)),
    ]);
    const rounded = Math.round(tokPerSec * 10) / 10;
    console.log(`Benchmark: ${rounded} tok/s`);
    if (tokPerSec < MIN_TOK_PER_SEC) {
        console.error(`Device too slow: ${rounded} tok/s (minimum: ${MIN_TOK_PER_SEC} tok/s)`);
        process.exit(1);
    }
    return tokPerSec;
}
//# sourceMappingURL=benchmark.js.map