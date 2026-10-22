import { NextRequest, NextResponse } from 'next/server';
import { resolveVideoCaller } from '@/lib/video-gen';
import { getVideoJobStatus, VideoJobError } from '@/lib/orchestrator-video-client';
import { getVideoChargeStatus } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One status poll for a Studio render (see POST /api/videos/generate).
// While it runs: JSON { status: 'queued' | 'rendering', pct, stage }. When it
// fails: JSON { status: 'failed', error } (already refunded). When it is done:
// the MP4 itself, on every poll until the orchestrator drops it an hour after
// it finished, so a failed download can simply be retried.
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const caller = await resolveVideoCaller(req);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized. Log in or use an API key.' }, { status: 401 });
  }
  const { jobId } = await params;

  let st;
  try {
    st = await getVideoJobStatus(jobId, caller.privyId);
  } catch (err) {
    console.error('[videos/status] poll failed', err instanceof VideoJobError ? err.code : 'UNKNOWN', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not reach the video network. Your render is unaffected.' }, { status: 503 });
  }

  if (st.status === 'done') {
    return new NextResponse(new Uint8Array(Buffer.from(st.video, 'base64')), {
      headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' },
    });
  }
  if (st.status === 'gone') {
    // The orchestrator no longer knows the job. Its charge row says why: a
    // render that died with a restarted orchestrator was refunded at startup,
    // a delivered one simply expired.
    const charge = getVideoChargeStatus(jobId, caller.privyId);
    const error = charge === 'refunded'
      ? 'This render was interrupted before it finished. Your credits were refunded.'
      : charge === 'settled'
        ? 'This clip has expired. Finished clips are kept for an hour.'
        : 'This render is no longer available.';
    return NextResponse.json({ status: 'gone', error }, { status: 404 });
  }
  return NextResponse.json(st, { headers: { 'Cache-Control': 'no-store' } });
}
