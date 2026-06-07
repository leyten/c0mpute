import { NextRequest, NextResponse } from 'next/server';
import { io, Socket } from 'socket.io-client';
import { resolveApiKey } from '@/lib/db';

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
const rateBuckets = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const win = (rateBuckets.get(key) || []).filter((t) => now - t < 60_000);
  if (win.length >= RATE_LIMIT_PER_MIN) { rateBuckets.set(key, win); return true; }
  win.push(now);
  rateBuckets.set(key, win);
  return false;
}

export async function POST(req: NextRequest) {
  // ── Auth: Bearer sk-c0mpute-… ──
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return oaiError('Missing bearer API key.', 'invalid_request_error', 401, 'invalid_api_key');
  }
  const rawKey = authHeader.slice(7).trim();
  const privyId = resolveApiKey(rawKey);
  if (!privyId) {
    return oaiError('Invalid API key.', 'invalid_request_error', 401, 'invalid_api_key');
  }
  if (rateLimited(rawKey)) {
    return oaiError(`Rate limit exceeded (${RATE_LIMIT_PER_MIN} requests/min per key).`, 'rate_limit_exceeded', 429, 'rate_limit_exceeded');
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

  const mapped = mapModel(body.model);
  if (!mapped) {
    return oaiError(`Unknown model '${body.model}'. Available: c0mpute-pro, c0mpute-max, c0mpute-max-think.`, 'invalid_request_error', 404, 'model_not_found');
  }
  const requestedModel = body.model || 'c0mpute-pro';

  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return oaiError('API temporarily unavailable.', 'api_error', 503);
  }

  // Tools (OpenAI function calling). tool_choice 'none' disables tools for this call.
  const wantsTools = body.tool_choice !== 'none' && Array.isArray(body.tools) && body.tools.length > 0;
  const tools = wantsTools ? body.tools : undefined;
  const workerMessages = mapMessagesIn(body.messages);

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

    const raw = (s: string) => { if (controller) controller.enqueue(enc.encode(s)); else pending.push(s); };
    const sendChunk = (delta: any, finish: string | null = null) =>
      raw(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: requestedModel, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    const finish = () => {
      if (settled) return;
      settled = true;
      raw('data: [DONE]\n\n');
      if (controller) { try { controller.close(); } catch {} }
      try { socket.disconnect(); } catch {}
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
      sendChunk({}, 'stop');
      finish();
    });

    // Pre-flight: connect + submit and wait for the ack so credit/rate errors
    // come back as proper HTTP status codes, not mid-stream.
    const pre = await new Promise<{ ok?: true; httpErr?: { status: number; type: string; code?: string; message: string }; ackErr?: string }>((resolve) => {
      const t = setTimeout(() => resolve({ httpErr: { status: 504, type: 'timeout', message: 'Inference timed out.' } }), 15_000);
      socket.on('connect_error', () => { clearTimeout(t); resolve({ httpErr: { status: 503, type: 'api_error', message: 'Could not reach inference network.' } }); });
      socket.on('connect', () => {
        socket.emit('job:submit', { messages: workerMessages, model: mapped.model, think: mapped.think, privyUserId: privyId, tools }, (ack: { jobId?: string; error?: string }) => {
          clearTimeout(t);
          if (ack?.error) { resolve({ ackErr: ack.error }); return; }
          jobId = ack?.jobId ?? null;
          resolve({ ok: true });
        });
      });
    });

    if (!pre.ok) {
      try { socket.disconnect(); } catch {}
      if (pre.ackErr) {
        const e = pre.ackErr.toLowerCase();
        if (e.includes('insufficient credits')) return oaiError(pre.ackErr, 'insufficient_quota', 402);
        if (e.includes('rate limit')) return oaiError(pre.ackErr, 'rate_limit_exceeded', 429);
        return oaiError(pre.ackErr, 'invalid_request_error', 400);
      }
      return oaiError(pre.httpErr!.message, pre.httpErr!.type, pre.httpErr!.status);
    }

    const stream = new ReadableStream({
      start(c) {
        controller = c;
        for (const s of pending) c.enqueue(enc.encode(s));
        pending.length = 0;
        if (settled) { try { c.close(); } catch {} }
      },
      cancel() { try { socket.disconnect(); } catch {} },
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
          { messages: workerMessages, model: mapped.model, think: mapped.think, privyUserId: privyId, tools },
          (ack: { jobId?: string; error?: string }) => {
            if (ack?.error) {
              const e = ack.error.toLowerCase();
              if (e.includes('insufficient credits')) fail(402, 'insufficient_quota', ack.error);
              else if (e.includes('rate limit')) fail(429, 'rate_limit_exceeded', ack.error);
              else fail(400, 'invalid_request_error', ack.error);
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
