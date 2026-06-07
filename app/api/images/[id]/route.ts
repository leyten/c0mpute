import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getImageById } from '@/lib/db';

export const runtime = 'nodejs';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'images');

// Serve a generated PNG by id. Public by design (the gallery is a showcase),
// but blocked images 404 and the id is sanitized to its uuid.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = (raw || '').replace(/\.png$/i, '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rec = getImageById(id);
  if (!rec || rec.blocked) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const buf = await readFile(path.join(IMAGES_DIR, `${id}.png`));
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
