import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { spendCredits, refundCredits, getTodayFreeSubsidyUsd, getThisHourFreeSubsidyUsd, recordVideoCharge } from '@/lib/db';
import { drawStakerAllowance, refundStakerAllowance } from '@/lib/staker-allowance';
import { drawDailyGrant, refundDailyGrant } from '@/lib/plan-state';
import { STAKER_ALLOWANCE_ENABLED, FREE_SUBSIDY_DAILY_CAP_USD, FREE_SUBSIDY_HOURLY_CAP_USD, WORKER_STAKED_REVENUE_SHARE } from '@/lib/tokenomics';
import { CREDITS_PER_USD } from '@/lib/token-price';
import { buildVideoWorkflow, resolveVideoCaller, VIDEO_CREDITS } from '@/lib/video-gen';
import { submitVideoJob, checkVideoAdmission, VideoJobError } from '@/lib/orchestrator-video-client';
import { refundVideoCharge } from '@/lib/video-charges';
import { checkImagePromptSafety } from '@/lib/image-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// What the user is told when the orchestrator won't take a job, by its code.
// Null for anything unexpected (logged, generic message).
function refusal(code: string | undefined): NextResponse | null {
  if (code === 'NO_VIDEO_WORKER') {
    return NextResponse.json({ error: 'No video GPU is online right now, so nothing was charged. Try again later.', code }, { status: 503 });
  }
  if (code === 'TOO_MANY_VIDEOS') {
    return NextResponse.json({ error: 'You already have 2 videos in progress. Wait for one to finish.', code }, { status: 429 });
  }
  if (code === 'STUDIO_BUSY') {
    return NextResponse.json({ error: 'Studio is busy, try again shortly.', code }, { status: 503 });
  }
  return null;
}

// Studio text-to-video. A clip renders for 4-11 minutes, far past the 100s
// Cloudflare allows one HTTP request, so this route only authenticates,
// guards the prompt, charges and queues the job, then answers { jobId } at
// once. The client polls GET /api/videos/<jobId> for progress and the clip.
//
// The charge is made here, exactly as for images, but the refund mostly cannot
// be: this request is long gone when a render fails. So the charge is written
// to video_charges (lane, day, credits) under our own job id before the
// submit, and every refund, ours below, the orchestrator's on any failure, or
// its startup sweep after a crash, goes through that row's latch, once.
//
// PRIVACY: same posture as images. Nothing is stored; the orchestrator holds
// the finished clip in memory only, for ten minutes after it finishes.
//
// There is no output classifier for video yet, so SFW mode rests on the
// prompt guard and the SFW-only graph. Classifying SFW output is a
// pre-public-launch item.

