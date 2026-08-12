import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/v1/images/generations — OpenAI-compatible image generation.
// Thin wrapper over the internal /api/images/generate route (which already
// accepts sk-c0mpute API keys, bills credits, runs the safety pipeline and
// returns the PNG inline without storing anything). This route only maps the
// OpenAI request/response shapes.

const PORT = process.env.PORT || '3003';

function oaiError(message: string, type: string, status: number, code?: string) {
  return NextResponse.json({ error: { message, type, param: null, code: code ?? null } }, { status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer sk-c0mpute-')) {
    return oaiError('Invalid API key.', 'invalid_request_error', 401, 'invalid_api_key');
  }

  let body: any;
  try { body = await req.json(); } catch {
    return oaiError('Invalid JSON body.', 'invalid_request_error', 400);
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return oaiError('`prompt` is required.', 'invalid_request_error', 400);
  if (body.n !== undefined && body.n !== 1) {
    return oaiError('Only n=1 is supported — each image is billed per render.', 'invalid_request_error', 400);
  }
  if (body.response_format !== undefined && body.response_format !== 'b64_json') {
    return oaiError('Only response_format "b64_json" is supported (images are never stored, so there are no URLs).', 'invalid_request_error', 400);
  }

  // OpenAI-style "1024x1024" size → width/height for the internal route
  let width: number | undefined;
  let height: number | undefined;
  if (typeof body.size === 'string' && /^\d{3,4}x\d{3,4}$/.test(body.size)) {
    const [w, h] = body.size.split('x').map(Number);
    width = w; height = h;
  }

  // The internal route charges BEFORE it dispatches the render and refunds itself
  // on failure, so this hop must not walk away from a request that is still going
  // to be billed: the timeout is a BACKSTOP above the internal ceiling (200s job +
  // 15s classifier), not a normal-path cutoff, and it stays under maxDuration so a
  // wedged hop still answers in the OpenAI error shape. An unguarded fetch (reset
  // socket, orchestrator restart) would otherwise escape as Next's generic 500.
  let internal: Response;
  try {
    internal = await fetch(`http://127.0.0.1:${PORT}/api/images/generate`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
        width, height,
        seed: typeof body.seed === 'number' ? body.seed : undefined,
        nsfw: body.nsfw === true,
      }),
      signal: AbortSignal.timeout(285_000),
    });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    console.error('[v1/images] internal hop failed', e?.name || '', e?.message || err);
    return timedOut
      ? oaiError('Image generation timed out.', 'timeout', 504)
      : oaiError('Image generation is unavailable right now.', 'server_error', 503);
  }

  const data = await internal.json().catch(() => ({}));
  if (!internal.ok) {
    const message = data?.error || 'Image generation failed.';
    const status = internal.status;
    const type = status === 401 ? 'invalid_request_error'
      : status === 402 ? 'insufficient_quota'
      : status === 400 ? 'invalid_request_error'
      : 'server_error';
    // Prefer the internal route's own code so a 402 keeps saying WHICH quota ran
    // out (an exhausted resale-key allowance is not an empty balance).
    const code = data?.code?.toLowerCase?.() ?? (status === 402 ? 'insufficient_credits' : null);
    return oaiError(message, type, status, code);
  }

  // data.image is "data:image/png;base64,<b64>" — strip the prefix for b64_json
  const b64 = typeof data.image === 'string' ? data.image.replace(/^data:image\/png;base64,/, '') : '';
  return NextResponse.json({
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: b64 }],
    model: data.model,
    seed: data.seed,
    size: data.width && data.height ? `${data.width}x${data.height}` : undefined,
    credits_charged: data.credits_charged,
  });
}
