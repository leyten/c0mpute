export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    images?: string[];
    tool_calls?: ToolCall[];
    tool_name?: string;
}
export interface ToolCall {
    type: 'function';
    function: {
        index?: number;
        name: string;
        arguments: Record<string, unknown>;
    };
}
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export interface InferenceResult {
    response: string;
    tokensGenerated: number;
    toolCalls?: ToolCall[];
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
 * Supports vision (images on messages) and tool calling.
 *
 * When the model responds with tool calls instead of text, the result will
 * have an empty response and toolCalls populated. The caller should execute
 * the tools and call runInference again with the tool results appended.
 */
export declare function runInference(messages: ChatMessage[], onToken: (token: string) => void, signal?: AbortSignal, tools?: ToolDefinition[]): Promise<InferenceResult>;
/**
 * Run a short benchmark inference and return tokens per second.
 * Benchmark runs without thinking or tools for clean speed measurement.
 */
export declare function benchmarkInference(tokenCount: number): Promise<number>;
