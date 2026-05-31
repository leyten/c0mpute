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
  
  registerWorker: (model: string, authToken: string, tokPerSec?: number) => Promise<string>;
  unregisterWorker: () => void;
  sendToken: (jobId: string, token: string) => void;
  completeJob: (jobId: string, response: string, tokensGenerated: number) => void;
  failJob: (jobId: string, error: string) => void;
  
  submitJob: (data: { messages?: ChatMessage[]; model?: string; authToken: string; think?: boolean }) => Promise<string>;
  
  setOnNewJob: (handler: ((jobId: string, messages?: ChatMessage[]) => void) | null) => void;
  setOnJobToken: (handler: ((jobId: string, token: string) => void) | null) => void;
  setOnJobComplete: (handler: ((jobId: string, response: string) => void) | null) => void;
  setOnJobError: (handler: ((jobId: string, error: string) => void) | null) => void;
  setOnJobAssigned: (handler: ((jobId: string, workerId: string) => void) | null) => void;
  setOnJobCancel: (handler: ((jobId: string) => void) | null) => void;
  setOnJobSearching: (handler: ((jobId: string) => void) | null) => void;
  setOnJobSources: (handler: ((jobId: string, sources: { title: string; url: string; description: string }[]) => void) | null) => void;
  nativeStatus: { online: boolean; workerId?: string; jobsCompleted: number; tokensGenerated: number; tokPerSec: number; currentJob?: string } | null;
}

export function useSocket(authToken?: string | null): UseSocketReturn {
  const socketRef = useRef<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [nativeStatus, setNativeStatus] = useState<UseSocketReturn['nativeStatus']>(null);
  
  const onNewJobRef = useRef<((jobId: string, messages?: ChatMessage[]) => void) | null>(null);
  const onJobTokenRef = useRef<((jobId: string, token: string) => void) | null>(null);
  const onJobCompleteRef = useRef<((jobId: string, response: string) => void) | null>(null);
  const onJobErrorRef = useRef<((jobId: string, error: string) => void) | null>(null);
  const onJobAssignedRef = useRef<((jobId: string, workerId: string) => void) | null>(null);
  const onJobCancelRef = useRef<((jobId: string) => void) | null>(null);
  const onJobSearchingRef = useRef<((jobId: string) => void) | null>(null);
  const onJobSourcesRef = useRef<((jobId: string, sources: { title: string; url: string; description: string }[]) => void) | null>(null);

  useEffect(() => {
    // Don't connect until we have an auth token
    if (!authToken) return;

    const socket: TypedSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token: authToken },
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
        onNewJobRef.current(data.jobId, data.messages);
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
        onJobCompleteRef.current(data.jobId, data.response);
      }
    });

    socket.on('job:error', (data) => {
      setQueuePosition(null);
      if (onJobErrorRef.current) {
        onJobErrorRef.current(data.jobId, data.error);
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

    (socket as any).on('native:status', (data: any) => {
      setNativeStatus(data);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authToken]);

  const registerWorker = useCallback(async (model: string, authToken: string, tokPerSec?: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }
      socketRef.current.emit('worker:register', { model, authToken, tokPerSec }, (response) => {
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

  const submitJob = useCallback(async (data: { messages?: ChatMessage[]; model?: string; authToken: string; think?: boolean }): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }
      socketRef.current.emit('job:submit', {
        messages: data.messages,
        model: data.model,
        authToken: data.authToken,
        think: data.think,
      }, (response) => {
        if ('jobId' in response) {
          resolve(response.jobId);
        } else {
          reject(new Error(response.error));
        }
      });
    });
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
    setOnNewJob: useCallback((handler: ((jobId: string, messages?: ChatMessage[]) => void) | null) => { onNewJobRef.current = handler; }, []),
    setOnJobToken: useCallback((handler: ((jobId: string, token: string) => void) | null) => { onJobTokenRef.current = handler; }, []),
    setOnJobComplete: useCallback((handler: ((jobId: string, response: string) => void) | null) => { onJobCompleteRef.current = handler; }, []),
    setOnJobError: useCallback((handler: ((jobId: string, error: string) => void) | null) => { onJobErrorRef.current = handler; }, []),
    setOnJobAssigned: useCallback((handler: ((jobId: string, workerId: string) => void) | null) => { onJobAssignedRef.current = handler; }, []),
    setOnJobCancel: useCallback((handler: ((jobId: string) => void) | null) => { onJobCancelRef.current = handler; }, []),
    setOnJobSearching: useCallback((handler: ((jobId: string) => void) | null) => { onJobSearchingRef.current = handler; }, []),
    setOnJobSources: useCallback((handler: ((jobId: string, sources: { title: string; url: string; description: string }[]) => void) | null) => { onJobSourcesRef.current = handler; }, []),
  };
}
