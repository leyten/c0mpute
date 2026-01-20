declare module '@mlc-ai/web-llm' {
  export interface InitProgressReport {
    progress: number;
    text: string;
  }

  export interface ChatCompletionChunk {
    choices: Array<{
      delta: {
        content?: string;
      };
    }>;
  }

  export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }

  export interface ChatCompletionResponse {
    choices: Array<{
      message: {
        content: string;
      };
    }>;
  }

  export interface ChatCompletionCreateParams {
    messages: ChatCompletionMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
  }

  export interface ChatCompletions {
    create(params: ChatCompletionCreateParams & { stream: true }): AsyncIterable<ChatCompletionChunk>;
    create(params: ChatCompletionCreateParams & { stream?: false }): Promise<ChatCompletionResponse>;
    create(params: ChatCompletionCreateParams): Promise<ChatCompletionResponse> | AsyncIterable<ChatCompletionChunk>;
  }

  export interface Chat {
    completions: ChatCompletions;
  }

  export interface MLCEngine {
    chat: Chat;
    unload(): Promise<void>;
    interruptGenerate?: () => void;
  }

  export interface ModelConfig {
    model: string;
    model_id: string;
    model_lib: string;
  }

  export interface AppConfig {
    model_list: ModelConfig[];
  }

  export interface CreateMLCEngineOptions {
    initProgressCallback?: (progress: InitProgressReport) => void;
    appConfig?: AppConfig;
  }

  export function CreateMLCEngine(
    modelId: string,
    options?: CreateMLCEngineOptions
  ): Promise<MLCEngine>;
}
