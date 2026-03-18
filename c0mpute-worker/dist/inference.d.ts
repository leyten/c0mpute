export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
/**
 * Check if ollama is running and accessible.
 */
export declare function checkOllama(): Promise<boolean>;
/**
 * Check if our model exists in ollama.
 */
export declare function modelExists(): Promise<boolean>;
/**
 * Run chat inference via ollama HTTP API, streaming tokens via callback.
 * Uses think: false to disable thinking mode.
 */
export declare function runInference(messages: ChatMessage[], onToken: (token: string) => void, signal?: AbortSignal): Promise<{
    response: string;
    tokensGenerated: number;
}>;
/**
 * Run a short benchmark inference and return tokens per second.
 */
export declare function benchmarkInference(tokenCount: number): Promise<number>;
