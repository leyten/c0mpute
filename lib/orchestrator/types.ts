/** Capabilities a worker advertises during registration */
export interface WorkerCapabilities {
  search?: boolean;
  uncensored?: boolean;
  longContext?: boolean;
  vision?: boolean;
  tools?: boolean;
  image?: boolean; // runs ComfyUI image generation (type 'image' workers)
}

// Worker types
export interface WorkerInfo {
  id: string;
  socketId: string;
  model: string;
  type: 'browser' | 'native' | 'image';
  capabilities: WorkerCapabilities;
  status: 'idle' | 'busy';
  connectedAt: Date;
  jobsCompleted: number;
  tokensGenerated: number;
  tokPerSec: number;
  privyUserId?: string;
  // Real throughput measured from completed jobs (server tokens / wall time).
  // Rolling window used to catch workers that pass the signup benchmark then degrade.
  measuredTokPerSec?: number[];
  // Count of jobs returned at physically-impossible speed (fake-output signal).
  fakeStrikes?: number;
  // Real jobs completed since the last canary challenge was sent to this worker.
  jobsSinceCanary?: number;
  // Epoch ms of the last canary dispatched to this worker.
  lastCanaryAt?: number;
}

// Tool calling types
export interface ToolCall {
  type: 'function';
  function: {
    index?: number;
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Job types
export interface Job {
  id: string;
  userId: string;
  userSocketId: string;
  privyUserId?: string;
  messages?: ChatMessage[];
  requestedModel?: string;
  think?: boolean;
  creditsCharged?: number;
  // Worker-pay basis (tier list price in credits) for a free-prompt job, where
  // creditsCharged is 0 but the worker is still paid out of the treasury. 0 for
  // paid jobs (they pay from creditsCharged).
  subsidyCredits?: number;
  // Which subsidy lane funded this job (when subsidyCredits > 0): 'free' = the
  // onboarding free-prompt lane (gated by the daily free-subsidy cap at payout),
  // 'allowance' = the staker inference allowance (already pool-capped at consume
  // time, so the worker is paid unconditionally).
  subsidyKind?: 'free' | 'allowance';
  status: 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
  assignedWorker?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  response?: string;
  error?: string;
  serverTokenCount?: number;
  // Rolling tail of streamed output, for the server-side safety scan.
  streamBuffer?: string;
  // Canary challenge: a synthetic known-answer job injected by the orchestrator to
  // verify the worker is really running a model. Never billed or shown to a user.
  isCanary?: boolean;
  canaryExpected?: { sum: number; nonce: string };
  // API tools passthrough: when the public API submits a job with the caller's
  // own tools, the orchestrator passes them to the worker and, when the model
  // emits a tool call, RETURNS it to the API client (finish_reason tool_calls)
  // instead of executing it server-side — the agent runs its own tools.
  clientTools?: ToolDefinition[];
  toolPassthrough?: boolean;
  pendingToolCalls?: ToolCall[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_name?: string;
}

// Socket event types
export interface ServerToClientEvents {
  'job:searching': (data: { jobId: string }) => void;
  'job:sources': (data: { jobId: string; sources: { title: string; url: string; description: string }[] }) => void;
  'job:assigned': (data: { jobId: string; workerId: string }) => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string }) => void;
  'job:tool_calls': (data: { jobId: string; toolCalls: ToolCall[] }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
  'queue:position': (data: { position: number }) => void;
  'job:new': (data: { jobId: string; messages?: ChatMessage[]; tools?: ToolDefinition[]; think?: boolean }) => void;
  'job:cancel': (data: { jobId: string }) => void;
  'job:counted': (data: { jobId: string; tokensGenerated: number }) => void;
  'worker:registered': (data: { workerId: string }) => void;
  'stats:update': (data: NetworkStats) => void;
  'native:status': (data: { online: boolean; workerId?: string; jobsCompleted: number; tokensGenerated: number; tokPerSec: number; currentJob?: string }) => void;
  // Image generation (decentralized). Orchestrator -> worker: a job to run.
  'image:job': (data: { jobId: string; workflow: Record<string, unknown> }) => void;
  'image:cancel': (data: { jobId: string }) => void;
  // Orchestrator -> submitter (internal web): the result or failure.
  'image:done': (data: { jobId: string; image: string; seed?: number; width?: number; height?: number }) => void;
  'image:error': (data: { jobId: string; error: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  'job:submit': (data: { messages?: ChatMessage[]; model?: string; authToken?: string; think?: boolean; privyUserId?: string; tools?: ToolDefinition[] }, callback: (response: { jobId: string; freeRemaining?: number } | { error: string; code?: string }) => void) => void;
  'worker:register': (data: { model: string; authToken?: string; tokPerSec?: number; type?: 'browser' | 'native' | 'image'; capabilities?: WorkerCapabilities }, callback: (response: { workerId: string } | { error: string }) => void) => void;
  'worker:unregister': () => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string; tokensGenerated: number }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
  'job:tool_call': (data: { jobId: string; toolCalls: ToolCall[] }) => void;
  // Image generation. Internal web -> orchestrator: submit a render.
  'image:submit': (data: { workflow: Record<string, unknown>; privyUserId?: string; model?: string; seed?: number; width?: number; height?: number; creditsCharged?: number; subsidized?: boolean }, callback: (response: { jobId: string } | { error: string; code?: string }) => void) => void;
  // Image worker -> orchestrator: result or failure.
  'image:result': (data: { jobId: string; image: string }) => void;
  'image:failed': (data: { jobId: string; error: string }) => void;
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
export type ModelTier = 'pro' | 'max';

/** Map user-facing model IDs to tiers */
export function getModelTier(modelId?: string): ModelTier {
  if (modelId === 'native-max') return 'max';
  return 'pro';
}

export const MAX_INPUT_CHARS = 2000;
export const MAX_OUTPUT_TOKENS = 4096;
