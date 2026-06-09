import { io, Socket } from 'socket.io-client';

// Submit an image render to the orchestrator and await the PNG. Mirrors the
// internal socket bridge the chat API uses (app/api/v1/chat/completions), but
// for the single-result image lane: connect as the trusted internal client,
// emit image:submit, resolve on image:done / reject on image:error.

const ORCH_URL = process.env.INTERNAL_ORCHESTRATOR_URL || 'http://127.0.0.1:3004';

export interface ImageJobResult { image: string; seed?: number; width?: number; height?: number }

export class ImageJobError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

export async function submitImageJob(
  workflow: Record<string, unknown>,
  meta: { privyId: string; seed?: number; width?: number; height?: number }
): Promise<ImageJobResult> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) throw new ImageJobError('INTERNAL_API_SECRET not configured', 'CONFIG');

  return new Promise<ImageJobResult>((resolve, reject) => {
    const socket: Socket = io(ORCH_URL, { auth: { token: internalSecret }, transports: ['websocket'], reconnection: false, timeout: 10_000 });
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.disconnect(); } catch {} fn(); };
    const timer = setTimeout(() => finish(() => reject(new ImageJobError('Image generation timed out.', 'TIMEOUT'))), 200_000);

    socket.on('connect_error', () => finish(() => reject(new ImageJobError('Could not reach the image network.', 'ORCH_UNREACHABLE'))));
    socket.on('image:done', (d: any) => finish(() => resolve({ image: d.image, seed: d.seed, width: d.width, height: d.height })));
    socket.on('image:error', (d: any) => finish(() => reject(new ImageJobError(d.error || 'Image generation failed.', d.code))));
    socket.on('connect', () => {
      socket.emit('image:submit', { workflow, privyUserId: meta.privyId, seed: meta.seed, width: meta.width, height: meta.height }, (ack: any) => {
        if (ack?.error) finish(() => reject(new ImageJobError(ack.error, ack.code)));
        // else accepted — wait for image:done / image:error
      });
    });
  });
}
