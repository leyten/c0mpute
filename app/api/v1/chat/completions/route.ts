import { NextRequest, NextResponse } from 'next/server';
import { io, Socket } from 'socket.io-client';
import { resolveApiKeyFull, getApiKeyRequestsToday, bumpApiKeyRequest } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Phase 1 of API_PLAN.md: OpenAI-compatible, non-streaming.
// The orchestrator is a separate Socket.io service, so this route acts as a
// trusted internal Socket.io client (authed with INTERNAL_API_SECRET) and
// reuses ALL existing routing/billing/worker logic. The end user is resolved
// from their API key here and passed through as privyUserId so billing stays
// tied to the real user.

const ORCH_URL = process.env.INTERNAL_ORCHESTRATOR_URL || 'http://127.0.0.1:3004';
const JOB_TIMEOUT_MS = 280_000;

// Public model name -> { orchestrator model id, think }. getModelTier in the
// orchestrator maps 'native-max' -> max tier, everything else -> pro.
function mapModel(model: string | undefined): { model: string; think: boolean } | null {
  switch ((model || '').trim()) {
    case 'c0mpute-max':
      return { model: 'native-max', think: false };
    case 'c0mpute-max-think':
      return { model: 'native-max', think: true };
    case 'supergemma4-26b':
    case 'c0mpute-max-supergemma':
      return { model: 'native-supergemma', think: false };
    case 'code':
    case 'devstral-24b':
    case 'c0mpute-code':
      return { model: 'native-code', think: false };
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

function oaiError(message: string, type: string, status: number, code?: string) {
  return NextResponse.json({ error: { message, type, param: null, code: code ?? null } }, { status });
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
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
    return oaiError(`Unknown model '${body.model}'. Available: c0mpute-pro, c0mpute-max, c0mpute-max-think, supergemma4-26b, code.`, 'invalid_request_error', 404, 'model_not_found');
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
    let jobTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    // Everything holding this request open: the socket (reconnection is off, so
    // nothing revives it) plus the two timers. Both must die on every exit path —
    // an interval left running would fire forever into a dead controller.
    const release = () => {
      if (jobTimer) { clearTimeout(jobTimer); jobTimer = null; }
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      try { socket.disconnect(); } catch {}
    };
    const raw = (s: string) => {
      if (!controller) { pending.push(s); return; }
      try { controller.enqueue(enc.encode(s)); } catch { /* client hung up mid-write */ }
    };
    const sendChunk = (delta: any, finish: string | null = null) =>
      raw(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: requestedModel, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    // `err` ⇒ the job failed after the 200 headers were already on the wire, so
    // there is no status code left to fail with. The only thing an OpenAI SDK
    // reads as a failure is a data frame whose payload carries an `error` object
    // (both the node and python clients raise APIError on it) — emitting a normal
    // finish_reason:'stop' instead would hand a safety block, a timeout or a dead
    // worker to the caller as a successful empty completion. It must NOT be
    // followed by [DONE]: the SDKs stop reading there and would swallow it.
    const finish = (err?: { message: string; type: string }) => {
      if (settled) return;
      settled = true;
      if (err) raw(`data: ${JSON.stringify({ error: { message: err.message, type: err.type, param: null, code: null } })}\n\n`);
      else raw('data: [DONE]\n\n');
      if (controller) { try { controller.close(); } catch {} }
      release();
    };

    socket.on('job:token', (d: { jobId: string; token: string }) => {
      if (jobId && d.jobId !== jobId) return;
      if (!roleSent) { roleSent = true; sendChunk({ role: 'assistant', content: '' }); }
      sendChunk({ content: d.token });
    });
    socket.on('job:complete', (d: { jobId: string; response: string }) => {
      if (jobId && d.jobId !== jobId) return;
      if (!roleSent) { roleSent = true; sendChunk({ role: 'assistant', content: d.response ?? '' }); }
      sendChunk({}, 'stop');
      finish();
    });
    socket.on('job:tool_calls', (d: { jobId: string; toolCalls: any[] }) => {
      if (jobId && d.jobId !== jobId) return;
      const tc = mapToolCallsOut(d.toolCalls).map((t, i) => ({ index: i, ...t }));
      sendChunk({ role: 'assistant', content: null, tool_calls: tc }, 'tool_calls');
      finish();
    });
    socket.on('job:error', (d: { jobId: string; error: string }) => {
      if (jobId && d.jobId !== jobId) return;
      finish({ message: d.error || 'Inference failed.', type: 'api_error' });
    });

    // Pre-flight: connect + submit and wait for the ack so credit/rate errors
    // come back as proper HTTP status codes, not mid-stream.
    const pre = await new Promise<{ ok?: true; httpErr?: { status: number; type: string; code?: string; message: string }; ack?: { error: string; code?: string } }>((resolve) => {
      const t = setTimeout(() => resolve({ httpErr: { status: 504, type: 'timeout', message: 'Inference timed out.' } }), 15_000);
      socket.on('connect_error', () => { clearTimeout(t); resolve({ httpErr: { status: 503, type: 'api_error', message: 'Could not reach inference network.' } }); });
      socket.on('connect', () => {
        socket.emit('job:submit', { messages: workerMessages, model: mapped.model, think: mapped.think, privyUserId: privyId, tools, freeOnly }, (ack: { jobId?: string; error?: string; code?: string }) => {
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
    // the same ceiling the non-streaming lane uses, and treat a transport drop as
    // a failed job. Our own disconnect() inside finish() re-enters here, but
    // `settled` is already true by then, so it's a no-op.
    if (!settled) {
      jobTimer = setTimeout(() => finish({ message: 'Inference timed out.', type: 'timeout' }), JOB_TIMEOUT_MS);
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
    const result = await new Promise<{ response?: string; toolCalls?: any[]; completionTokens: number }>((resolve, reject) => {
      socket = io(ORCH_URL, {
        auth: { token: internalSecret },
        transports: ['websocket'],
        reconnection: false,
        timeout: 10_000,
      });

      let settled = false;
      let completionTokens = 0;
      let jobId: string | null = null;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject({ status: 504, type: 'timeout', message: 'Inference timed out.' });
      }, JOB_TIMEOUT_MS);

      const fail = (status: number, type: string, message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject({ status, type, message });
      };

      socket.on('connect_error', () => fail(503, 'api_error', 'Could not reach inference network.'));

      socket.on('connect', () => {
        socket!.emit(
          'job:submit',
          { messages: workerMessages, model: mapped.model, think: mapped.think, privyUserId: privyId, tools, freeOnly },
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
        completionTokens++;
      });
      socket.on('job:complete', (d: { jobId: string; response: string }) => {
        if (jobId && d.jobId !== jobId) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ response: d.response ?? '', completionTokens });
      });
      // Tools passthrough: the model wants the agent to run a tool.
      socket.on('job:tool_calls', (d: { jobId: string; toolCalls: any[] }) => {
        if (jobId && d.jobId !== jobId) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ toolCalls: d.toolCalls || [], completionTokens });
      });
      socket.on('job:error', (d: { jobId: string; error: string }) => {
        if (jobId && d.jobId !== jobId) return;
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
          finish_reason: isToolCalls ? 'tool_calls' : 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const type = err?.type ?? 'api_error';
    const message = err?.message ?? 'Internal error.';
    return oaiError(message, type, status);
  } finally {
    if (socket) {
      try { (socket as Socket).disconnect(); } catch {}
    }
  }
}
