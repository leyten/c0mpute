import { NextRequest, NextResponse } from 'next/server';
import { getRecentImages } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public gallery wall — most recent generated images. No auth (it's a showcase).
export async function GET(req: NextRequest) {
  const limit = Number(new URL(req.url).searchParams.get('limit')) || 60;
  const images = getRecentImages(limit).map((i) => ({
    id: i.id,
    url: `/api/images/${i.id}.png`,
    prompt: i.prompt,
    width: i.width,
    height: i.height,
    created_at: i.created_at,
  }));
  return NextResponse.json({ images });
}
