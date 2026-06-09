import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { resolveApiKey, spendCredits, refundCredits } from '@/lib/db';
import { consumeStakerAllowance, refundStakerAllowance } from '@/lib/staker-allowance';
import { STAKER_ALLOWANCE_ENABLED } from '@/lib/tokenomics';
import { generateImage, IMAGE_CREDITS, IMAGE_MODEL_ID } from '@/lib/image-gen';
import { checkImagePromptSafety, classifyImageNsfw } from '@/lib/image-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PRIVACY PILLAR: generated images are NEVER persisted — not to disk, not to the
// DB. The PNG is returned inline to the caller and then dropped. The only record
// kept is the credit transaction (no prompt, no image), which billing requires.

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

  // NSFW opt-in (18+ gated client-side). SFW by default; the minor/CSAM line is
  // enforced regardless of this flag.
  const wantNsfw = body?.nsfw === true;
  const safety = checkImagePromptSafety(prompt, { nsfwAllowed: wantNsfw });
  if (!safety.allowed) {
    return NextResponse.json({ error: safety.reason }, { status: 400 });
  }

  // Charge up front, drawing the staker daily allowance first (same credit pool as
  // normal usage) then paid credits. Refunded to whichever was used on any failure.
  let usedAllowance = false;
  if (STAKER_ALLOWANCE_ENABLED && consumeStakerAllowance(privyId, IMAGE_CREDITS)) {
    usedAllowance = true;
  } else if (!spendCredits(privyId, IMAGE_CREDITS, 'Image generation')) {
    return NextResponse.json(
      { error: `Insufficient credits. Image generation costs ${IMAGE_CREDITS} credits.` },
      { status: 402 }
    );
  }
  const refund = (reason: string) =>
    usedAllowance ? refundStakerAllowance(privyId, IMAGE_CREDITS) : refundCredits(privyId, IMAGE_CREDITS, reason);

  try {
    const result = await generateImage({
      prompt,
      negativePrompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
      width: body.width,
      height: body.height,
      steps: body.steps,
      cfg: body.cfg,
      seed: body.seed,
    });

    // Output classifier is ON only in SFW mode (NSFW toggle off): a SFW user
    // must not be served adult content. In NSFW mode the classifier is OFF —
    // nothing is scanned, keeping adult generation fully uncensored + private.
    // Either way the image is never stored; the scan is transient/in-memory.
    if (!wantNsfw) {
      const verdict = await classifyImageNsfw(result.png);
      if (verdict.classifierUp && verdict.nsfw) {
        refund('SFW request produced adult content');
        return NextResponse.json(
          { error: 'That came out as adult content. Turn on NSFW (18+) to allow it, or adjust your prompt.' },
          { status: 400 }
        );
      }
    }

    // Return the image inline as a data URL — nothing is stored server-side.
    const dataUrl = `data:image/png;base64,${result.png.toString('base64')}`;

    return NextResponse.json({
      image: dataUrl,
      model: IMAGE_MODEL_ID,
      seed: result.seed,
      width: result.width,
      height: result.height,
      credits_charged: IMAGE_CREDITS,
    });
  } catch (err: any) {
    // Backend/timeout failure → make the user whole.
    refund('Image generation failed');
    const msg = err?.message || 'Image generation failed.';
    const status = /timed out/i.test(msg) ? 504 : 503;
    return NextResponse.json({ error: msg }, { status });
  }
}
