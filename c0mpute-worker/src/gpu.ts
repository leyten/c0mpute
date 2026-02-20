import { getLlama, LlamaLogLevel } from 'node-llama-cpp';

export interface GpuInfo {
  backend: string;
  deviceName: string;
  vram: number | null;
}

/**
 * Detect available GPU and return backend info.
 * Tries CUDA, Metal, Vulkan in order, falls back to CPU.
 */
export async function detectGpu(): Promise<GpuInfo> {
  const llama = await getLlama({
    logLevel: LlamaLogLevel.warn,
  });

  const gpu = llama.gpu;
  const backend = llama.gpu
    ? (llama as any).gpuType ?? llama.constructor.name
    : 'cpu';

  let deviceName = 'CPU';
  let vram: number | null = null;

  if (gpu) {
    const info = await llama.getGpuDeviceNames();
    deviceName = info.length > 0 ? info[0] : 'Unknown GPU';
    try {
      const vramStatus = await llama.getVramState();
      vram = vramStatus.total;
    } catch {
      // VRAM info not available on all backends
    }
  }

  await llama.dispose();

  return {
    backend: String(backend),
    deviceName,
    vram,
  };
}
