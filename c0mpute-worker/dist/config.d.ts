/** Default orchestrator URL */
export declare const DEFAULT_ORCHESTRATOR_URL = "https://c0mpute.ai";
/** Directory for storing models and config */
export declare const DATA_DIR: string;
/** Directory for downloaded GGUF models */
export declare const MODELS_DIR: string;
/** Default HuggingFace model repository */
export declare const DEFAULT_MODEL_REPO = "mradermacher/Qwen2.5-14B-Instruct-abliterated-v2-GGUF";
/** Default GGUF filename */
export declare const DEFAULT_MODEL_FILENAME = "Qwen2.5-14B-Instruct-abliterated-v2.Q4_K_M.gguf";
/** Human-readable model name sent to orchestrator */
export declare const DEFAULT_MODEL_NAME = "qwen2.5-14b-instruct-abliterated-v2-q4_K_M";
/** Number of tokens to generate during benchmark */
export declare const BENCHMARK_TOKENS = 32;
/** Minimum tok/s to register with orchestrator */
export declare const MIN_TOK_PER_SEC = 5;
/** Maximum output tokens per job */
export declare const MAX_OUTPUT_TOKENS = 1024;
