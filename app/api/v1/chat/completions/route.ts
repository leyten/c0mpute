import { NextRequest, NextResponse } from 'next/server';
import { io, Socket } from 'socket.io-client';
import { resolveApiKeyFull, getApiKeyRequestsToday, bumpApiKeyRequest } from '@/lib/db';
import { MODEL_CATALOG } from '@/lib/orchestrator/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Phase 1 of API_PLAN.md: OpenAI-compatible, non-streaming.
// The orchestrator is a separate Socket.io service, so this route acts as a
// trusted internal Socket.io client (authed with INTERNAL_API_SECRET) and
// reuses ALL existing routing/billing/worker logic. The end user is resolved
// from their API key here and passed through as privyUserId so billing stays
// tied to the real user.

const ORCH_URL = process.env.INTERNAL_ORCHESTRATOR_URL || 'http://127.0.0.1:3004';
// Liveness, mirroring the orchestrator: what ends a request is SILENCE, not
// elapsed time. A thinking answer is budgeted at 8192 output tokens and the
// fleet runs ~30-60 tok/s, so a full-length one streams for 3-5 minutes — the
// old flat 280s ceiling cut those off mid-answer and handed the caller a
// timeout for work that was still arriving.
//
// IDLE is re-armed on every job:token. Its size is set by the worst honest
// silence before the FIRST token: the orchestrator holds a job in its queue for
// up to 180s and then allows another 120s for the first token, so anything
// under 300s gives up while the network is still within its own budget.
const JOB_IDLE_TIMEOUT_MS = 330_000;
// Absolute backstop, above the orchestrator's queue timeout plus its 600s hard
// ceiling — a job that streams that long is the network's to kill, and its
// job:error is a better answer than our generic timeout. Only reachable while
// tokens keep flowing; anything wedged trips IDLE long before.
const JOB_MAX_TIMEOUT_MS = 900_000;

// Public model name -> { orchestrator model id, think }. Ids must be
// MODEL_CATALOG keys (max tier) or the pro/swarm lanes below.
function mapModel(model: string | undefined): { model: string; think: boolean } | null {
  switch ((model || '').trim()) {
    // THE model. One public id, same string the workers register.
    case 'qwen3.8-27b-uncensored':
      return { model: 'qwen3.8-27b-uncensored', think: false };
    case 'qwen3.8-27b-uncensored-think':
      return { model: 'qwen3.8-27b-uncensored', think: true };
    // MIGRATION ALIASES — every retired public id keeps answering, now on the
    // single model: the legacy 2.8.x fleet is retired and its catalog entry is
    // gone. After a grace period these drop entirely.
    case 'c0mpute-max':
      return { model: 'qwen3.8-27b-uncensored', think: false };
    case 'c0mpute-max-think':
      return { model: 'qwen3.8-27b-uncensored', think: true };
    case 'supergemma4-26b':
    case 'c0mpute-max-supergemma':
    case 'code':
    case 'devstral-24b':
    case 'c0mpute-code':
      return { model: 'qwen3.8-27b-uncensored', think: false };
    // the decentralized SWARM model — served by the permissionless GPU network, not a whole-model
    // worker. The orchestrator id must be a MODEL_SPECS key so tryDispatchSwarm routes it to a ring
    // (specForModel); think rides reasoning through serveRequest.
    case 'minimax-m2.5':
    case 'c0mpute-swarm':
      return { model: 'minimax-m2.5', think: false };
    case 'c0mpute-swarm-think':
      return { model: 'minimax-m2.5', think: true };
    case 'c0mpute-pro':
    case '':
    case undefined as any:
      return { model: 'c0mpute-pro', think: false };
    default:
      return null; // unknown model
  }
}

