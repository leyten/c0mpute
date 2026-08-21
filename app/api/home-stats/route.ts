import { NextResponse } from 'next/server';

// The homepage's live stat row. stats.json is ~1.7MB of full history and
// regenerates every 5 minutes — this summarizes it server-side on the same
// cadence so the client gets four numbers, not the archive. On any failure
// the homepage hides the row rather than rendering dashes.
export const revalidate = 300;

const STATS_URL = 'https://data.compute.tech/stats.json';

export async function GET() {
  try {
    const res = await fetch(STATS_URL, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(String(res.status));
    const s = await res.json();
    const rows: { jobs?: number; tokens?: number }[] = s?.network?.jobsDaily ?? [];
    let jobs = 0, tokens = 0;
    for (const r of rows) { jobs += r.jobs ?? 0; tokens += r.tokens ?? 0; }
    const workers = s?.live?.workersOnline;
    if (typeof workers !== 'number' || jobs === 0) throw new Error('empty');
    return NextResponse.json({ workers, jobs, tokens });
  } catch {
    return NextResponse.json({ error: true }, { status: 503 });
  }
}
