import { OLLAMA_URL, OLLAMA_MODEL, MAX_OUTPUT_TOKENS } from './config.js';
/**
 * Check if ollama is running and accessible.
 */
export async function checkOllama() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/version`);
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Check if our model exists in ollama.
 */
export async function modelExists() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: OLLAMA_MODEL }),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Run chat inference via ollama HTTP API, streaming tokens via callback.
 * Uses think: false to disable thinking mode.
 */
export async function runInference(messages, onToken, signal) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            think: false,
            stream: true,
            options: {
                num_predict: MAX_OUTPUT_TOKENS,
            },
        }),
        signal,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error (${res.status}): ${text}`);
    }
    if (!res.body) {
        throw new Error('No response body from ollama');
    }
    let response = '';
    let tokensGenerated = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        // ollama streams newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const chunk = JSON.parse(line);
                if (chunk.message?.content) {
                    const token = chunk.message.content;
                    response += token;
                    tokensGenerated++;
                    onToken(token);
                }
                if (chunk.done) {
                    // Use ollama's token count if available
                    if (chunk.eval_count) {
                        tokensGenerated = chunk.eval_count;
                    }
                }
            }
            catch {
                // Skip malformed lines
            }
        }
    }
    return { response, tokensGenerated };
}
/**
 * Run a short benchmark inference and return tokens per second.
 */
export async function benchmarkInference(tokenCount) {
    const start = performance.now();
    let tokens = 0;
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: 'user', content: 'Write a short paragraph about distributed computing.' }],
            think: false,
            stream: true,
            options: {
                num_predict: tokenCount,
            },
        }),
    });
    if (!res.ok) {
        throw new Error(`Benchmark failed: ollama returned ${res.status}`);
    }
    if (!res.body) {
        throw new Error('No response body');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const chunk = JSON.parse(line);
                if (chunk.message?.content)
                    tokens++;
                if (chunk.done && chunk.eval_count)
                    tokens = chunk.eval_count;
            }
            catch { /* skip */ }
        }
    }
    const elapsed = (performance.now() - start) / 1000;
    return tokens / elapsed;
}
//# sourceMappingURL=inference.js.map