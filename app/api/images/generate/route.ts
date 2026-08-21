import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { resolveApiKeyFull, spendCredits, refundCredits, consumeFreeImage, refundFreeImage, getTodayFreeSubsidyUsd, getThisHourFreeSubsidyUsd, reverseWorkerEarning } from '@/lib/db';
import { drawStakerAllowance, refundStakerAllowance } from '@/lib/staker-allowance';
import { drawDailyGrant, refundDailyGrant } from '@/lib/plan-state';
import { STAKER_ALLOWANCE_ENABLED, FREE_IMAGE_LIMIT, FREE_SUBSIDY_DAILY_CAP_USD, FREE_SUBSIDY_HOURLY_CAP_USD, WORKER_STAKED_REVENUE_SHARE } from '@/lib/tokenomics';
import { CREDITS_PER_USD } from '@/lib/token-price';
import { buildImageWorkflow, IMAGE_CREDITS, IMAGE_MODEL_ID } from '@/lib/image-gen';
import { submitImageJob, ImageJobError } from '@/lib/orchestrator-image-client';
import { checkImagePromptSafety, classifyImageNsfw } from '@/lib/image-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PRIVACY PILLAR: generated images are NEVER persisted — not to disk, not to the
// DB. The PNG is returned inline to the caller and then dropped. The only record
// kept is the credit transaction (no prompt, no image), which billing requires.
//
// DECENTRALIZED: the render runs on a contributor GPU. We build the workflow
// centrally and submit it through the orchestrator, which dispatches it to an
// image worker and returns the PNG. (No direct ComfyUI tunnel.)

// Auth: accept either a Privy access token (the /create page) OR a c0mpute API
// key (sk-c0mpute-…, for agents). Returns the owner's privy_id AND the key's
// scope, or null. The scope has to survive this resolve: a free_only ("resale")
// key is minted to be handed to a third party, so it must never be able to reach
// the owner's paid balance — and /api/v1/images/generations forwards the caller's
// bearer verbatim, so this is the only place that sees it.
async function resolveUser(req: NextRequest): Promise<{ privyId: string; freeOnly: boolean; isApiKey: boolean } | null> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (token.startsWith('sk-c0mpute-')) {
    const key = resolveApiKeyFull(token);
    return key ? { privyId: key.privyId, freeOnly: key.freeOnly, isApiKey: true } : null;
  }
  const privyId = await verifyPrivyToken(token);
  return privyId ? { privyId, freeOnly: false, isApiKey: false } : null;
}