export async function POST(req: NextRequest) {
  const caller = await resolveVideoCaller(req);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized. Log in or use an API key.' }, { status: 401 });
  }
  const { privyId, freeOnly, isApiKey } = caller;

  // Untrusted JSON: every field is checked or coerced below.
  let body: { prompt?: unknown; adult?: unknown; width?: number; height?: number; seed?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: '`prompt` is required.' }, { status: 400 });
  }
  if (prompt.length > 2000) {
    return NextResponse.json({ error: 'Prompt is too long (2000 characters max).' }, { status: 400 });
  }

  // Adult opt-in (18+ gated client-side, as on /create). An adult job only
  // goes to a worker that opted in; the minor/CSAM line holds regardless.
  const adult = body?.adult === true;
  const safety = checkImagePromptSafety(prompt, { nsfwAllowed: adult });
  if (!safety.allowed) {
    return NextResponse.json({ error: safety.reason }, { status: 400 });
  }

  // Built before anything is charged, so an unconfigured Studio costs nothing.
  // An adult request only ever gets the 18+ graph and an SFW one only the SFW
  // graph: neither falls back to the other.
  const built = buildVideoWorkflow({ prompt, adult, width: body.width, height: body.height, seed: body.seed });
  if (!built) {
    return adult
      ? NextResponse.json({ error: '18+ Studio is unavailable right now.', code: 'STUDIO_ADULT_UNAVAILABLE' }, { status: 503 })
      : NextResponse.json({ error: 'Studio is unavailable right now.', code: 'STUDIO_UNAVAILABLE' }, { status: 503 });
  }

  // Ask before charging: no capable worker, too many of this account's jobs in
  // flight, or the orchestrator's held clips over budget all refuse here, for
  // free. The submit re-checks (two requests can pass this together).
  try {
    const admission = await checkVideoAdmission(privyId, adult);
    if ('error' in admission) {
      return refusal(admission.code) ?? NextResponse.json({ error: 'Video generation is unavailable right now. Try again.' }, { status: 503 });
    }
  } catch (err) {
    console.error('[videos/generate] admission check failed', err instanceof VideoJobError ? err.code : 'UNKNOWN', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Video generation is unavailable right now. Try again.' }, { status: 503 });
  }

  // Pay order as for images minus the onboarding free images (there are no
  // free videos): the day's grant, then the staker allowance, then credits.
  // The same rules carry over: a resale key spends only the allowance, and
  // the treasury-funded Free grant is for app users under the subsidy caps.
  const projectedSubsidyUsd = (VIDEO_CREDITS / CREDITS_PER_USD) * WORKER_STAKED_REVENUE_SHARE;
  const freeGrantAllowed = !isApiKey
    && getTodayFreeSubsidyUsd() + projectedSubsidyUsd <= FREE_SUBSIDY_DAILY_CAP_USD
    && getThisHourFreeSubsidyUsd() + projectedSubsidyUsd <= FREE_SUBSIDY_HOURLY_CAP_USD;
  const grantDraw = freeOnly ? null : drawDailyGrant(privyId, VIDEO_CREDITS, freeGrantAllowed);
  let allowanceDay: string | null = null;
  if (!grantDraw) {
    if (STAKER_ALLOWANCE_ENABLED) allowanceDay = drawStakerAllowance(privyId, VIDEO_CREDITS);
    if (!allowanceDay && freeOnly) {
      return NextResponse.json(
        {
          error: 'Insufficient staking allowance for this key. Resale keys can only spend the daily staking allowance.',
          code: 'ALLOWANCE_EXHAUSTED',
        },
        { status: 402 }
      );
    }
    if (!allowanceDay && !spendCredits(privyId, VIDEO_CREDITS, 'Video generation')) {
      return NextResponse.json(
        { error: `Insufficient credits. A video costs ${VIDEO_CREDITS} credits.` },
        { status: 402 }
      );
    }
  }
  const subsidyKind = grantDraw
    ? (grantDraw.source === 'plan' ? 'plan' as const : 'free_grant' as const)
    : allowanceDay
      ? 'allowance' as const
      : undefined;

  // The job id is ours, with a 10s accept deadline the orchestrator enforces.
  // The submit call waits 15s, so if no ack arrives the job can no longer be
  // accepted by the time we refund below.
  const jobId = randomUUID();
  try {
    recordVideoCharge({ jobId, privyId, lane: subsidyKind ?? 'credits', chargeDay: grantDraw?.day ?? allowanceDay, credits: VIDEO_CREDITS });
  } catch (err) {
    // Without the row nothing could refund this later, so give it back now.
    if (grantDraw) refundDailyGrant(privyId, grantDraw.source, VIDEO_CREDITS, grantDraw.day);
    else if (allowanceDay) refundStakerAllowance(privyId, VIDEO_CREDITS, allowanceDay);
    else refundCredits(privyId, VIDEO_CREDITS, 'Video generation failed');
    console.error('[videos/generate] could not record the charge', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Video generation is unavailable right now. Try again.' }, { status: 503 });
  }
  try {
    // subsidized: no revenue was collected, so the payout must not book any
    // (see the same note in the image route).
    await submitVideoJob({
      jobId,
      acceptBy: Date.now() + 10_000,
      workflow: built.workflow,
      outputNode: built.outputNode,
      adult,
      privyUserId: privyId,
      seed: built.seed,
      width: built.width,
      height: built.height,
      creditsCharged: VIDEO_CREDITS,
      subsidized: subsidyKind !== undefined,
      subsidyKind,
    });
    return NextResponse.json({
      jobId,
      seed: built.seed,
      width: built.width,
      height: built.height,
      frames: built.frames,
      credits_charged: VIDEO_CREDITS,
    });
  } catch (err) {
    // Refused, or no ack before the deadline: not accepted, so the refund is
    // ours. Through the latch, in case the ack was lost after an accept.
    refundVideoCharge(jobId, 'Video generation failed');
    const code = err instanceof VideoJobError ? err.code : undefined;
    const refused = refusal(code);
    if (refused) return refused;
    console.error('[videos/generate] submit failed', code || 'UNKNOWN', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Video generation is unavailable right now. Try again.' }, { status: 503 });
  }
}
