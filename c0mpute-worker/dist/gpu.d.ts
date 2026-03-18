export interface GpuInfo {
    backend: string;
    deviceName: string;
    vram: number | null;
}
/**
 * Detect GPU info from ollama's system info.
 */
export declare function detectGpu(): Promise<GpuInfo>;
