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
  // Real client IP (restored from Cloudflare). Used for per-IP farm caps.
  ip?: string;
  // Account old enough (see MIN_WORKER_ACCOUNT_AGE_HOURS) to count in the public
  // worker stats and to be paid for subsidized free jobs. Fresh accounts can still
  // serve PAID jobs — they just can't farm the free lane or pad the count.
  accountAgeOk?: boolean;
  // Real throughput measured from completed jobs (server tokens / wall time).
  // Rolling window used to catch workers that pass the signup benchmark then degrade.
  measuredTokPerSec?: number[];
  // Count of jobs returned at physically-impossible speed (fake-output signal).
  fakeStrikes?: number;
  // Real jobs completed since the last canary challenge was sent to this worker.
  jobsSinceCanary?: number;
  // Epoch ms of the last canary dispatched to this worker.
  lastCanaryAt?: number;
  // Context window the worker runs with, as reported at registration. Native
  // workers self-tune it to their VRAM (8K on a small card, 32K on a 4090), so it
  // varies across the pool; browser workers report the fixed 4096 of their ctx4k
  // model lib. Undefined = unknown: image workers never have one, and native
  // workers from before this field existed (2.8.2 and older) never send it.
  // Diagnostics only — dispatch does not consider it.
  numCtx?: number;
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

/**
 * Which lane funded a job the user paid no credits for. See Job.subsidyKind
 * below for what each one means.
 */
export type SubsidyKind = 'free' | 'free_grant' | 'allowance' | 'plan';

/**
 * Does this lane spend the TREASURY's money?
 *
 * The daily/hourly free-subsidy caps exist to bound what the network gives
 * away, so they must gate exactly the lanes nobody paid for and nothing else.
 * A plan grant was prepaid and a staker allowance was already pool-capped when
 * it was drawn; putting either under the free caps would let a quiet day of
 * onboarding traffic stop paying workers for inference that was funded.
 *
 * The same predicate gates the new-account worker check, for the same reason:
 * it exists to stop a fresh sybil account serving its own free jobs.
 */
