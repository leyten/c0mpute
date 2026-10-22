import { NextRequest, NextResponse } from 'next/server';
import { resolveVideoCaller } from '@/lib/video-gen';
import { getVideoJobStatus, VideoJobError } from '@/lib/orchestrator-video-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One status poll for a Studio render (see POST /api/videos/generate).
// While it runs: JSON { status: 'queued' | 'rendering', pct, stage }. When it
// fails: JSON { status: 'failed', error } (already refunded). When it is done:
// the MP4 itself, handed out once; the orchestrator drops it on this read, or
// ten minutes after it finished if nobody comes for it.
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
    return NextResponse.json({ status: 'gone', error: 'This render is no longer available.' }, { status: 404 });
  }
  return NextResponse.json(st, { headers: { 'Cache-Control': 'no-store' } });
}