// Cutover tripwire: every max-tier id mapModel can return MUST exist in
// MODEL_CATALOG. An alias left pointing at a removed catalog key would not
// error — getModelTier falls through to 'pro', so the request gets billed 10cr
// and answered by a small browser worker. Fail loudly at module load instead:
// if you remove a catalog key, repoint the aliases above first.
for (const id of ['qwen3.8-27b-uncensored']) {
  if (!MODEL_CATALOG[id]) {
    throw new Error(`mapModel routes to '${id}' but MODEL_CATALOG no longer has it — update the aliases in this file.`);
  }
}

function oaiError(message: string, type: string, status: number, code?: string) {
  return NextResponse.json({ error: { message, type, param: null, code: code ?? null } }, { status });
}

/** A think-burnout in the caller's terms. Not a server fault: the request came
 *  back unanswerable exactly as it was asked, so both lanes report it with a
 *  code to branch on rather than a 5xx an SDK will quietly retry. */
const THINK_BURNOUT_MESSAGE = 'The model finished thinking without writing an answer. Retry without thinking (drop the -think model id).';

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

/** What the orchestrator actually billed the job on — see JobUsage in
 *  lib/orchestrator/types.ts. Structurally typed rather than imported so this
 *  route keeps no compile-time dependency on the orchestrator bundle. */
type BilledUsage = { inputTokens: number; outputTokens: number; credits: number };

/**
 * The `usage` block. Prefers the orchestrator's billed counts so what a caller
 * reads is what their balance was charged for — its input count is measured
 * after history trimming, and its output count is the server's own token count.
 * Falls back to the local estimate only when a job ended without reporting one
 * (a rejection path), which is also all this endpoint ever had.
 */
function usageBlock(billed: BilledUsage | undefined, promptTokens: number, completionTokens: number) {
  const prompt = billed?.inputTokens ?? promptTokens;
  const completion = billed?.outputTokens ?? completionTokens;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

function safeJsonParse(s: any): Record<string, unknown> {
  if (s && typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

// Split OpenAI message content into plain text + base64 images. content may be
// a string or an array of {type:'text'} / {type:'image_url'} parts (vision).
// The worker expects raw base64 images (no data: prefix); https image URLs are
// not supported in this version (only inline data: URLs).
function extractContent(content: any): { text: string; images: string[] } {
  if (typeof content === 'string') return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: content == null ? '' : String(content), images: [] };
  const texts: string[] = [];
  const images: string[] = [];
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text);
    else if (part?.type === 'image_url') {
      const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      if (typeof url === 'string' && url.startsWith('data:')) {
        const b64 = url.split(',')[1];
        if (b64) images.push(b64);
      }
    }
  }
  return { text: texts.join('\n'), images };
}

// Map OpenAI request messages → the worker/Ollama shape.
// - assistant.tool_calls: arguments come as a JSON *string* (OpenAI) → object (Ollama)
// - tool results: OpenAI uses {role:'tool', tool_call_id} → Ollama uses {role:'tool', tool_name};
//   resolve the name from the assistant tool_calls earlier in the same conversation.
// - vision: array content → text + images[] (see extractContent).
function mapMessagesIn(messages: any[]): any[] {
  const idToName: Record<string, string> = {};
  for (const m of messages) {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id && tc.function?.name) idToName[tc.id] = tc.function.name;
      }
    }
  }
  return messages.map((m) => {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      return {
        role: 'assistant',
        content: typeof m.content === 'string' ? m.content : '',
        tool_calls: m.tool_calls.map((tc: any) => ({
          type: 'function',
          function: { name: tc.function?.name, arguments: safeJsonParse(tc.function?.arguments) },
        })),
      };
    }
    if (m?.role === 'tool') {
      return {
        role: 'tool',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
        tool_name: m.name || (m.tool_call_id ? idToName[m.tool_call_id] : undefined),
      };
    }
    const { text, images } = extractContent(m.content);
    const out: any = { role: m.role, content: text };
    if (images.length) out.images = images;
    return out;
  });
}

