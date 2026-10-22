'use client';

import SiteNav from '@/components/SiteNav';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { VideoStage } from '@/lib/orchestrator/types';

const VIDEO_CREDITS = 250; // keep in sync with lib/video-gen VIDEO_CREDITS
const NSFW_ACK_KEY = 'c0mpute_nsfw_ack'; // shared with /create: one 18+ confirmation covers both
const PENDING_KEY = 'c0mpute_studio_pending';
const ACCENT = 'var(--steel)';
const POLL_MS = 3000;
// Past this a render is over one way or another (the server holds a finished
// clip for 10 minutes), so a page left open stops asking.
const PENDING_MAX_MS = 30 * 60_000;

// The sizes the server's workflow manifest allows; anything else falls back to the first.
const RATIOS: { label: string; w: number; h: number }[] = [
  { label: 'Landscape', w: 1280, h: 720 },
  { label: 'Portrait', w: 720, h: 1280 },
  { label: 'Square', w: 960, h: 960 },
];

const STAGE_COPY: Record<VideoStage, string> = {
  loading: 'Loading the model',
  sampling: 'Rendering frames',
  decoding: 'Decoding frames',
  interpolating: 'Smoothing motion',
  encoding: 'Encoding the clip',
};

// Client-side history in IndexedDB, as on /create, but each record holds the
// MP4 itself. The server keeps nothing: once collected, this is the only copy.
interface SavedVideo { id: string; blob: Blob; prompt: string; seed?: number; width: number; height: number; createdAt: number; }
// `url` is an object URL for the blob, revoked when the video leaves the page.
interface ShownVideo extends SavedVideo { url: string; }
// A render in flight. Kept in localStorage so a reload picks the poll back up.
interface PendingJob { jobId: string; prompt: string; seed?: number; width: number; height: number; startedAt: number; }

const IDB_NAME = 'c0mpute-studio';
const IDB_STORE = 'videos';
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbAll(): Promise<SavedVideo[]> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(((req.result as SavedVideo[]) || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(rec: SavedVideo): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(id: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readPending(): PendingJob | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as PendingJob | null;
    if (p?.jobId && Date.now() - p.startedAt < PENDING_MAX_MS) return p;
  } catch {}
  localStorage.removeItem(PENDING_KEY);
  return null;
}

function frameStyle(w: number, h: number): CSSProperties {
  return { aspectRatio: `${w} / ${h}`, maxHeight: '100%', maxWidth: '100%' };
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8m0 0L5 7m3 3l3-3M2.5 12.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
    </svg>
  );
}
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 2.5l7 7m0-7l-7 7" />
    </svg>
  );
}
function RatioGlyph({ w, h }: { w: number; h: number }) {
  const cls = h > w ? 'w-2.5 h-3.5' : w > h ? 'w-4 h-2.5' : 'w-3 h-3';
  return <span className={`inline-block rounded-[3px] border border-current ${cls}`} aria-hidden="true" />;
}

