import { io, Socket } from 'socket.io-client';
import type { VideoSubmit, VideoJobStatus, VideoAdmission } from './orchestrator/types';

// The web side of the video lane. A render takes minutes and Cloudflare cuts
// any HTTP request at 100s, so nothing here waits on one: submitVideoJob hands
// a charged job to the orchestrator and resolves with its id the moment it is
// accepted, and getVideoJobStatus is a single poll. Each call is one short
// internal socket, exactly like the image client.

const ORCH_URL = process.env.INTERNAL_ORCHESTRATOR_URL || 'http://127.0.0.1:3004';

export class VideoJobError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

function internalCall<T>(event: 'video:submit' | 'video:status' | 'video:admit', payload: unknown): Promise<T> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) return Promise.reject(new VideoJobError('INTERNAL_API_SECRET not configured', 'CONFIG'));

  return new Promise<T>((resolve, reject) => {
    const socket: Socket = io(ORCH_URL, { auth: { token: internalSecret }, transports: ['websocket'], reconnection: false, timeout: 10_000 });
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.disconnect(); } catch {} fn(); };
    const timer = setTimeout(() => finish(() => reject(new VideoJobError('The video network did not answer.', 'TIMEOUT'))), 15_000);

    socket.on('connect_error', () => finish(() => reject(new VideoJobError('Could not reach the video network.', 'ORCH_UNREACHABLE'))));
    socket.on('connect', () => {
      socket.emit(event, payload, (res: T) => finish(() => resolve(res)));
    });
  });
}

/** Pre-flight before charging: whether the orchestrator would take this job now. */
export function checkVideoAdmission(privyUserId: string, adult: boolean): Promise<VideoAdmission> {
  return internalCall<VideoAdmission>('video:admit', { privyUserId, adult });
}

/** Queue a charged render. Once this resolves the orchestrator owns the
 *  refund; if it throws, the job was not accepted (refused, or no ack within
 *  15s, past job.acceptBy) and the caller refunds. */
export async function submitVideoJob(job: VideoSubmit): Promise<void> {
  const res = await internalCall<{ jobId: string } | { error: string; code?: string }>('video:submit', job);
  if ('error' in res) throw new VideoJobError(res.error, res.code);
}

export function getVideoJobStatus(jobId: string, privyUserId: string): Promise<VideoJobStatus> {
  return internalCall<VideoJobStatus>('video:status', { jobId, privyUserId });
}