// Map worker/Ollama tool calls → OpenAI tool_calls (arguments back to a JSON string, add ids).
function mapToolCallsOut(toolCalls: any[]): any[] {
  return (toolCalls || []).map((tc, i) => ({
    id: `call_${Math.random().toString(36).slice(2, 10)}${i}`,
    type: 'function',
    function: {
      name: tc.function?.name,
      arguments: JSON.stringify(tc.function?.arguments ?? {}),
    },
  }));
}

// Per-key rate limit — in-memory sliding window (single next-server process).
// The orchestrator's per-account 20/5min limit is skipped for API jobs in favor
// of this per-key limit.
const RATE_LIMIT_PER_MIN = Number(process.env.API_RATE_LIMIT_PER_MIN || 60);
// Persistent per-day request cap for free-only ("resale") keys — survives web
// restarts (unlike the in-memory per-minute limiter) and bounds resale abuse on
// top of the already pool-capped staking allowance. 0 = unlimited.
const FREE_ONLY_DAILY_CAP = Number(process.env.API_FREE_ONLY_DAILY_CAP || 2000);
// Keyed by API-key ID, never by the raw secret: this map lives as long as the
// process, so raw key material must not accumulate in it. Swept once it grows so
// a stream of distinct keys can't leak memory either — nothing else deletes.
const rateBuckets = new Map<string, number[]>();
function rateLimited(keyId: string): boolean {
  const now = Date.now();
  if (rateBuckets.size > 5_000) {
    for (const [k, hits] of rateBuckets) {
      if (!hits.some((t) => now - t < 60_000)) rateBuckets.delete(k);
    }
  }
  const win = (rateBuckets.get(keyId) || []).filter((t) => now - t < 60_000);
  if (win.length >= RATE_LIMIT_PER_MIN) { rateBuckets.set(keyId, win); return true; }
  win.push(now);
  rateBuckets.set(keyId, win);
  return false;
}

// Orchestrator submit-ack → HTTP. OpenAI SDKs retry 429/5xx and NEVER retry 4xx,
// so a transient server-side failure (a credit deduction that lost a DB write, a
// queue submit that failed, no free capacity) must not come back as
// invalid_request_error — the caller would report "your request was malformed"
// and give up on something a retry would have served. Shared by both lanes so
// streaming and non-streaming can't drift apart on the same event.
function ackToHttp(error: string, code?: string): { status: number; type: string; message: string } {
  const e = (error || '').toLowerCase();
  if (e.includes('insufficient credits') || e.includes('allowance')) return { status: 402, type: 'insufficient_quota', message: error };
  if (e.includes('rate limit')) return { status: 429, type: 'rate_limit_exceeded', message: error };
  // 'Failed to deduct credits. Try again.' / 'Failed to submit job' / no worker
  // free for the requested tier — all retryable, and 503 is what the public API
  // reference documents for the capacity case.
  if (code === 'FREE_NO_CAPACITY' || e.startsWith('failed to')) return { status: 503, type: 'api_error', message: error };
  return { status: 400, type: 'invalid_request_error', message: error };
}

