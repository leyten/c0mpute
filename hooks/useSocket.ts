'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents, ChatMessage, NetworkStats } from '@/lib/orchestrator/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseSocketReturn {
  socket: TypedSocket | null;
  isConnected: boolean;
  networkStats: NetworkStats | null;
  queuePosition: number | null;
  
  registerWorker: (model: string, authToken: string, tokPerSec?: number, numCtx?: number) => Promise<string>;
  unregisterWorker: () => void;
  sendToken: (jobId: string, token: string) => void;
  completeJob: (jobId: string, response: string, tokensGenerated: number) => void;
  failJob: (jobId: string, error: string) => void;
  
  submitJob: (data: { messages?: ChatMessage[]; model?: string; authToken: string; think?: boolean }) => Promise<{ jobId: string; freeRemaining?: number }>;
  /** Stop a job server-side: cancels the worker and frees the slot. */
  abortJob: (jobId: string) => void;
  
  setOnNewJob: (handler: ((jobId: string, messages?: ChatMessage[], think?: boolean) => void) | null) => void;
  setOnJobToken: (handler: ((jobId: string, token: string) => void) | null) => void;
  /** `truncated`: the answer stopped at the lane's output limit, not at its own
   *  end. Absent from an older orchestrator, so treat it as false. */
  setOnJobComplete: (handler: ((jobId: string, response: string, truncated?: boolean) => void) | null) => void;
  /** `meta` carries a failure the caller can act on rather than just print:
   *  a code, and the server's measured thinking time. */
  setOnJobError: (handler: ((jobId: string, error: string, meta?: { code?: string; thinkSeconds?: number }) => void) | null) => void;
  setOnJobAssigned: (handler: ((jobId: string, workerId: string) => void) | null) => void;
  setOnJobCancel: (handler: ((jobId: string) => void) | null) => void;
  setOnJobSearching: (handler: ((jobId: string) => void) | null) => void;
  setOnJobSources: (handler: ((jobId: string, sources: { title: string; url: string; description: string }[]) => void) | null) => void;
  setOnJobGeneratingImage: (handler: ((jobId: string) => void) | null) => void;
  setOnJobImage: (handler: ((jobId: string, images: string[]) => void) | null) => void;
  setOnJobImageError: (handler: ((jobId: string, error: string) => void) | null) => void;
  setOnJobFile: (handler: ((jobId: string, file: { name: string; mime: string; data: string }) => void) | null) => void;
  nativeStatus: { online: boolean; workerId?: string; type?: 'native' | 'image'; connectedAt?: number; jobsCompleted: number; tokensGenerated: number; tokPerSec: number; currentJob?: string } | null;
}

/** `getFreshToken`, when given, is called at every handshake — including each
 *  reconnect. Without it the token captured at mount is replayed forever, and
 *  since Privy access tokens expire in about an hour, the first drop after
 *  expiry is rejected by the orchestrator's auth middleware. socket.io treats a
 *  namespace CONNECT_ERROR as fatal and stops retrying, so the page goes
 *  silently offline until a reload. */
