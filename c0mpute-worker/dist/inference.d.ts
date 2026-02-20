export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
/**
 * Download the default GGUF model if not already present.
 * Returns the local file path.
 */
export declare function downloadModel(customPath?: string): Promise<string>;
/**
 * Load the GGUF model into memory and prepare for inference.
 */
export declare function loadModel(modelPath: string): Promise<void>;
/**
 * Run chat inference, streaming tokens via callback.
 * Returns the full response string.
 */
export declare function runInference(messages: ChatMessage[], onToken: (token: string) => void, signal?: AbortSignal): Promise<{
    response: string;
    tokensGenerated: number;
}>;
/**
 * Generate a short completion for benchmarking. Returns tokens per second.
 */
export declare function benchmarkInference(tokenCount: number): Promise<number>;
/**
 * Dispose of the model and llama instance.
 */
export declare function disposeModel(): Promise<void>;
