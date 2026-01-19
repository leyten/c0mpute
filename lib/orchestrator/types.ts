// Worker types
export interface WorkerInfo {
  id: string;
  socketId: string;
  model: string;
  status: 'idle' | 'busy';
  connectedAt: Date;
  jobsCompleted: number;
  tokensGenerated: number;
}

// Job types
export interface Job {
  id: string;
  userId: string;
  userSocketId: string;
  messages: ChatMessage[];
  status: 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
  assignedWorker?: string;
  createdAt: Date;
  startedAt?: Date; // When job started processing
  completedAt?: Date;
  response?: string;
  error?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Socket event types
export interface ServerToClientEvents {
  // For users
  'job:assigned': (data: { jobId: string; workerId: string }) => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
  'queue:position': (data: { position: number }) => void;
  
  // For workers
  'job:new': (data: { jobId: string; messages: ChatMessage[] }) => void;
  'worker:registered': (data: { workerId: string }) => void;
  
  // General
  'stats:update': (data: NetworkStats) => void;
}

export interface ClientToServerEvents {
  // From users
  'job:submit': (data: { messages: ChatMessage[] }, callback: (response: { jobId: string } | { error: string }) => void) => void;
  
  // From workers
  'worker:register': (data: { model: string }, callback: (response: { workerId: string } | { error: string }) => void) => void;
  'worker:unregister': () => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string; tokensGenerated: number }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
}

export interface NetworkStats {
  workersOnline: number;
  jobsInQueue: number;
  jobsCompleted: number;
  tokensGenerated: number;
  avgJobDurationMs: number; // Average job duration in milliseconds
}

// Shared constants
export const MAX_INPUT_CHARS = 2000;
export const MAX_OUTPUT_TOKENS = 1024;
