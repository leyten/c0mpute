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
  // API-bridge job (v1 completions): the generate_image server tool is withheld
  // because an API client has no socket channel to receive the rendered image.
  internal?: boolean;
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
  'job:generating_image': (data: { jobId: string }) => void;
  'job:image': (data: { jobId: string; images: string[] }) => void;
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
  /** Native worker counts broken down by the model string they run. */
  nativeByModel?: Record<string, number>;
  jobsInQueue: number;
  jobsCompleted: number;
  tokensGenerated: number;
  avgJobDurationMs: number;
}

/** Model tier as selected by the user */
export type ModelTier = 'pro' | 'max';

/** A selectable model in the catalog. */
export interface ModelCatalogEntry {
  tier: ModelTier;
  /**
   * For native (max) models, the exact `model` string a worker must report at
   * registration to be allowed to serve this model. Lets one tier hold several
   * distinct models and route each job to a worker actually running it.
   */
  workerModel?: string;
}

/**
 * User-facing model IDs (the `model` field on job:submit) → routing info.
 * Add an entry here to make a new model selectable; pair it with a worker that
 * registers the matching `workerModel` string.
 */
export const MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  'native-max': { tier: 'max', workerModel: 'qwen3.5-27b-abliterated' },
  'native-supergemma': { tier: 'max', workerModel: 'supergemma4-26b' },
};

/** Map user-facing model IDs to tiers (defaults to pro for browser models). */
export function getModelTier(modelId?: string): ModelTier {
  return MODEL_CATALOG[modelId ?? '']?.tier ?? 'pro';
}

/**
 * The exact worker `model` string required to serve this model, or undefined
 * when any worker in the tier qualifies (e.g. browser/pro models).
 */
export function getRequiredWorkerModel(modelId?: string): string | undefined {
  return MODEL_CATALOG[modelId ?? '']?.workerModel;
}

// Worker selection weighting. Jobs are assigned to idle workers by weighted
// random choice, weight = avg tok/s, so earnings spread across the pool instead
// of winner-takes-all while still favoring faster workers (better UX).
//   FLOOR    — min tok/s used in the weight, so a worker with 0 measured speed
//              still gets a real chance (not frozen out).
//   EXPONENT — 1 = linear by speed; raise (>1) to favor faster workers harder
//              (e.g. when demand grows and UX speed matters more than fairness).
export const WORKER_WEIGHT_FLOOR = 5;
export const WORKER_WEIGHT_EXPONENT = 1;
export function selectionWeight(tokPerSec: number): number {
  return Math.pow(Math.max(tokPerSec, WORKER_WEIGHT_FLOOR), WORKER_WEIGHT_EXPONENT);
}

/**
 * Whether a worker can serve a job requesting `requestedModelId`. Max models may
 * pin a specific worker model (so a supergemma job only goes to a supergemma
 * worker); pro/browser models match any browser worker running c0mpute/dolphin.
 */
export function workerServesModel(
  worker: { type: 'browser' | 'native' | 'image'; model: string },
  requestedModelId?: string,
): boolean {
  if (getModelTier(requestedModelId) === 'max') {
    const required = getRequiredWorkerModel(requestedModelId);
    return worker.type === 'native' && (!required || worker.model === required);
  }
  return worker.type === 'browser'
    && (worker.model.includes('c0mpute') || worker.model.includes('dolphin'));
}

export const MAX_INPUT_CHARS = 2000;
export const MAX_OUTPUT_TOKENS = 4096;