export async function POST(req: NextRequest) {
  // ── Auth: Bearer sk-c0mpute-… ──
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return oaiError('Missing bearer API key.', 'invalid_request_error', 401, 'invalid_api_key');
  }
  const rawKey = authHeader.slice(7).trim();
  const resolved = resolveApiKeyFull(rawKey);
  if (!resolved) {
    return oaiError('Invalid API key.', 'invalid_request_error', 401, 'invalid_api_key');
  }
  const { privyId, keyId, freeOnly } = resolved;
  if (rateLimited(keyId)) {
    return oaiError(`Rate limit exceeded (${RATE_LIMIT_PER_MIN} requests/min per key).`, 'rate_limit_exceeded', 429, 'rate_limit_exceeded');
  }
  // Persistent daily cap for resale keys.
  if (freeOnly && FREE_ONLY_DAILY_CAP > 0 && getApiKeyRequestsToday(keyId) >= FREE_ONLY_DAILY_CAP) {
    return oaiError(`Daily request cap reached for this key (${FREE_ONLY_DAILY_CAP}/day).`, 'rate_limit_exceeded', 429, 'rate_limit_exceeded');
  }

  // ── Body ──
  let body: any;
  try {
    body = await req.json();
  } catch {
    return oaiError('Invalid JSON body.', 'invalid_request_error', 400);
  }
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return oaiError('`messages` must be a non-empty array.', 'invalid_request_error', 400);
  }
  // Both fields below are dereferenced without a guard further down (`.trim()` on
  // model, `.content`/`.tool_calls` on every message) and that code runs OUTSIDE
  // any try/catch — so `{"model": 5}` or `{"messages":[null]}` currently escapes
  // as a 500. Malformed input is the caller's error: it must read as a 400.
  if (body.model !== undefined && typeof body.model !== 'string') {
    return oaiError('`model` must be a string.', 'invalid_request_error', 400);
  }
  if (body.messages.some((m: unknown) => m === null || typeof m !== 'object')) {
    return oaiError('`messages` entries must be objects.', 'invalid_request_error', 400);
  }

  const mapped = mapModel(body.model);
  if (!mapped) {
    return oaiError(`Unknown model '${body.model}'. Available: qwen3.8-27b-uncensored, qwen3.8-27b-uncensored-think, c0mpute-pro, c0mpute-swarm.`, 'invalid_request_error', 404, 'model_not_found');
  }
  const requestedModel = body.model || 'c0mpute-pro';

  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return oaiError('API temporarily unavailable.', 'api_error', 503);
  }

  // Tools (OpenAI function calling). tool_choice 'none' disables tools for this call.
  const wantsTools = body.tool_choice !== 'none' && Array.isArray(body.tools) && body.tools.length > 0;
  const tools = wantsTools ? body.tools : undefined;
  // Belt and braces for the check above: mapMessagesIn walks nested caller data
  // (tool_calls entries, content parts) that can be junk at any depth.
  let workerMessages: ReturnType<typeof mapMessagesIn>;
  try {
    workerMessages = mapMessagesIn(body.messages);
  } catch {
    return oaiError('`messages` contains a malformed entry.', 'invalid_request_error', 400);
  }

  // Only now bill the persistent daily counter: it's the resale key's real budget,
  // so a client looping malformed requests must not be able to burn a day's cap
  // without ever reaching inference.
  bumpApiKeyRequest(keyId);

  // ── Streaming path (SSE) ──
  if (body.stream === true) {
    const id = 'chatcmpl-' + Math.random().toString(36).slice(2);
    const created = Math.floor(Date.now() / 1000);
    const enc = new TextEncoder();
    const socket: Socket = io(ORCH_URL, { auth: { token: internalSecret }, transports: ['websocket'], reconnection: false, timeout: 10_000 });

    let jobId: string | null = null;
    let controller: ReadableStreamDefaultController | null = null;
    const pending: string[] = [];
    let settled = false;
    let roleSent = false;
    // Fallbacks for the usage chunk when a job ends without reporting what it
    // was billed on. Same two estimates the non-streaming lane has always used.
    const promptTokensForStream = estimateTokens(
      workerMessages.map((m: any) => (typeof m?.content === 'string' ? m.content : '')).join('\n')
    );
    let streamedTokens = 0;
    let jobTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    // Everything holding this request open: the socket (reconnection is off, so
    // nothing revives it) plus the timers. All must die on every exit path —
    // an interval left running would fire forever into a dead controller.
    const release = () => {
      if (jobTimer) { clearTimeout(jobTimer); jobTimer = null; }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      try { socket.disconnect(); } catch {}
    };
    const raw = (s: string) => {
      if (!controller) { pending.push(s); return; }
      try { controller.enqueue(enc.encode(s)); } catch { /* client hung up mid-write */ }
    };
    const sendChunk = (delta: any, finish: string | null = null) =>
      raw(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: requestedModel, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    // The stream never reported usage at all, so a streaming caller had no way to
    // see what they were charged for. Sent as OpenAI does it — one final chunk
    // with no choices, only on stream_options.include_usage — because an
    // unrequested extra frame is a compatibility risk for strict clients.
    const wantsUsage = (body as any)?.stream_options?.include_usage === true;
    const sendUsage = (billed?: BilledUsage) => {
      if (!wantsUsage) return;
      const usage = usageBlock(billed, promptTokensForStream, streamedTokens);
      raw(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: requestedModel, choices: [], usage })}\n\n`);
    };
    // `err` ⇒ the job failed after the 200 headers were already on the wire, so
    // there is no status code left to fail with. The only thing an OpenAI SDK
    // reads as a failure is a data frame whose payload carries an `error` object
    // (both the node and python clients raise APIError on it) — emitting a normal
    // finish_reason:'stop' instead would hand a safety block, a timeout or a dead
    // worker to the caller as a successful empty completion. It must NOT be
    // followed by [DONE]: the SDKs stop reading there and would swallow it.
    const finish = (err?: { message: string; type: string; code?: string }) => {
      if (settled) return;
      settled = true;
      if (err) raw(`data: ${JSON.stringify({ error: { message: err.message, type: err.type, param: null, code: err.code ?? null } })}\n\n`);
      else raw('data: [DONE]\n\n');
      if (controller) { try { controller.close(); } catch {} }
      release();
    };

    // Re-arm the idle deadline: this response is alive for as long as tokens
    // keep arriving. Clears any previous timer, so it is also how the deadline
    // is armed the first time.
    const armIdle = () => {
      if (settled) return;
      if (jobTimer) clearTimeout(jobTimer);
      jobTimer = setTimeout(() => finish({ message: 'Inference timed out.', type: 'timeout' }), JOB_IDLE_TIMEOUT_MS);
    };

    socket.on('job:token', (d: { jobId: string; token: string }) => {
      if (jobId && d.jobId !== jobId) return;
      armIdle();
      streamedTokens++;
      if (!roleSent) { roleSent = true; sendChunk({ role: 'assistant', content: '' }); }
      sendChunk({ content: d.token });
    });
    socket.on('job:complete', (d: { jobId: string; response: string; usage?: BilledUsage; truncated?: boolean }) => {
      if (jobId && d.jobId !== jobId) return;
      if (!roleSent) { roleSent = true; sendChunk({ role: 'assistant', content: d.response ?? '' }); }
      // An answer that stopped at the output cap finishes 'length', which is
      // what an OpenAI client reads to know the reply was truncated. Reporting
      // 'stop' told every caller a cut-off answer was complete.
      sendChunk({}, d.truncated ? 'length' : 'stop');
      sendUsage(d.usage);
      finish();
    });
    socket.on('job:tool_calls', (d: { jobId: string; toolCalls: any[]; usage?: BilledUsage }) => {
      if (jobId && d.jobId !== jobId) return;
      const tc = mapToolCallsOut(d.toolCalls).map((t, i) => ({ index: i, ...t }));
      sendChunk({ role: 'assistant', content: null, tool_calls: tc }, 'tool_calls');
      sendUsage(d.usage);
      finish();
    });
    socket.on('job:error', (d: { jobId: string; error: string; code?: string }) => {
      if (jobId && d.jobId !== jobId) return;
      // Same shape as the non-streaming lane's 422: a burnout is the caller's
      // request coming back unanswerable, and it is named so they can branch on
      // it. There is no status code left to send here, so the code rides the
      // error frame the SDKs already raise on.
      if (d.code === 'THINK_BURNOUT') {
        finish({ message: THINK_BURNOUT_MESSAGE, type: 'invalid_request_error', code: 'think_burnout' });
        return;
      }
      finish({ message: d.error || 'Inference failed.', type: 'api_error' });
    });

    // Pre-flight: connect + submit and wait for the ack so credit/rate errors
    // come back as proper HTTP status codes, not mid-stream.
    const pre = await new Promise<{ ok?: true; httpErr?: { status: number; type: string; code?: string; message: string }; ack?: { error: string; code?: string } }>((resolve) => {
      const t = setTimeout(() => resolve({ httpErr: { status: 504, type: 'timeout', message: 'Inference timed out.' } }), 15_000);
      socket.on('connect_error', () => { clearTimeout(t); resolve({ httpErr: { status: 503, type: 'api_error', message: 'Could not reach inference network.' } }); });
      socket.on('connect', () => {
        // `stream: true` — this lane relays every token to the caller as it
        // arrives, which is what makes a burnout here a delivered answer.
        socket.emit('job:submit', { messages: workerMessages, model: mapped.model, think: mapped.think, privyUserId: privyId, tools, freeOnly, stream: true }, (ack: { jobId?: string; error?: string; code?: string }) => {
          clearTimeout(t);
          if (ack?.error) { resolve({ ack: { error: ack.error, code: ack.code } }); return; }
          jobId = ack?.jobId ?? null;
          resolve({ ok: true });
        });
      });
    });

    if (!pre.ok) {
      release();
      if (pre.ack) {
        const mappedErr = ackToHttp(pre.ack.error, pre.ack.code);
        return oaiError(mappedErr.message, mappedErr.type, mappedErr.status);
      }
      return oaiError(pre.httpErr!.message, pre.httpErr!.type, pre.httpErr!.status);
    }

    // The pre-flight only covers submit. After the ack, the ONLY things that can
    // end this response are job:complete / job:tool_calls / job:error — so a dead
    // orchestrator or a dropped transport (reconnection:false, nothing reconnects)
    // would hold the SSE response and its Node socket open forever. Bound it with
    // the same windows the non-streaming lane uses, and treat a transport drop as
    // a failed job. Our own disconnect() inside finish() re-enters here, but
    // `settled` is already true by then, so it's a no-op.
    if (!settled) {
      armIdle();
      hardTimer = setTimeout(() => finish({ message: 'Inference timed out.', type: 'timeout' }), JOB_MAX_TIMEOUT_MS);
      socket.on('disconnect', () => finish({ message: 'Lost connection to the inference network.', type: 'api_error' }));
      // A queued job can sit up to ~3 min before its first token. An SSE comment is
      // ignored by every SSE parser but keeps proxies from culling an idle response.
      heartbeat = setInterval(() => raw(': ping\n\n'), 15_000);
    }

    const stream = new ReadableStream({
      start(c) {
        controller = c;
        for (const s of pending) c.enqueue(enc.encode(s));
        pending.length = 0;
        if (settled) { try { c.close(); } catch {} }
      },
      // Client hung up: nothing left to write, so stop the timers too.
      cancel() { settled = true; release(); },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
    });
  }

  // ── Bridge: internal Socket.io client → orchestrator ──
  let socket: Socket | null = null;
  try {
    const result = await new Promise<{ response?: string; toolCalls?: any[]; completionTokens: number; usage?: BilledUsage; truncated?: boolean }>((resolve, reject) => {
      socket = io(ORCH_URL, {
        auth: { token: internalSecret },
        transports: ['websocket'],
        reconnection: false,
        timeout: 10_000,
      });

      let settled = false;
      let completionTokens = 0;
      let jobId: string | null = null;

      // Same liveness rule as the streaming lane: the idle deadline is re-armed
      // on every token, the hard one is the absolute backstop.
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const hardTimer = setTimeout(() => timedOut(), JOB_MAX_TIMEOUT_MS);
      const clearTimers = () => {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        clearTimeout(hardTimer);
      };
      function timedOut() {
        if (settled) return;
        settled = true;
        clearTimers();
        reject({ status: 504, type: 'timeout', message: 'Inference timed out.' });
      }
      const armIdle = () => {
        if (settled) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(timedOut, JOB_IDLE_TIMEOUT_MS);
      };
      armIdle();

      const fail = (status: number, type: string, message: string, code?: string) => {
        if (settled) return;
        settled = true;
        clearTimers();
        reject({ status, type, message, code });
      };

      socket.on('connect_error', () => fail(503, 'api_error', 'Could not reach inference network.'));

      socket.on('connect', () => {
        socket!.emit(
          'job:submit',
          // `stream: false` — tokens are counted here and thrown away; the
          // caller sees only the final JSON, or the error instead of it.
          { messages: workerMessages, model: mapped.model, think: mapped.think, privyUserId: privyId, tools, freeOnly, stream: false },
          (ack: { jobId?: string; error?: string; code?: string }) => {
            if (ack?.error) {
              const mappedErr = ackToHttp(ack.error, ack.code);
              fail(mappedErr.status, mappedErr.type, mappedErr.message);
              return;
            }
            jobId = ack?.jobId ?? null;
          }
        );
      });

      // Orchestrator streams tokens + completion to the submitting (this) socket.
      socket.on('job:token', (d: { jobId: string; token: string }) => {
        if (jobId && d.jobId !== jobId) return;
        armIdle();
        completionTokens++;
      });
      socket.on('job:complete', (d: { jobId: string; response: string; usage?: BilledUsage; truncated?: boolean }) => {
        if (jobId && d.jobId !== jobId) return;
        if (settled) return;
        settled = true;
        clearTimers();
        resolve({ response: d.response ?? '', completionTokens, usage: d.usage, truncated: d.truncated });
      });
      // Tools passthrough: the model wants the agent to run a tool.
      socket.on('job:tool_calls', (d: { jobId: string; toolCalls: any[]; usage?: BilledUsage }) => {
        if (jobId && d.jobId !== jobId) return;
        if (settled) return;
        settled = true;
        clearTimers();
        resolve({ toolCalls: d.toolCalls || [], completionTokens, usage: d.usage });
      });
      socket.on('job:error', (d: { jobId: string; error: string; code?: string }) => {
        if (jobId && d.jobId !== jobId) return;
        // A think-burnout is the caller's request coming back unanswerable as
        // asked, not a network fault. 5xx makes it worse than it is: the OpenAI
        // SDKs retry a >=500 twice on their own, and each retry is another job
        // that reasons the budget away and eats one of the account's refunds.
        // 4xx is read as final, so the caller decides what to do next.
        if (d.code === 'THINK_BURNOUT') {
          fail(422, 'invalid_request_error', THINK_BURNOUT_MESSAGE, 'think_burnout');
          return;
        }
        fail(503, 'api_error', d.error || 'Inference failed.');
      });
    });

    // ── OpenAI-shaped success ──
    const promptTokens = estimateTokens(
      workerMessages.map((m: any) => (typeof m?.content === 'string' ? m.content : '')).join('\n')
    );
    const isToolCalls = Array.isArray(result.toolCalls) && result.toolCalls.length > 0;
    const message = isToolCalls
      ? { role: 'assistant', content: null, tool_calls: mapToolCallsOut(result.toolCalls!) }
      : { role: 'assistant', content: result.response ?? '' };
    const completionTokens = result.completionTokens || (isToolCalls ? 1 : estimateTokens(result.response ?? ''));
    return NextResponse.json({
      id: 'chatcmpl-' + Math.random().toString(36).slice(2),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [
        {
          index: 0,
          message,
          finish_reason: isToolCalls ? 'tool_calls' : result.truncated ? 'length' : 'stop',
        },
      ],
      usage: usageBlock(result.usage, promptTokens, completionTokens),
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const type = err?.type ?? 'api_error';
    const message = err?.message ?? 'Internal error.';
    return oaiError(message, type, status, err?.code);
  } finally {
    if (socket) {
      try { (socket as Socket).disconnect(); } catch {}
    }
  }
}
