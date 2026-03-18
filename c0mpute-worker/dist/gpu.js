import { OLLAMA_URL } from './config.js';
/**
 * Detect GPU info from ollama's system info.
 */
export async function detectGpu() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/ps`);
        if (!res.ok) {
            return { backend: 'unknown', deviceName: 'Unknown', vram: null };
        }
        // Just report that ollama is handling GPU detection
        return {
            backend: 'ollama',
            deviceName: 'Managed by ollama',
            vram: null,
        };
    }
    catch {
        return { backend: 'unknown', deviceName: 'Unknown', vram: null };
    }
}
//# sourceMappingURL=gpu.js.map