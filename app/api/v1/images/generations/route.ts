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

  const internal = await fetch(`http://127.0.0.1:${PORT}/api/images/generate`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
      width, height,
      seed: typeof body.seed === 'number' ? body.seed : undefined,
      nsfw: body.nsfw === true,
    }),
  });

  const data = await internal.json().catch(() => ({}));
  if (!internal.ok) {
    const message = data?.error || 'Image generation failed.';
    const status = internal.status;
    const type = status === 401 ? 'invalid_request_error'
      : status === 402 ? 'insufficient_quota'
      : status === 400 ? 'invalid_request_error'
      : 'server_error';
    const code = status === 402 ? 'insufficient_credits' : data?.code?.toLowerCase?.() ?? null;
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