export function isFreeSubsidyKind(kind: SubsidyKind | undefined): boolean {
  return kind === 'free' || kind === 'free_grant';
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
  // Credits currently HELD from the user's balance for this job. A reservation
  // until settleJobCharge runs, the real per-token price after — so every refund
  // path gives back whatever is still held without knowing which it is.
  creditsCharged?: number;
  // Worker-pay basis in credits for a job the user paid nothing for (free prompt
  // or staker allowance), where creditsCharged is 0 but the worker is still paid
  // out of the treasury. Reserved then settled exactly like creditsCharged, so
  // the treasury's subsidy is the job's REAL cost, not its worst case. 0 for
  // paid jobs (they pay from creditsCharged).
  subsidyCredits?: number;
  // Estimated input tokens (chars/4) measured at submit, AFTER history trimming
  // — the input half of the price. Frozen here because the messages array is
  // what was actually shipped to the worker, and settlement happens minutes
  // later on a job record, not on a request.
  inputTokens?: number;
  // The UTC day a daily-allowance draw was written to (staker, plan or free
  // grant alike). A job charged at 23:59 and settled at 00:01 has to release
  // against the row it drew from, or it burns yesterday's allowance and
  // inflates today's.
  allowanceDay?: string;
  // Set once the reservation has been turned into the real charge. Latched like
  // `refunded`: a job that reaches two teardown paths settles exactly once.
  settled?: boolean;
  // Which lane funded this job, when the user paid no credits for it.
  //
  //   'free'       — the onboarding welcome prompts (a lifetime count, not a
  //                  daily grant). Treasury-subsidized, gated by the daily
  //                  free-subsidy cap at payout.
  //   'free_grant' — the standing Free daily grant. Also treasury-subsidized
  //                  and under the same cap, but credit-denominated, so an
  //                  unused reservation is released back to the day's bucket.
  //   'allowance'  — the staker inference allowance. Pool-capped when it was
  //                  drawn, so the worker is paid unconditionally.
  //   'plan'       — a paid plan's daily grant. NOT a subsidy: the period was
  //                  prepaid, so the worker is paid out of that revenue and
  //                  the free-subsidy caps must never gate it.
  subsidyKind?: SubsidyKind;
  // Set once the job's charge has been given back (credits, free prompt or
  // allowance). Guards against a job that reaches two failure paths being
  // credited twice.
  refunded?: boolean;
  status: 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
  assignedWorker?: string;
  createdAt: Date;
  startedAt?: Date;
  // Epoch ms of the last thing the orchestrator OBSERVED this job do: a token
  // relayed, a tool round opening or closing. What the liveness sweep judges a
  // running job on (see the liveness windows in orchestrator.ts) — total runtime
  // says nothing about health, and a long thinking answer legitimately runs for
  // minutes. Unset until the first observation; the sweep then falls back to
  // startedAt, so queue wait never counts against it.
  lastProgressAt?: number;
  // A server-side tool round is executing: the worker is blocked on
  // job:tool_result and CANNOT emit tokens, so token silence is expected here.
  toolRunning?: boolean;
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

/**
 * What a finished job was actually BILLED on — not an estimate made anywhere
 * else. `inputTokens` is the count measured at submit, after history trimming,
 * so it is the prompt the worker really received; `outputTokens` is the
 * orchestrator's own count of streamed tokens, capped at the lane's output
 * ceiling; `credits` is the settled charge those two produced.
 *
 * Exists so the public API can report a `usage` block that agrees with the
 * ledger. Optional on the wire: a job that ends on a rejection path is torn down
 * without one, and no client may assume it is there.
 */
export interface JobUsage {
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

// Socket event types
export interface ServerToClientEvents {
  'job:searching': (data: { jobId: string }) => void;
  'job:sources': (data: { jobId: string; sources: { title: string; url: string; description: string }[] }) => void;
  'job:generating_image': (data: { jobId: string }) => void;
  'job:image': (data: { jobId: string; images: string[] }) => void;
  'job:image_error': (data: { jobId: string; error: string }) => void;
  // A generated document, delivered inline. `data` is a full data URL
  // (`data:application/pdf;base64,...`) so the client can hang it straight off
  // a download link — unlike job:image, which sends bare base64.
  'job:file': (data: { jobId: string; name: string; mime: string; data: string }) => void;
  'job:assigned': (data: { jobId: string; workerId: string }) => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string; usage?: JobUsage }) => void;
  'job:tool_calls': (data: { jobId: string; toolCalls: ToolCall[]; usage?: JobUsage }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
  'queue:position': (data: { position: number }) => void;
  'job:new': (data: { jobId: string; messages?: ChatMessage[]; tools?: ToolDefinition[]; think?: boolean }) => void;
  'job:cancel': (data: { jobId: string }) => void;
  'job:counted': (data: { jobId: string; tokensGenerated: number }) => void;
  'worker:registered': (data: { workerId: string }) => void;
  'stats:update': (data: NetworkStats) => void;
  'native:status': (data: { online: boolean; workerId?: string; connectedAt?: number; jobsCompleted: number; tokensGenerated: number; tokPerSec: number; currentJob?: string }) => void;
  // Image generation (decentralized). Orchestrator -> worker: a job to run.
  'image:job': (data: { jobId: string; workflow: Record<string, unknown> }) => void;
  'image:cancel': (data: { jobId: string }) => void;
  // Orchestrator -> submitter (internal web): the result or failure.
  'image:done': (data: { jobId: string; image: string; seed?: number; width?: number; height?: number }) => void;
  'image:error': (data: { jobId: string; error: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  'job:submit': (data: { messages?: ChatMessage[]; model?: string; authToken?: string; think?: boolean; privyUserId?: string; tools?: ToolDefinition[]; freeOnly?: boolean }, callback: (response: { jobId: string; freeRemaining?: number } | { error: string; code?: string }) => void) => void;
  'worker:register': (data: { model: string; authToken?: string; tokPerSec?: number; type?: 'browser' | 'native' | 'image'; capabilities?: WorkerCapabilities; numCtx?: number }, callback: (response: { workerId: string } | { error: string }) => void) => void;
  'worker:unregister': () => void;
  'job:token': (data: { jobId: string; token: string }) => void;
  'job:complete': (data: { jobId: string; response: string; tokensGenerated: number }) => void;
  'job:error': (data: { jobId: string; error: string }) => void;
  'job:tool_call': (data: { jobId: string; toolCalls: ToolCall[] }) => void;
  /** User pressed Stop. Named `job:abort` rather than `job:cancel` because that
   *  name is already the orchestrator -> worker direction. */
  'job:abort': (data: { jobId: string }) => void;
  // Image generation. Internal web -> orchestrator: submit a render.
  'image:submit': (data: { workflow: Record<string, unknown>; privyUserId?: string; model?: string; seed?: number; width?: number; height?: number; creditsCharged?: number; subsidized?: boolean; subsidyKind?: SubsidyKind }, callback: (response: { jobId: string } | { error: string; code?: string }) => void) => void;
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
  /** decentralized-swarm model ids with at least one READY ring serving them (the /models
   *  availability signal — swarm nodes are not `native` workers, so nativeByModel never sees them). */
  swarmModels?: string[];
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
  // THE public model — one name everywhere: this id, the worker's registration
  // string, and what users see. Served by worker 2.9.0+.
  'qwen3.8-27b-uncensored': { tier: 'max', workerModel: 'qwen3.8-27b-uncensored' },
  // native-max, native-supergemma and native-code are retired: their API ids now
  // alias to this entry in /api/v1/chat/completions (mapModel).
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
 * pin a specific worker model (so a qwen3.8 job only goes to a worker actually
 * running it, never to the legacy fleet); pro/browser models match any browser
 * worker running one of ours.
 *
 * The substring set is load-bearing and additive. A browser worker whose model
 * matches none of these connects, reports ready, and is then silently never
 * selected — no error anywhere. `compute` admits the Qwen3.5 rungs
 * (Qwen3.5-9B-compute-…, Qwen3.5-4B-compute-…); note that it does NOT cover
 * `c0mpute`, which is a different string, so the old entry stays for tabs that
 * have not reloaded onto the new build yet. `dolphin` predates both.
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
    && (worker.model.includes('compute') || worker.model.includes('c0mpute') || worker.model.includes('dolphin'));
}

// ── Input (context) budget ──
// Estimated INPUT tokens a job may carry, by lane. The orchestrator trims the
// oldest history to fit at submit (boundInputMessages in orchestrator.ts), so
// this is the only server-side ceiling on how much prompt one request can push
// through the network — a cost/abuse bound first, a context-fit hint second.
//
// NATIVE (max tier, and sharded-swarm models): native workers self-tune num_ctx
// to their VRAM and report 8192-32768 at registration, and their output budget
// is 4096 tokens (8192 with thinking, c0mpute-worker/src/config.ts). 12K input
// + 8K output sits inside a 32K worker with room for the injected system prompt
// and the tool schemas; smaller workers already truncate at their own end, which
// the [ctx-exceeded] probe measures. A swarm ring's KV cap is 40960, so the same
// number is comfortably inside it too.
export const MAX_INPUT_TOKENS_NATIVE = 12_000;
// BROWSER (pro tier): the browser worker runs at a 4096-token window — prompt
// AND output share it — and it asks for 2048 output tokens on top of a
// ~170-token system prompt (app/earn/engine/useWorkerEngine.ts), leaving ~1900
// tokens of prompt. 1800 keeps margin for chars/4 being an estimate. The window
// is BROWSER_MODEL_CTX now, not a property of the wasm: from web-llm 0.2.83 the
// libs no longer bake it in, so raising it is a change here and there together.
// Nothing bounded this before: the chat UI caps its window at the last 10 turns
// and the browser worker strips <think> blocks out of history, but neither is a
// LENGTH bound — an overlong conversation just overflowed the window at
// inference time.
export const MAX_INPUT_TOKENS_BROWSER = 1_800;

// ── Output budget ──
// The most output one request can be BILLED and PAID for, by lane. Both halves
// matter: it is the ceiling the submit-time reservation is sized against, and
// the same number caps the settled charge, so worker pay stays exactly a share
// of what the user was charged no matter how long a worker keeps streaming.
//
// A cap here is NOT just a reservation size. Settlement clamps the charge to
// what was held, so a cap set below what the lane can actually generate is a
// permanent discount on every request that exceeds it, never a deferred charge —
// and the worker, paid a share of that charge, is underpaid by the same
// fraction. Each lane's number is therefore the most that lane can really emit.
//
// NATIVE: the worker's own output budget (c0mpute-worker/src/config.ts
// MAX_OUTPUT_TOKENS), which is also the cap the orchestrator has always applied
// to the payout token count.
export const MAX_OUTPUT_TOKENS = 4096;
// NATIVE + thinking: the worker raises its budget to 8192 when thinking is on
// (MAX_OUTPUT_TOKENS_THINKING, same file), because the reasoning and the answer
// share it. Billing follows. Capped at 4096 instead, a full-length thinking
// answer would bill for half the tokens it generated — deleting the retired
// deep-think surcharge twice over — and would pay the worker half rate for the
// most expensive work on the network.
export const MAX_OUTPUT_TOKENS_THINKING = 8192;
// BROWSER: what the browser worker actually asks its model for
// (BROWSER_MAX_OUTPUT_TOKENS in app/earn/engine/useWorkerEngine.ts). A browser
// answer cannot exceed it, so reserving the native cap here would hold twice
// what the lane can ever spend. No separate thinking budget — one window serves
// both.
export const MAX_OUTPUT_TOKENS_BROWSER = 2048;
// SWARM: the `maxNew` the orchestrator puts on every swarm dispatch, so an
// honest ring cannot exceed it. Billing to the native 4096 would hold 8x what
// the lane can spend — and because a swarm job's token count is incremented per
// relayed frame from a coordinator that is a permissionless stranger paid out of
// that very count, it would also leave 8x of headroom for a ring to inflate its
// own revenue. Exported so the dispatch and the meter read one number.
export const MAX_OUTPUT_TOKENS_SWARM = 512;
