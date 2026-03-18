import { benchmarkInference } from './inference.js';
import { BENCHMARK_TOKENS, MIN_TOK_PER_SEC } from './config.js';
/**
 * Run a benchmark generating BENCHMARK_TOKENS tokens and return the speed.
 * Exits the process if speed is below minimum threshold.
 */
export async function runBenchmark() {
    console.log(`Running benchmark (${BENCHMARK_TOKENS} tokens)...`);
    const timeoutMs = 120_000;
    const result = await Promise.race([
        benchmarkInference(BENCHMARK_TOKENS),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Benchmark timed out after 2 minutes')), timeoutMs)),
    ]);
    const tokPerSec = result;
    const rounded = Math.round(tokPerSec * 10) / 10;
    console.log(`Benchmark: ${rounded} tok/s`);
    if (tokPerSec < MIN_TOK_PER_SEC) {
        console.error(`Device too slow: ${rounded} tok/s (minimum: ${MIN_TOK_PER_SEC} tok/s)`);
        process.exit(1);
    }
    return tokPerSec;
}
//# sourceMappingURL=benchmark.js.map