export default function StudioPage() {
  const router = useRouter();
  const { isAuthenticated, login, getAccessToken } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [ratioIdx, setRatioIdx] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [showGate, setShowGate] = useState(false);

  const [job, setJob] = useState<PendingJob | null>(null);
  const [progress, setProgress] = useState<{ status: 'queued' | 'rendering'; pct: number; stage?: VideoStage }>({ status: 'queued', pct: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ShownVideo | null>(null);
  const [history, setHistory] = useState<ShownVideo[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [grantLeft, setGrantLeft] = useState(0);
  const historyRef = useRef<ShownVideo[]>([]);

  const loadBalance = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/credits', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setBalance(Number(d.balance || 0) + Number(d.stakerAllowance?.remaining || 0));
        setGrantLeft(Number(d.dailyGrant?.remaining ?? 0));
      }
    } catch {}
  }, [isAuthenticated, getAccessToken]);

  useEffect(() => { loadBalance(); }, [loadBalance]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => {
    // Saved clips, plus a render that was still running when the page was left.
    if (typeof indexedDB !== 'undefined') {
      idbAll().then((recs) => setHistory(recs.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) })))).catch(() => {});
    }
    const pending = readPending();
    if (pending) setJob(pending);
    return () => { for (const v of historyRef.current) URL.revokeObjectURL(v.url); };
  }, []);

  // Poll the render. Sequential (the next poll waits for this one), because the
  // final answer is the whole MP4. That answer is handed out once, so it is
  // saved to IndexedDB even if the page is already on its way out.
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000)), 1000);
    const end = (message: string | null) => {
      localStorage.removeItem(PENDING_KEY);
      if (stopped) return;
      setJob(null);
      if (message) setError(message);
      loadBalance();
    };
    const poll = async () => {
      if (Date.now() - job.startedAt > PENDING_MAX_MS) { end('This render is no longer available.'); return; }
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/videos/${job.jobId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (res.ok && res.headers.get('content-type')?.startsWith('video/')) {
          const blob = await res.blob();
          const rec: SavedVideo = {
            id: job.jobId, blob, prompt: job.prompt, seed: job.seed, width: job.width, height: job.height, createdAt: job.startedAt,
          };
          idbPut(rec).catch(() => {});
          if (!stopped) {
            const shown = { ...rec, url: URL.createObjectURL(blob) };
            setHistory((h) => [shown, ...h]);
            setCurrent(shown);
          }
          end(null);
          return;
        }
        const data = await res.json();
        if (data.status === 'failed' || data.status === 'gone') { end(data.error || 'Video generation failed.'); return; }
        if (!stopped && (data.status === 'queued' || data.status === 'rendering')) {
          setProgress({ status: data.status, pct: Number(data.pct) || 0, stage: data.stage });
        }
        // Anything else (the network briefly unreachable, a token refresh) just polls again.
      } catch {}
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); clearInterval(tick); };
  }, [job, getAccessToken, loadBalance]);

  const deleteVideo = async (id: string) => {
    const gone = history.find((x) => x.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setHistory((h) => h.filter((x) => x.id !== id));
    if (current?.id === id) setCurrent(null);
    try { await idbDelete(id); } catch {}
  };

  const toggleNsfw = () => {
    if (nsfw) { setNsfw(false); return; }
    const acked = typeof window !== 'undefined' && localStorage.getItem(NSFW_ACK_KEY) === '1';
    if (acked) { setNsfw(true); return; }
    setShowGate(true);
  };

  const confirmGate = () => {
    if (typeof window !== 'undefined') localStorage.setItem(NSFW_ACK_KEY, '1');
    setNsfw(true);
    setShowGate(false);
  };

  const generate = async () => {
    setError(null);
    if (!prompt.trim() || job || submitting) return;
    if (!isAuthenticated) { login(); return; }

    setSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Please log in first.'); return; }
      const ratio = RATIOS[ratioIdx];
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), width: ratio.w, height: ratio.h, adult: nsfw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed.');
        loadBalance();
        return;
      }
      const pending: PendingJob = {
        jobId: data.jobId, prompt: prompt.trim(), seed: data.seed, width: data.width, height: data.height, startedAt: Date.now(),
      };
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      setProgress({ status: 'queued', pct: 0 });
      setElapsed(0);
      setCurrent(null);
      setJob(pending);
      loadBalance();
    } catch {
      setError('Generation failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || job !== null;
  const lowBalance = balance !== null && balance + grantLeft < VIDEO_CREDITS;
  const videosLeftToday = Math.floor(grantLeft / VIDEO_CREDITS);
  const ratio = RATIOS[ratioIdx];
  const canvasShape = job ? frameStyle(job.width, job.height) : current ? frameStyle(current.width, current.height) : frameStyle(ratio.w, ratio.h);
  const stageText = progress.status === 'queued' ? 'Waiting for a free GPU' : (progress.stage && STAGE_COPY[progress.stage]) || 'Rendering';

  const chip = (active: boolean) =>
    `cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg border transition-colors ${
      active ? 'bg-fg text-on-fg border-fg' : 'bg-transparent text-fg-60 border-fg/15 hover:text-fg hover:border-fg/35'
    }`;

  return (
    <div className="ui-readable flex h-dvh flex-col overflow-hidden bg-background">
      <SiteNav />

      {/* the nav is fixed, so the studio starts below it */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-[70px] md:pt-[88px] md:flex-row md:gap-4 md:px-6 md:pb-6">
        {history.length > 0 && (
          <aside className="flex shrink-0 gap-2 overflow-x-auto pb-1 md:w-[88px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pb-0">
            {history.map((g) => (
              <div key={g.id} className="group relative aspect-square h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-fg/10 md:h-auto md:w-full">
                {/* #t=0.1 makes browsers paint a first frame as the thumbnail */}
                <video src={`${g.url}#t=0.1`} muted playsInline preload="metadata" onClick={() => setCurrent(g)} aria-label={g.prompt}
                  className={`h-full w-full cursor-pointer object-cover transition-opacity ${current?.id === g.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`} />
                <button onClick={() => deleteVideo(g.id)} aria-label="Delete video"
                  className="absolute right-1 top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-md bg-img-veil text-white/70 opacity-0 transition-opacity hover:bg-img-veil-hi hover:text-white group-hover:opacity-100">
                  <IconX />
                </button>
              </div>
            ))}
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <section className="grid min-h-0 flex-1 place-items-center">
            <div style={canvasShape}
              className={`overflow-hidden rounded-2xl border bg-fg/[0.02] ${job ? 'border-fg/15' : 'border-fg/10'}`}>
              {job ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8" role="status">
                  <div className="h-1 w-48 max-w-full overflow-hidden rounded-full bg-fg/10">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, progress.pct)}%`, background: ACCENT }} />
                  </div>
                  <p className="pixel-sans text-xs text-fg-70">
                    {stageText}{progress.status === 'rendering' && progress.pct > 0 ? ` · ${progress.pct}%` : ''}
                  </p>
                  <p className="pixel-sans text-xs tabular-nums text-fg-45">{elapsed}s elapsed · usually 4 to 10 minutes</p>
                  <p className="pixel-sans line-clamp-2 max-w-sm text-center text-xs text-fg-35">{job.prompt}</p>
                  <p className="pixel-sans max-w-sm text-center text-xs text-fg-30">You can leave and come back. A finished clip waits 10 minutes.</p>
                </div>
              ) : current ? (
                <video key={current.id} src={current.url} controls autoPlay muted loop playsInline className="block h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-8 text-center">
                  <p className="pixel-sans text-sm text-fg-55">Your video appears here</p>
                  <p className="pixel-sans text-xs text-fg-30">Describe it below and press Generate</p>
                </div>
              )}
            </div>
          </section>

          {current && !job && (
            <div className="mt-3 flex shrink-0 items-center justify-between gap-4">
              <span className="pixel-sans truncate text-xs tabular-nums text-fg-45">
                {current.width} x {current.height}{current.seed ? ` · seed ${current.seed}` : ''}
              </span>
              <a href={current.url} download={`compute-${current.seed || 'video'}.mp4`}
                className="pixel-sans inline-flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-xs text-on-fg transition-colors hover:bg-fg/90">
                <IconDownload /> Download
              </a>
            </div>
          )}

          {isAuthenticated && lowBalance && !job && (
            <div className="pixel-sans mt-3 shrink-0 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-2.5 text-xs text-amber-300/90">
              You have {(balance ?? 0).toLocaleString()} credits and a video costs {VIDEO_CREDITS}.{' '}
              <button onClick={() => router.push('/settings')} className="cursor-pointer underline hover:text-amber-200">Top up in settings</button>
            </div>
          )}
          {error && (
            <div role="alert" className="pixel-sans mt-3 shrink-0 rounded-xl border border-danger/20 bg-danger/[0.05] px-4 py-2.5 text-xs text-danger-soft/90">{error}</div>
          )}

          <section className="mt-3 shrink-0 rounded-2xl border border-fg/10 bg-fg/[0.02] p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {RATIOS.map((r, i) => (
                <button key={r.label} onClick={() => setRatioIdx(i)} aria-pressed={ratioIdx === i} title={`${r.label} ${r.w} x ${r.h}`}
                  className={`${chip(ratioIdx === i)} inline-flex items-center gap-2`}>
                  <RatioGlyph w={r.w} h={r.h} /><span className="hidden sm:inline">{r.label}</span>
                </button>
              ))}
              <span className="mx-1 hidden h-5 w-px bg-fg/10 sm:block" aria-hidden="true" />
              <button onClick={toggleNsfw} aria-pressed={nsfw}
                title="Allow adult content. Sexual content involving minors is never generated."
                className={`pixel-sans inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  nsfw ? 'border-danger/40 bg-danger/15 text-danger-soft' : 'border-fg/15 bg-transparent text-fg-60 hover:border-fg/35 hover:text-fg'
                }`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${nsfw ? 'bg-danger' : 'bg-fg/25'}`} aria-hidden="true" />18+
              </button>
            </div>

            <div className="flex items-end gap-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } }}
                placeholder="Describe the scene and the motion you want"
                maxLength={2000}
                rows={2}
                className="pixel-sans min-w-0 flex-1 resize-none bg-transparent text-[15px] text-fg placeholder-fg-40 focus:outline-none"
              />
              <button
                onClick={generate}
                disabled={busy || !prompt.trim() || (isAuthenticated && lowBalance)}
                className="pixel-serif shrink-0 cursor-pointer rounded-xl bg-fg px-6 py-2.5 text-sm text-on-fg transition-colors hover:bg-fg/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {job ? `Rendering ${elapsed}s` : submitting ? 'Starting' : !isAuthenticated ? 'Log in to generate' : lowBalance ? 'Not enough credits' : `Generate · ${VIDEO_CREDITS} credits`}
              </button>
            </div>

            <div className="pixel-sans mt-2 text-xs">
              {isAuthenticated && videosLeftToday > 0
                ? <span className="text-fg-45">{videosLeftToday} video{videosLeftToday > 1 ? 's' : ''} left today · {VIDEO_CREDITS} credits each</span>
                : <span className="text-fg-45">{VIDEO_CREDITS} credits per 5 second clip</span>}
              <span className="hidden text-fg-30 md:inline"> · Enter to generate, Shift and Enter for a new line · saved in this browser only</span>
            </div>
          </section>
        </div>
      </main>

      {/* 18+ gate */}
      {showGate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-fg/15 bg-background p-6">
            <h3 className="pixel-serif mb-3 text-xl text-fg">Adult content (18+)</h3>
            <p className="pixel-sans mb-2 text-sm text-fg-70">
              Enabling 18+ allows generation of adult content. By continuing you confirm you are 18 or older and that adult content is legal where you live.
            </p>
            <p className="pixel-sans mb-5 text-xs text-fg-70">
              Sexual content involving minors is never generated and is permanently blocked.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowGate(false)} className="pixel-sans flex-1 cursor-pointer rounded-xl border border-fg/15 px-4 py-2.5 text-sm text-fg-70 transition-colors hover:text-fg">Cancel</button>
              <button onClick={confirmGate} className="pixel-serif flex-1 cursor-pointer rounded-xl bg-fg px-4 py-2.5 text-sm text-on-fg transition-colors hover:bg-fg/90">I&apos;m 18+, continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
