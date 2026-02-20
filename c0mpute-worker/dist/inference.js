import { getLlama, LlamaChatSession, LlamaLogLevel, resolveModelFile } from 'node-llama-cpp';
import { mkdirSync } from 'fs';
import { MODELS_DIR, DEFAULT_MODEL_REPO, DEFAULT_MODEL_FILENAME, MAX_OUTPUT_TOKENS, } from './config.js';
let llamaInstance = null;
let model = null;
/**
 * Download the default GGUF model if not already present.
 * Returns the local file path.
 */
export async function downloadModel(customPath) {
    if (customPath)
        return customPath;
    mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Downloading model: ${DEFAULT_MODEL_REPO}/${DEFAULT_MODEL_FILENAME}`);
    console.log(`Storage: ${MODELS_DIR}`);
    const modelPath = await resolveModelFile(`hf:${DEFAULT_MODEL_REPO}/${DEFAULT_MODEL_FILENAME}`, {
        directory: MODELS_DIR,
        fileName: DEFAULT_MODEL_FILENAME,
    });
    return modelPath;
}
/**
 * Load the GGUF model into memory and prepare for inference.
 */
export async function loadModel(modelPath) {
    llamaInstance = await getLlama({
        logLevel: LlamaLogLevel.warn,
    });
    model = await llamaInstance.loadModel({ modelPath });
}
/**
 * Run chat inference, streaming tokens via callback.
 * Returns the full response string.
 */
export async function runInference(messages, onToken, signal) {
    if (!llamaInstance || !model) {
        throw new Error('Model not loaded');
    }
    const context = await model.createContext();
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });
    // Build conversation history (all messages except the last user message)
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    // Set system prompt if present
    if (systemMessages.length > 0) {
        session.setChatHistory([{
                type: 'system',
                text: systemMessages.map(m => m.content).join('\n'),
            }]);
    }
    // Add conversation history (pairs of user/assistant before the final user message)
    for (let i = 0; i < conversationMessages.length - 1; i++) {
        const msg = conversationMessages[i];
        if (msg.role === 'user') {
            const nextMsg = conversationMessages[i + 1];
            if (nextMsg && nextMsg.role === 'assistant') {
                session.setChatHistory([
                    ...session.getChatHistory(),
                    { type: 'user', text: msg.content },
                    { type: 'model', response: [nextMsg.content] },
                ]);
                i++; // skip assistant message
            }
        }
    }
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        await context.dispose();
        throw new Error('Last message must be from user');
    }
    let tokensGenerated = 0;
    let response = '';
    response = await session.prompt(lastMessage.content, {
        maxTokens: MAX_OUTPUT_TOKENS,
        signal,
        onTextChunk: (text) => {
            tokensGenerated++;
            response += text;
            onToken(text);
        },
    });
    await context.dispose();
    return { response, tokensGenerated };
}
/**
 * Generate a short completion for benchmarking. Returns tokens per second.
 */
export async function benchmarkInference(tokenCount) {
    if (!llamaInstance || !model) {
        throw new Error('Model not loaded');
    }
    const context = await model.createContext();
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });
    let tokens = 0;
    const start = performance.now();
    await session.prompt('Write a short paragraph about distributed computing.', {
        maxTokens: tokenCount,
        onTextChunk: () => { tokens++; },
    });
    const elapsed = (performance.now() - start) / 1000;
    await context.dispose();
    return tokens / elapsed;
}
/**
 * Dispose of the model and llama instance.
 */
export async function disposeModel() {
    if (model) {
        await model.dispose?.();
        model = null;
    }
    if (llamaInstance) {
        await llamaInstance.dispose();
        llamaInstance = null;
    }
}
//# sourceMappingURL=inference.js.map