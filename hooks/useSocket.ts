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
  
  // Worker methods
  registerWorker: (model: string) => Promise<string>;
  unregisterWorker: () => void;
  sendToken: (jobId: string, token: string) => void;
  completeJob: (jobId: string, response: string, tokensGenerated: number) => void;
  failJob: (jobId: string, error: string) => void;
  
  // User methods
  submitJob: (messages: ChatMessage[]) => Promise<string>;
  
  // Event handlers (set by component)
  onNewJob: ((jobId: string, messages: ChatMessage[]) => void) | null;
  setOnNewJob: (handler: ((jobId: string, messages: ChatMessage[]) => void) | null) => void;
  onJobToken: ((jobId: string, token: string) => void) | null;
  setOnJobToken: (handler: ((jobId: string, token: string) => void) | null) => void;
  onJobComplete: ((jobId: string, response: string) => void) | null;
  setOnJobComplete: (handler: ((jobId: string, response: string) => void) | null) => void;
  onJobError: ((jobId: string, error: string) => void) | null;
  setOnJobError: (handler: ((jobId: string, error: string) => void) | null) => void;
  onJobAssigned: ((jobId: string, workerId: string) => void) | null;
  setOnJobAssigned: (handler: ((jobId: string, workerId: string) => void) | null) => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  
  // Event handler refs
  const onNewJobRef = useRef<((jobId: string, messages: ChatMessage[]) => void) | null>(null);
  const onJobTokenRef = useRef<((jobId: string, token: string) => void) | null>(null);
  const onJobCompleteRef = useRef<((jobId: string, response: string) => void) | null>(null);
  const onJobErrorRef = useRef<((jobId: string, error: string) => void) | null>(null);
  const onJobAssignedRef = useRef<((jobId: string, workerId: string) => void) | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const socket: TypedSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to orchestrator');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from orchestrator');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });

    // Network stats updates
    socket.on('stats:update', (stats) => {
      setNetworkStats(stats);
    });

    // Worker events
    socket.on('job:new', (data) => {
      console.log('[Socket] Received job:new event:', data.jobId);
      if (onNewJobRef.current) {
        console.log('[Socket] Calling job handler');
        onNewJobRef.current(data.jobId, data.messages);
      } else {
        console.log('[Socket] No job handler set!');
      }
    });

    // User events
    socket.on('job:token', (data) => {
      console.log('[Socket] Received job:token event:', data.jobId, data.token?.substring(0, 20));
      if (onJobTokenRef.current) {
        onJobTokenRef.current(data.jobId, data.token);
      } else {
        console.log('[Socket] No token handler set!');
      }
    });

    socket.on('job:complete', (data) => {
      setQueuePosition(null); // Clear queue position on completion
      if (onJobCompleteRef.current) {
        onJobCompleteRef.current(data.jobId, data.response);
      }
    });

    socket.on('job:error', (data) => {
      setQueuePosition(null); // Clear queue position on error
      if (onJobErrorRef.current) {
        onJobErrorRef.current(data.jobId, data.error);
      }
    });

    socket.on('job:assigned', (data) => {
      setQueuePosition(0); // 0 means processing (no longer in queue)
      if (onJobAssignedRef.current) {
        onJobAssignedRef.current(data.jobId, data.workerId);
      }
    });

    socket.on('queue:position', (data) => {
      setQueuePosition(data.position);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Worker: Register with orchestrator
  const registerWorker = useCallback(async (model: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }

      socketRef.current.emit('worker:register', { model }, (response) => {
        if ('workerId' in response) {
          resolve(response.workerId);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }, []);

  // Worker: Unregister from orchestrator
  const unregisterWorker = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('worker:unregister');
    }
  }, []);

  // Worker: Send token to user
  const sendToken = useCallback((jobId: string, token: string) => {
    if (socketRef.current) {
      socketRef.current.emit('job:token', { jobId, token });
    }
  }, []);

  // Worker: Complete job
  const completeJob = useCallback((jobId: string, response: string, tokensGenerated: number) => {
    if (socketRef.current) {
      socketRef.current.emit('job:complete', { jobId, response, tokensGenerated });
    }
  }, []);

  // Worker: Fail job
  const failJob = useCallback((jobId: string, error: string) => {
    if (socketRef.current) {
      socketRef.current.emit('job:error', { jobId, error });
    }
  }, []);

  // User: Submit job
  const submitJob = useCallback(async (messages: ChatMessage[]): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }

      socketRef.current.emit('job:submit', { messages }, (response) => {
        if ('jobId' in response) {
          resolve(response.jobId);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }, []);

  // Setters for event handlers
  const setOnNewJob = useCallback((handler: ((jobId: string, messages: ChatMessage[]) => void) | null) => {
    onNewJobRef.current = handler;
  }, []);

  const setOnJobToken = useCallback((handler: ((jobId: string, token: string) => void) | null) => {
    onJobTokenRef.current = handler;
  }, []);

  const setOnJobComplete = useCallback((handler: ((jobId: string, response: string) => void) | null) => {
    onJobCompleteRef.current = handler;
  }, []);

  const setOnJobError = useCallback((handler: ((jobId: string, error: string) => void) | null) => {
    onJobErrorRef.current = handler;
  }, []);

  const setOnJobAssigned = useCallback((handler: ((jobId: string, workerId: string) => void) | null) => {
    onJobAssignedRef.current = handler;
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    networkStats,
    queuePosition,
    
    // Worker methods
    registerWorker,
    unregisterWorker,
    sendToken,
    completeJob,
    failJob,
    
    // User methods
    submitJob,
    
    // Event handlers
    onNewJob: onNewJobRef.current,
    setOnNewJob,
    onJobToken: onJobTokenRef.current,
    setOnJobToken,
    onJobComplete: onJobCompleteRef.current,
    setOnJobComplete,
    onJobError: onJobErrorRef.current,
    setOnJobError,
    onJobAssigned: onJobAssignedRef.current,
    setOnJobAssigned,
  };
}
