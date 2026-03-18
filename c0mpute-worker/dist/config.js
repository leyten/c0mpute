import { homedir } from 'os';
import { join } from 'path';
/** Default orchestrator URL */
export const DEFAULT_ORCHESTRATOR_URL = 'https://c0mpute.ai';
/** Directory for storing models and config */
export const DATA_DIR = join(homedir(), '.c0mpute');
/** Ollama API base URL */
export const OLLAMA_URL = 'http://127.0.0.1:11434';
/** Ollama model name (custom model created from Modelfile) */
export const OLLAMA_MODEL = 'c0mpute-max';
/** Base model to pull from ollama registry */
export const OLLAMA_BASE_MODEL = 'huihui_ai/qwen3.5-abliterated:27b';
/** Human-readable model name sent to orchestrator */
export const DEFAULT_MODEL_NAME = 'qwen3.5-27b-abliterated';
/** Number of tokens to generate during benchmark */
export const BENCHMARK_TOKENS = 32;
/** Minimum tok/s to register with orchestrator */
export const MIN_TOK_PER_SEC = 5;
/** Maximum output tokens per job */
export const MAX_OUTPUT_TOKENS = 4096;
/** Maximum tool call rounds per job (prevents infinite loops) */
export const MAX_TOOL_ROUNDS = 5;
/** System prompt baked into the model */
export const SYSTEM_PROMPT = 'You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.';
/**
 * Ollama Modelfile template for c0mpute-max.
 * Uses the base model's built-in template (supports vision, tools, thinking natively).
 * Only overrides: system prompt and sampling parameters.
 */
export const MODELFILE_TEMPLATE = `FROM ${OLLAMA_BASE_MODEL}
SYSTEM "${SYSTEM_PROMPT}"
PARAMETER temperature 0.6
PARAMETER top_k 20
PARAMETER top_p 0.95`;
//# sourceMappingURL=config.js.map