/** Capabilities a worker advertises during registration */
export interface WorkerCapabilities {
  search?: boolean;
  uncensored?: boolean;
  longContext?: boolean;
}

// Worker types
export interface WorkerInfo {
  id: string;
  socketId: string;
  model: string;
  type: 'browser' | 'native';
  capabilities: WorkerCapabilities;
  status: 'idle' | 'busy';
  connectedAt: Date;
  jobsCompleted: number;
  tokensGenerated: number;
  tokPerSec: number;
  privyUserId?: string;
}

// Job types
export interface Job {
  id: string;
  userId: string;
  userSocketId: string;
  privyUserId?: string;
  messages?: ChatMessage[];
  requestedModel?: string;
  status: 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
  assignedWorker?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  response?: string;
  error?: string;
  searchContext?: string;
  searchResults?: { title: string; url: string; description: string }[];
  serverTokenCount?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Socket event types
export interface ServerToClientEvents {
  'job:searching': (data: { jobId: string }) => void;
  'job:sources': (data: { jobId: string; sources: { title: string; url: string; description: string }[] }) => void;
  'job:assigned': (data: { jobId: string; workerId: string }) => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
  'queue:position': (data: { position: number }) => void;
  'job:new': (data: { jobId: string; messages?: ChatMessage[]; searchContext?: string }) => void;
  'job:cancel': (data: { jobId: string }) => void;
  'worker:registered': (data: { workerId: string }) => void;
  'stats:update': (data: NetworkStats) => void;
  'native:status': (data: { online: boolean; workerId?: string; jobsCompleted: number; tokensGenerated: number; tokPerSec: number; currentJob?: string }) => void;
}

export interface ClientToServerEvents {
  'job:submit': (data: { messages?: ChatMessage[]; model?: string; authToken?: string }, callback: (response: { jobId: string } | { error: string }) => void) => void;
  'worker:register': (data: { model: string; authToken?: string; tokPerSec?: number; type?: 'browser' | 'native'; capabilities?: WorkerCapabilities }, callback: (response: { workerId: string } | { error: string }) => void) => void;
  'worker:unregister': () => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string; tokensGenerated: number }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
}

export interface NetworkStats {
  workersOnline: number;
  browserWorkers: number;
  nativeWorkers: number;
  jobsInQueue: number;
  jobsCompleted: number;
  tokensGenerated: number;
  avgJobDurationMs: number;
}

/** Model tier as selected by the user */
export type ModelTier = 'free' | 'pro' | 'max';

/** Map user-facing model IDs to tiers */
export function getModelTier(modelId?: string): ModelTier {
  if (!modelId) return 'free';
  if (modelId === 'native-max') return 'max';
  if (modelId.includes('c0mpute') || modelId.includes('dolphin')) return 'pro';
  return 'free';
}

export const MAX_INPUT_CHARS = 2000;
export const MAX_OUTPUT_TOKENS = 4096;
