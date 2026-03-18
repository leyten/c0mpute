/**
 * Run a benchmark generating BENCHMARK_TOKENS tokens and return the speed.
 * Does a warm-up call first to load the model into memory/VRAM,
 * then measures actual generation speed on a second call.
 * Exits the process if speed is below minimum threshold.
 */
export declare function runBenchmark(): Promise<number>;