export function useSocket(authToken?: string | null, getFreshToken?: () => Promise<string | null>): UseSocketReturn {
  const socketRef = useRef<TypedSocket | null>(null);
  const freshRef = useRef<(() => Promise<string | null>) | undefined>(undefined);
  useEffect(() => { freshRef.current = getFreshToken; }, [getFreshToken]);
  const [isConnected, setIsConnected] = useState(false);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [nativeStatus, setNativeStatus] = useState<UseSocketReturn['nativeStatus']>(null);
  
  const onNewJobRef = useRef<((jobId: string, messages?: ChatMessage[], think?: boolean) => void) | null>(null);
  const onJobTokenRef = useRef<((jobId: string, token: string) => void) | null>(null);
  const onJobCompleteRef = useRef<((jobId: string, response: string, truncated?: boolean) => void) | null>(null);
  const onJobErrorRef = useRef<((jobId: string, error: string, meta?: { code?: string; thinkSeconds?: number }) => void) | null>(null);
  const onJobAssignedRef = useRef<((jobId: string, workerId: string) => void) | null>(null);
  const onJobCancelRef = useRef<((jobId: string) => void) | null>(null);
  const onJobSearchingRef = useRef<((jobId: string) => void) | null>(null);
  const onJobSourcesRef = useRef<((jobId: string, sources: { title: string; url: string; description: string }[]) => void) | null>(null);
  const onJobGeneratingImageRef = useRef<((jobId: string) => void) | null>(null);
  const onJobImageRef = useRef<((jobId: string, images: string[]) => void) | null>(null);
  const onJobImageErrorRef = useRef<((jobId: string, error: string) => void) | null>(null);
  const onJobFileRef = useRef<((jobId: string, file: { name: string; mime: string; data: string }) => void) | null>(null);

  useEffect(() => {
    // Don't connect until we have an auth token
    if (!authToken) return;

    const socket: TypedSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      // A worker tab is meant to be left open for hours. Giving up after 5
      // attempts (~5s) turns any blip into a permanently offline worker.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      // Callback form: socket.io re-invokes it for every handshake, so a
      // reconnect after the mount-time token expired presents a fresh one.
      auth: (cb: (data: { token: string | null | undefined }) => void) => {
        const getFresh = freshRef.current;
        if (!getFresh) { cb({ token: authToken }); return; }
        getFresh()
          .then(t => cb({ token: t || authToken }))
          .catch(() => cb({ token: authToken }));
      },
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });

    socket.on('stats:update', (stats) => {
      setNetworkStats(stats);
    });

    socket.on('job:new', (data) => {
      if (onNewJobRef.current) {
        onNewJobRef.current(data.jobId, data.messages, data.think);
      }
    });

    socket.on('job:token', (data) => {
      if (onJobTokenRef.current) {
        onJobTokenRef.current(data.jobId, data.token);
      }
    });

    socket.on('job:complete', (data) => {
      setQueuePosition(null);
      if (onJobCompleteRef.current) {
        onJobCompleteRef.current(data.jobId, data.response, data.truncated);
      }
    });

    socket.on('job:error', (data) => {
      setQueuePosition(null);
      if (onJobErrorRef.current) {
        onJobErrorRef.current(data.jobId, data.error, { code: data.code, thinkSeconds: data.thinkSeconds });
      }
    });

    socket.on('job:assigned', (data) => {
      setQueuePosition(0);
      if (onJobAssignedRef.current) {
        onJobAssignedRef.current(data.jobId, data.workerId);
      }
    });

    socket.on('queue:position', (data) => {
      setQueuePosition(data.position);
    });

    socket.on('job:cancel', (data) => {
      if (onJobCancelRef.current) {
        onJobCancelRef.current(data.jobId);
      }
    });

    socket.on('job:searching', (data) => {
      if (onJobSearchingRef.current) {
        onJobSearchingRef.current(data.jobId);
      }
    });

    socket.on('job:sources', (data: { jobId: string; sources: { title: string; url: string; description: string }[] }) => {
      if (onJobSourcesRef.current) {
        onJobSourcesRef.current(data.jobId, data.sources);
      }
    });

    (socket as any).on('job:generating_image', (data: { jobId: string }) => {
      if (onJobGeneratingImageRef.current) {
        onJobGeneratingImageRef.current(data.jobId);
      }
    });

    (socket as any).on('job:image', (data: { jobId: string; images: string[] }) => {
      if (onJobImageRef.current) {
        onJobImageRef.current(data.jobId, data.images);
      }
    });

    (socket as any).on('job:image_error', (data: { jobId: string; error: string }) => {
      if (onJobImageErrorRef.current) {
        onJobImageErrorRef.current(data.jobId, data.error);
      }
    });

    socket.on('job:file', (data) => {
      if (onJobFileRef.current) {
        onJobFileRef.current(data.jobId, { name: data.name, mime: data.mime, data: data.data });
      }
    });

    (socket as any).on('native:status', (data: any) => {
      setNativeStatus(data);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authToken]);

  const registerWorker = useCallback(async (model: string, authToken: string, tokPerSec?: number, numCtx?: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }
      socketRef.current.emit('worker:register', { model, authToken, tokPerSec, numCtx }, (response) => {
        if ('workerId' in response) {
          resolve(response.workerId);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }, []);

  const unregisterWorker = useCallback(() => {
    if (socketRef.current) socketRef.current.emit('worker:unregister');
  }, []);

  const sendToken = useCallback((jobId: string, token: string) => {
    if (socketRef.current) socketRef.current.emit('job:token', { jobId, token });
  }, []);

  const completeJob = useCallback((jobId: string, response: string, tokensGenerated: number) => {
    if (socketRef.current) socketRef.current.emit('job:complete', { jobId, response, tokensGenerated });
  }, []);

  const failJob = useCallback((jobId: string, error: string) => {
    if (socketRef.current) socketRef.current.emit('job:error', { jobId, error });
  }, []);

  const submitJob = useCallback(async (data: { messages?: ChatMessage[]; model?: string; authToken: string; think?: boolean }): Promise<{ jobId: string; freeRemaining?: number }> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }
      // Bounded ack. A socket.io ack has no default timeout, so if the server
      // never answers — dropped packet, disconnect mid-flight — this promise
      // never settled and the caller sat "generating" forever with no error and
      // no stall timer (the chat engine arms its stall only after this resolves).
      socketRef.current.timeout(20000).emit('job:submit', {
        messages: data.messages,
        model: data.model,
        authToken: data.authToken,
        think: data.think,
      }, (timeoutErr: Error | null, response: { jobId: string; freeRemaining?: number } | { error: string; code?: string }) => {
        if (timeoutErr) {
          reject(new Error('The network did not accept the job in time. Please try again.'));
          return;
        }
        if ('jobId' in response) {
          resolve({ jobId: response.jobId, freeRemaining: response.freeRemaining });
        } else {
          // The human message is what reaches the screen — the chat engine
          // flattens this rejection to err.message — so it wins. The machine
          // code (e.g. ANON_NO_PROMPTS) rides along as a property for callers
          // that branch on it, instead of replacing the message.
          const err = new Error(response.error || response.code) as Error & { code?: string };
          err.code = response.code;
          reject(err);
        }
      });
    });
  }, []);

  const abortJob = useCallback((jobId: string) => {
    if (socketRef.current && jobId) socketRef.current.emit('job:abort', { jobId });
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    networkStats,
    queuePosition,
    nativeStatus,
    registerWorker,
    unregisterWorker,
    sendToken,
    completeJob,
    failJob,
    submitJob,
    abortJob,
    setOnNewJob: useCallback((handler: ((jobId: string, messages?: ChatMessage[], think?: boolean) => void) | null) => { onNewJobRef.current = handler; }, []),
    setOnJobToken: useCallback((handler: ((jobId: string, token: string) => void) | null) => { onJobTokenRef.current = handler; }, []),
    setOnJobComplete: useCallback((handler: ((jobId: string, response: string, truncated?: boolean) => void) | null) => { onJobCompleteRef.current = handler; }, []),
    setOnJobError: useCallback((handler: ((jobId: string, error: string, meta?: { code?: string; thinkSeconds?: number }) => void) | null) => { onJobErrorRef.current = handler; }, []),
    setOnJobAssigned: useCallback((handler: ((jobId: string, workerId: string) => void) | null) => { onJobAssignedRef.current = handler; }, []),
    setOnJobCancel: useCallback((handler: ((jobId: string) => void) | null) => { onJobCancelRef.current = handler; }, []),
    setOnJobSearching: useCallback((handler: ((jobId: string) => void) | null) => { onJobSearchingRef.current = handler; }, []),
    setOnJobSources: useCallback((handler: ((jobId: string, sources: { title: string; url: string; description: string }[]) => void) | null) => { onJobSourcesRef.current = handler; }, []),
    setOnJobGeneratingImage: useCallback((handler: ((jobId: string) => void) | null) => { onJobGeneratingImageRef.current = handler; }, []),
    setOnJobImage: useCallback((handler: ((jobId: string, images: string[]) => void) | null) => { onJobImageRef.current = handler; }, []),
    setOnJobImageError: useCallback((handler: ((jobId: string, error: string) => void) | null) => { onJobImageErrorRef.current = handler; }, []),
    setOnJobFile: useCallback((handler: ((jobId: string, file: { name: string; mime: string; data: string }) => void) | null) => { onJobFileRef.current = handler; }, []),
  };
}
