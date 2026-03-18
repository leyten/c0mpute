/** Default orchestrator URL */
export declare const DEFAULT_ORCHESTRATOR_URL = "https://c0mpute.ai";
/** Directory for storing models and config */
export declare const DATA_DIR: string;
/** Ollama API base URL */
export declare const OLLAMA_URL = "http://127.0.0.1:11434";
/** Ollama model name (custom model created from Modelfile) */
export declare const OLLAMA_MODEL = "c0mpute-max";
/** Base model to pull from ollama registry */
export declare const OLLAMA_BASE_MODEL = "huihui_ai/qwen3.5-abliterated:27b";
/** Human-readable model name sent to orchestrator */
export declare const DEFAULT_MODEL_NAME = "qwen3.5-27b-abliterated";
/** Number of tokens to generate during benchmark */
export declare const BENCHMARK_TOKENS = 32;
/** Minimum tok/s to register with orchestrator */
export declare const MIN_TOK_PER_SEC = 5;
/** Maximum output tokens per job */
export declare const MAX_OUTPUT_TOKENS = 4096;
/** Maximum tool call rounds per job (prevents infinite loops) */
export declare const MAX_TOOL_ROUNDS = 5;
/** System prompt baked into the model */
export declare const SYSTEM_PROMPT = "You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.";
/**
 * Ollama Modelfile template for c0mpute-max.
 * Uses the base model's built-in template (supports vision, tools, thinking natively).
 * Only overrides: system prompt and sampling parameters.
 */
export declare const MODELFILE_TEMPLATE = "FROM huihui_ai/qwen3.5-abliterated:27b\nSYSTEM \"You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.\"\nPARAMETER temperature 0.6\nPARAMETER top_k 20\nPARAMETER top_p 0.95";
