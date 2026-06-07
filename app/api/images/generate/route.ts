import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { verifyPrivyToken } from '@/lib/privy-server';
import { resolveApiKey, spendCredits, refundCredits, recordImage } from '@/lib/db';
import { generateImage, IMAGE_CREDITS, IMAGE_MODEL_ID } from '@/lib/image-gen';
import { checkImagePromptSafety, classifyImageNsfw } from '@/lib/image-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

// Auth: accept either a Privy access token (the /create page) OR a c0mpute API
// key (sk-c0mpute-…, for agents). Returns the owner's privy_id or null.
async function resolveUser(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (token.startsWith('sk-c0mpute-')) return resolveApiKey(token);
  return verifyPrivyToken(token);
}

export async function POST(req: NextRequest) {
  const privyId = await resolveUser(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized. Log in or use an API key.' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: '`prompt` is required.' }, { status: 400 });
  }

  // Hard safety line (CSAM) — the only content rule.
  const safety = checkImagePromptSafety(prompt);
  if (!safety.allowed) {
    return NextResponse.json({ error: safety.reason }, { status: 400 });
  }

  // Charge up front; refund on any failure below.
  const charged = spendCredits(privyId, IMAGE_CREDITS, 'Image generation');
  if (!charged) {
    return NextResponse.json(
      { error: `Insufficient credits. Image generation costs ${IMAGE_CREDITS} credits.` },
      { status: 402 }
    );
  }

  try {
    const result = await generateImage({
      prompt,
      negativePrompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
      width: body.width,
      height: body.height,
      steps: body.steps,
      seed: body.seed,
    });

    // Output-side safety hook (stubbed until a real classifier ships).
    const verdict = await classifyImageNsfw(result.png);
    if (verdict.blocked) {
      refundCredits(privyId, IMAGE_CREDITS, 'Image generation blocked');
      return NextResponse.json({ error: 'Generated image was blocked by the safety filter.' }, { status: 400 });
    }

    const id = randomUUID();
    await mkdir(IMAGES_DIR, { recursive: true });
    await writeFile(path.join(IMAGES_DIR, `${id}.png`), result.png);

    recordImage({
      id,
      privyId,
      prompt,
      negativePrompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
      model: IMAGE_MODEL_ID,
      seed: result.seed,
      width: result.width,
      height: result.height,
      creditsCharged: IMAGE_CREDITS,
      nsfw: verdict.nsfw,
      isPublic: body.public === false ? false : true,
    });

    return NextResponse.json({
      id,
      url: `/api/images/${id}.png`,
      model: IMAGE_MODEL_ID,
      seed: result.seed,
      width: result.width,
      height: result.height,
      credits_charged: IMAGE_CREDITS,
    });
  } catch (err: any) {
    // Backend/timeout failure → make the user whole.
    refundCredits(privyId, IMAGE_CREDITS, 'Image generation failed');
    const msg = err?.message || 'Image generation failed.';
    const status = /timed out/i.test(msg) ? 504 : 503;
    return NextResponse.json({ error: msg }, { status });
  }
}
