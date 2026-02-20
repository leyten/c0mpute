import { homedir } from 'os';
import { join } from 'path';

/** Default orchestrator URL */
export const DEFAULT_ORCHESTRATOR_URL = 'https://c0mpute.ai';

/** Directory for storing models and config */
export const DATA_DIR = join(homedir(), '.c0mpute');

/** Directory for downloaded GGUF models */
export const MODELS_DIR = join(DATA_DIR, 'models');

/** Default HuggingFace model repository */
export const DEFAULT_MODEL_REPO = 'bartowski/Qwen2.5-14B-Instruct-GGUF';

/** Default GGUF filename */
export const DEFAULT_MODEL_FILENAME = 'Qwen2.5-14B-Instruct-Q4_K_M.gguf';

/** Human-readable model name sent to orchestrator */
export const DEFAULT_MODEL_NAME = 'qwen2.5-14b-instruct-q4_K_M';

/** Number of tokens to generate during benchmark */
export const BENCHMARK_TOKENS = 32;

/** Minimum tok/s to register with orchestrator */
export const MIN_TOK_PER_SEC = 5;

/** Maximum output tokens per job */
export const MAX_OUTPUT_TOKENS = 1024;
