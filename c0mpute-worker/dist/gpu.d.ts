export interface GpuInfo {
    backend: string;
    deviceName: string;
    vram: number | null;
}
/**
 * Detect available GPU and return backend info.
 * Tries CUDA, Metal, Vulkan in order, falls back to CPU.
 */
export declare function detectGpu(): Promise<GpuInfo>;