export async function POST(req: NextRequest) {
  const caller = await resolveUser(req);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized. Log in or use an API key.' }, { status: 401 });
  }
  const { privyId, freeOnly, isApiKey } = caller;

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

  // Pay order: (1) onboarding free images (treasury-subsidized, capped per
  // account + by the global daily subsidy cap), then (2) staker daily allowance,
  // then (3) paid credits. Refunded to whichever was used on any failure.
  let usedFreeImage = false;
  // The UTC day the allowance draw was written to (null = allowance not used), so
  // a refund after midnight settles against the row that was actually charged.
  let allowanceDay: string | null = null;
  const freeImagesOpen =
    FREE_IMAGE_LIMIT > 0 && getTodayFreeSubsidyUsd() < FREE_SUBSIDY_DAILY_CAP_USD;
  // The day's grant, drawn before the allowance and the balance for the same
  // reason as the text lane: a grant expires and credits do not. A resale key
  // is the exception — it may spend ONLY the staking allowance, so it must not
  // reach the owner's prepaid plan grant any more than it reaches their balance.
  // allowFree is false for any API key: the treasury-subsidized Free grant is
  // for people using the app, exactly as in the text lane. A plan grant is the
  // owner's prepaid money and does travel with a normal key. The Free half also
  // answers to the same subsidy caps as every other treasury-funded lane —
  // freeImagesOpen below only ever gated the ONBOARDING images.
  const projectedSubsidyUsd = (IMAGE_CREDITS / CREDITS_PER_USD) * WORKER_STAKED_REVENUE_SHARE;
  const freeGrantAllowed = !isApiKey
    && getTodayFreeSubsidyUsd() + projectedSubsidyUsd <= FREE_SUBSIDY_DAILY_CAP_USD
    && getThisHourFreeSubsidyUsd() + projectedSubsidyUsd <= FREE_SUBSIDY_HOURLY_CAP_USD;
  const grantDraw = freeOnly ? null : drawDailyGrant(privyId, IMAGE_CREDITS, freeGrantAllowed);
  if (!grantDraw && freeImagesOpen && consumeFreeImage(privyId, FREE_IMAGE_LIMIT)) {
    usedFreeImage = true;
  } else if (!grantDraw) {
    if (STAKER_ALLOWANCE_ENABLED) allowanceDay = drawStakerAllowance(privyId, IMAGE_CREDITS);
    // free_only ("resale") keys may spend ONLY the owner's daily staking
    // allowance — never the balance the owner topped up with USDC. Without this
    // stop the owner's real credits are drained 20 at a time by whoever holds the
    // key, unbounded, the moment the allowance runs out. The chat lane enforces
    // the same rule in the orchestrator (code ALLOWANCE_EXHAUSTED).
    if (!allowanceDay && freeOnly) {
      return NextResponse.json(
        {
          error: 'Insufficient staking allowance for this key. Resale keys can only spend the daily staking allowance.',
          code: 'ALLOWANCE_EXHAUSTED',
        },
        { status: 402 }
      );
    }
    if (!allowanceDay && !spendCredits(privyId, IMAGE_CREDITS, 'Image generation')) {
      return NextResponse.json(
        { error: `Insufficient credits. Image generation costs ${IMAGE_CREDITS} credits.` },
        { status: 402 }
      );
    }
  }
  const refund = (reason: string) => {
    if (grantDraw) refundDailyGrant(privyId, grantDraw.source, IMAGE_CREDITS, grantDraw.day);
    else if (usedFreeImage) refundFreeImage(privyId);
    else if (allowanceDay) refundStakerAllowance(privyId, IMAGE_CREDITS, allowanceDay);
    else refundCredits(privyId, IMAGE_CREDITS, reason);
  };
  // Which lane funded it. Only the free ones answer to the free-subsidy cap.
  const subsidyKind = grantDraw
    ? (grantDraw.source === 'plan' ? 'plan' as const : 'free_grant' as const)
    : allowanceDay
      ? 'allowance' as const
      : usedFreeImage
        ? 'free' as const
        : undefined;

  // Build the recipe centrally, then dispatch to a contributor GPU via the
  // orchestrator. `image` is base64 PNG; nothing is stored server-side.
  const { workflow, seed, width, height } = buildImageWorkflow({
    prompt,
    negativePrompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
    width: body.width,
    height: body.height,
    steps: body.steps,
    cfg: body.cfg,
    seed: body.seed,
  });

  let image: string;
  let jobId: string | undefined;
  try {
    // An allowance-funded render collects NO revenue, so it is booked subsidized
    // exactly like a free image. Sending subsidized:false would make recordEarning
    // treat the 20 credits nobody paid as real revenue: it pays a referrer 5% of
    // it and credits phantom margin to the buyback pool (lib/db.ts) — a
    // self-referral mint. The chat lane avoids this via subsidyKind:'allowance'.
    const subsidized = subsidyKind !== undefined;
    const result = await submitImageJob(workflow, { privyId, seed, width, height, creditsCharged: IMAGE_CREDITS, subsidized, subsidyKind });
    image = result.image;
    jobId = result.jobId;
  } catch (err: any) {
    refund('Image generation failed');
    const code = err instanceof ImageJobError ? err.code : undefined;
    if (code === 'NO_IMAGE_WORKER') {
      return NextResponse.json(
        { error: 'Image generation is busy — no GPUs are free right now. Try again in a moment.', code },
        { status: 503 }
      );
    }
    // err.message is NOT safe to hand back: it carries our internals (e.g.
    // "INTERNAL_API_SECRET not configured") and worker-supplied text. Log it for
    // ops, return a fixed message per failure class.
    console.error('[images/generate] render failed', code || 'UNKNOWN', err?.message || err);
    const timedOut = code === 'TIMEOUT';
    return NextResponse.json(
      { error: timedOut ? 'Image generation timed out. Try again.' : 'Image generation failed. Try again.' },
      { status: timedOut ? 504 : 503 }
    );
  }

  // Output classifier runs CENTRALLY here (we don't trust a worker to self-
  // censor) — ON only in SFW mode. A SFW user must not be served adult content;
  // the prompt was already SFW-filtered, so if the classifier is reachable and
  // flags the image we block + refund. In NSFW mode nothing is scanned.
  if (!wantNsfw) {
    const verdict = await classifyImageNsfw(Buffer.from(image, 'base64'));
    if (verdict.classifierUp && verdict.nsfw) {
      refund('SFW request produced adult content');
      // The render was rejected after the fact, so reverse the worker (and
      // referral) earning already booked for it on image:result — otherwise the
      // worker is paid for output we threw away and refunded.
      if (jobId) reverseWorkerEarning(jobId);
      return NextResponse.json(
        { error: 'That came out as adult content. Turn on NSFW (18+) to allow it, or adjust your prompt.' },
        { status: 400 }
      );
    }
  }

  // Return the image inline as a data URL — nothing is stored server-side.
  return NextResponse.json({
    image: `data:image/png;base64,${image}`,
    model: IMAGE_MODEL_ID,
    seed,
    width,
    height,
    credits_charged: IMAGE_CREDITS,
  });
}
