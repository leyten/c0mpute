/** Default orchestrator URL */
export declare const DEFAULT_ORCHESTRATOR_URL = "https://c0mpute.ai";
/** Ollama API base URL */
export declare const OLLAMA_URL = "http://127.0.0.1:11434";
/** Ollama model name (custom model created from Modelfile). */
export declare const OLLAMA_MODEL: string;
/** Base model to pull from ollama registry. */
export declare const OLLAMA_BASE_MODEL: string;
/** Human-readable model name sent to orchestrator (the catalog routing key). */
export declare const DEFAULT_MODEL_NAME: string;
/** Number of tokens to generate during benchmark */
export declare const BENCHMARK_TOKENS = 64;
/** Minimum tok/s to register with orchestrator */
export declare const MIN_TOK_PER_SEC = 2;
/** Maximum output tokens per job */
export declare const MAX_OUTPUT_TOKENS = 4096;
/** Larger budget when thinking is on — reasoning + final answer must both fit */
export declare const MAX_OUTPUT_TOKENS_THINKING = 8192;
/** Maximum tool call rounds per job (prevents infinite loops) */
export declare const MAX_TOOL_ROUNDS = 5;
/** System prompt baked into the model */
export declare const SYSTEM_PROMPT = "You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.";
/** Model name an image worker advertises to the orchestrator. */
export declare const IMAGE_MODEL_NAME = "c0mpute-image";
/** Local ComfyUI HTTP endpoint the image worker drives. */
export declare const COMFY_URL: string;
/** ComfyUI install dir (for starting it + placing model files). */
export declare const COMFY_DIR: string;
/** Per-render timeout (ms). */
export declare const IMAGE_GEN_TIMEOUT_MS: number;
/** The three model files an image worker needs, with download sources.
 *  subdir is relative to <ComfyUI>/models/. All fp8 to fit a 24GB card + disk. */
export declare const IMAGE_MODEL_FILES: {
    subdir: string;
    file: string;
    url: string;
}[];
