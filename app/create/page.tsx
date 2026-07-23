'use client';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import StatusBadge from '@/components/StatusBadge';

interface ResultImage {
  url: string; // inline data URL, never stored server-side
  prompt: string;
  width: number | null;
  height: number | null;
  seed?: number;
}

const IMAGE_CREDITS = 20; // keep in sync with lib/image-gen IMAGE_CREDITS
const NSFW_ACK_KEY = 'c0mpute_nsfw_ack';
const ACCENT = '#80a0c1';

// Style presets: `pos` is appended to the prompt, `neg` to the negative prompt
// (on top of the server-side baseline anti-slop negative). Written in real-photo
// language: stacking "professional photography, sharp focus, high detail" is
// what produced the over-processed AI-slop look.
const STYLES: { label: string; pos: string; neg: string }[] = [
  { label: 'None', pos: '', neg: '' },
  { label: 'Photo', pos: ', candid photo, 35mm film, natural daylight, natural colors, realistic', neg: 'cgi, 3d render, cartoon, illustration, painting, anime' },
  { label: 'Cinematic', pos: ', cinematic film still, anamorphic, moody natural lighting, 35mm, realistic', neg: 'cgi, video game, cartoon, illustration' },
  { label: 'Anime', pos: ', anime illustration, clean linework, vibrant cel shading', neg: 'photorealistic, photograph, 3d render' },
  { label: 'Digital Art', pos: ', digital painting, detailed concept art, painterly', neg: 'photograph, low effort' },
  { label: '3D', pos: ', 3d render, octane render, physically based rendering, detailed', neg: 'flat, 2d, sketch' },
];

const RATIOS: { label: string; w: number; h: number }[] = [
  { label: 'Square', w: 1024, h: 1024 },
  { label: 'Portrait', w: 832, h: 1216 },
  { label: 'Landscape', w: 1216, h: 832 },
];

// Client-side image history. Kept in IndexedDB (not localStorage: full PNGs blow
// localStorage's ~5MB quota after a couple images). Fully private: the browser
// is the only place these live; the server still stores nothing.
interface SavedImage { id: string; url: string; prompt: string; seed?: number; width: number | null; height: number | null; createdAt: number; }
const IDB_NAME = 'c0mpute-create';
const IDB_STORE = 'images';
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbAll(): Promise<SavedImage[]> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(((req.result as SavedImage[]) || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(rec: SavedImage): Promise<void> {
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

// The canvas frame takes the exact shape of the image it holds (or the shape
// the user selected, before one exists). Width caps keep tall formats from
// running past the viewport inside the centered column.
function frameStyle(w: number | null, h: number | null): CSSProperties {
  const W = w || 1024;
  const H = h || 1024;
  const maxWidth = H > W ? 420 : H === W ? 560 : 900;
  return { aspectRatio: `${W} / ${H}`, maxWidth: `${maxWidth}px` };
}

// Small inline glyphs. Stroke inherits currentColor so hover states carry through.
function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8m0 0L5 7m3 3l3-3M2.5 12.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
    </svg>
  );
}
function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2" />
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
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M2 3.5l3 3 3-3" />
    </svg>
  );
}

// Ratio selector glyph: a small rectangle in the actual orientation.
function RatioGlyph({ w, h }: { w: number; h: number }) {
  const landscape = w > h;
  const portrait = h > w;
  const cls = portrait ? 'w-2.5 h-3.5' : landscape ? 'w-4 h-2.5' : 'w-3 h-3';
  return <span className={`inline-block rounded-[3px] border border-current ${cls}`} aria-hidden="true" />;
}

export default function CreatePage() {
  const router = useRouter();
  const { isAuthenticated, login, getAccessToken } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [styleIdx, setStyleIdx] = useState(1); // default to "Photo": "None" hands users the raw model (CGI look)
  const [ratioIdx, setRatioIdx] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [showGate, setShowGate] = useState(false);

  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [negative, setNegative] = useState('');
  const [steps, setSteps] = useState(32);
  const [cfg, setCfg] = useState(4.0);
  const [seed, setSeed] = useState('');

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ResultImage | null>(null);
  const [history, setHistory] = useState<SavedImage[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [freeImages, setFreeImages] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const loadBalance = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/credits', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const avail = Number(d.balance || 0) + Number(d.stakerAllowance?.remaining || 0);
        setBalance(avail);
        setFreeImages(Number(d.freeImagesRemaining ?? 0));
      }
    } catch {}
  }, [isAuthenticated, getAccessToken]);

  useEffect(() => { loadBalance(); }, [loadBalance]);
  useEffect(() => { if (typeof indexedDB !== 'undefined') idbAll().then(setHistory).catch(() => {}); }, []);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const deleteImage = async (id: string) => {
    setHistory((h) => h.filter((x) => x.id !== id));
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

  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const generate = async () => {
    setError(null);
    if (!prompt.trim()) return;
    if (!isAuthenticated) { login(); return; }

    setLoading(true);
    setCurrent(null);
    setElapsed(0);
    // Bring the canvas into view (matters on mobile, where it sits below the form).
    if (typeof window !== 'undefined') previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t0 = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);

    try {
      const token = await getAccessToken();
      if (!token) { setError('Please log in first.'); return; }

      const ratio = RATIOS[ratioIdx];
      const seedNum = seed.trim() ? Math.max(1, Math.floor(Number(seed))) : undefined;
      const style = STYLES[styleIdx];
      const combinedNeg = [style.neg, negative.trim()].filter(Boolean).join(', ') || undefined;
      const body: Record<string, unknown> = {
        prompt: prompt.trim() + style.pos,
        negative_prompt: combinedNeg,
        width: ratio.w,
        height: ratio.h,
        steps,
        cfg,
        seed: Number.isFinite(seedNum as number) ? seedNum : undefined,
        nsfw,
      };

      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setError(data.error || 'Not enough credits. Top up in settings.');
        else setError(data.error || 'Generation failed.');
        return;
      }
      const saved: SavedImage = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(t0),
        url: data.image,
        prompt: prompt.trim(),
        seed: data.seed,
        width: data.width,
        height: data.height,
        createdAt: t0,
      };
      setCurrent(saved);
      // Persist to the browser (IndexedDB) so the user keeps their images. Nothing server-side.
      setHistory((h) => [saved, ...h]);
      idbPut(saved).catch(() => {});
      loadBalance();
    } catch {
      setError('Generation failed. Try again.');
    } finally {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setLoading(false);
    }
  };

  const hasFree = (freeImages ?? 0) > 0;
  const lowBalance = balance !== null && balance < IMAGE_CREDITS && !hasFree;
  const progressPct = Math.min(95, (elapsed / 30) * 100);
  const ratio = RATIOS[ratioIdx];
  const canvasShape = current ? frameStyle(current.width, current.height) : frameStyle(ratio.w, ratio.h);

  const chip = (active: boolean) =>
    `cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg border transition-colors ${
      active ? 'bg-white text-black border-white' : 'bg-transparent text-white/60 border-white/15 hover:text-white hover:border-white/35'
    }`;

  return (
    <div className="ui-readable min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
              c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
            </a>
            <div className="flex items-center gap-4">
              {balance !== null && (
                <span className="pixel-sans text-xs text-white/70 hidden sm:inline">{balance.toLocaleString()} credits</span>
              )}
              <button onClick={() => router.push('/settings')} className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">Settings</button>
              <button onClick={() => router.push('/')} className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">Back</button>
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-20 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <div className="flex items-baseline gap-3 mb-2">
              <h1 className="pixel-serif text-white text-3xl md:text-4xl">Create</h1>
              <StatusBadge state="live" />
            </div>
            <p className="pixel-sans text-white/60 text-sm max-w-xl">
              Image generation on the c0mpute network. Every image is returned straight to your browser and the server stores nothing.
            </p>
          </div>

          {/* Prompt bar */}
          <section className="border border-white/10 bg-white/[0.02] rounded-2xl p-4 md:p-5 mb-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
              placeholder="Describe the image you want"
              rows={3}
              className="w-full bg-transparent pixel-sans text-white text-[15px] placeholder-white/40 focus:outline-none resize-none"
            />
            <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t border-white/[0.06]">
              <div className="pixel-sans text-xs min-w-0">
                {isAuthenticated && hasFree ? (
                  <span className="text-emerald-300/90">{freeImages} free image{(freeImages ?? 0) > 1 ? 's' : ''} left, on us</span>
                ) : (
                  <span className="text-white/45">{IMAGE_CREDITS} credits ($0.20) per image</span>
                )}
                <span className="text-white/30 hidden md:inline"> · Ctrl or Cmd + Enter</span>
              </div>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim() || (isAuthenticated && lowBalance)}
                className="cursor-pointer flex-shrink-0 pixel-serif text-sm px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? `Generating ${elapsed}s` : !isAuthenticated ? 'Log in to generate' : lowBalance ? 'Not enough credits' : hasFree ? `Generate free (${freeImages} left)` : 'Generate'}
              </button>
            </div>
          </section>

          {/* Notices */}
          {isAuthenticated && lowBalance && (
            <div className="pixel-sans text-xs text-amber-300/90 border border-amber-400/20 bg-amber-400/[0.05] rounded-xl px-4 py-3 mb-4">
              You have {balance?.toLocaleString()} credits and an image costs {IMAGE_CREDITS}.{' '}
              <button onClick={() => router.push('/settings')} className="cursor-pointer underline hover:text-amber-200">Top up in settings</button>
            </div>
          )}
          {error && (
            <div role="alert" className="pixel-sans text-xs text-red-300/90 border border-red-400/20 bg-red-400/[0.05] rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {/* Options: quiet, single band under the prompt */}
          <section className="mb-10">
            <div className="flex flex-wrap items-center gap-2">
              {STYLES.map((s, i) => (
                <button key={s.label} onClick={() => setStyleIdx(i)} aria-pressed={styleIdx === i} className={chip(styleIdx === i)}>
                  {s.label}
                </button>
              ))}
              <span className="w-px h-5 bg-white/10 mx-1 hidden sm:block" aria-hidden="true" />
              {RATIOS.map((r, i) => (
                <button key={r.label} onClick={() => setRatioIdx(i)} aria-pressed={ratioIdx === i} title={`${r.label} ${r.w} x ${r.h}`}
                  className={`${chip(ratioIdx === i)} inline-flex items-center gap-2`}>
                  <RatioGlyph w={r.w} h={r.h} />
                  <span className="hidden sm:inline">{r.label}</span>
                </button>
              ))}
              <span className="w-px h-5 bg-white/10 mx-1 hidden sm:block" aria-hidden="true" />
              <button onClick={toggleNsfw} aria-pressed={nsfw}
                title="Allow adult content. Sexual content involving minors is never generated."
                className={`cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-2 ${
                  nsfw ? 'bg-red-500/15 text-red-300 border-red-400/40' : 'bg-transparent text-white/60 border-white/15 hover:text-white hover:border-white/35'
                }`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${nsfw ? 'bg-red-400' : 'bg-white/25'}`} aria-hidden="true" />
                18+
              </button>
              <button onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}
                className="cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg text-white/60 hover:text-white transition-colors inline-flex items-center gap-1.5">
                Advanced <IconChevron open={showAdvanced} />
              </button>
            </div>

            {showAdvanced && (
              <div className="mt-3 p-4 md:p-5 rounded-2xl border border-white/10 bg-white/[0.02] grid md:grid-cols-2 gap-x-8 gap-y-5">
                <div className="md:col-span-2">
                  <label className="pixel-sans text-xs text-white/50 block mb-1.5">Negative prompt</label>
                  <input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Things to avoid (optional)"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 pixel-sans text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/25 transition-colors" />
                </div>
                <div>
                  <label className="pixel-sans text-xs text-white/50 flex justify-between mb-1.5">
                    <span>Steps</span><span className="text-white/80 tabular-nums">{steps}</span>
                  </label>
                  <input type="range" min={10} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full" style={{ accentColor: ACCENT }} />
                </div>
                <div>
                  <label className="pixel-sans text-xs text-white/50 flex justify-between mb-1.5">
                    <span>Guidance</span><span className="text-white/80 tabular-nums">{cfg.toFixed(1)}</span>
                  </label>
                  <input type="range" min={1} max={10} step={0.1} value={cfg} onChange={(e) => setCfg(Number(e.target.value))}
                    className="w-full" style={{ accentColor: ACCENT }} />
                </div>
                <div className="md:col-span-2">
                  <label className="pixel-sans text-xs text-white/50 block mb-1.5">Seed</label>
                  <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Blank for random" inputMode="numeric"
                    className="w-full md:w-64 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 pixel-sans text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/25 transition-colors" />
                </div>
              </div>
            )}
          </section>

          {/* Canvas: the frame takes the shape of the selected format, then of the image itself */}
          <section ref={previewRef} className="mb-14">
            <div
              style={canvasShape}
              className={`mx-auto w-full overflow-hidden rounded-2xl border bg-white/[0.02] ${loading ? 'border-white/15' : 'border-white/10'}`}
            >
              {loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8" role="status">
                  <div className="w-48 max-w-full h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: ACCENT }} />
                  </div>
                  <p className="pixel-sans text-white/70 text-xs tabular-nums">
                    {elapsed}s elapsed{elapsed > 45 ? ', taking longer than usual' : ' · typically about 30s'}
                  </p>
                  <p className="pixel-sans text-white/35 text-xs text-center max-w-sm line-clamp-2">{prompt.trim()}</p>
                </div>
              ) : current ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={current.url} alt={current.prompt} className="block w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-8 text-center">
                  <p className="pixel-sans text-white/55 text-sm">Your image will appear here</p>
                  <p className="pixel-sans text-white/30 text-xs">Describe what you want above and press Generate</p>
                </div>
              )}
            </div>

            {current && !loading && (
              <div style={{ maxWidth: canvasShape.maxWidth }} className="mx-auto w-full flex items-center justify-between gap-4 mt-3">
                <span className="pixel-sans text-white/45 text-xs tabular-nums truncate">
                  {current.width && current.height ? `${current.width} x ${current.height}` : ''}
                  {current.seed ? ` · seed ${current.seed}` : ''}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => copyPrompt(current.prompt)}
                    className="cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/35 transition-colors inline-flex items-center gap-1.5">
                    <IconCopy /> {copied ? 'Copied' : 'Copy prompt'}
                  </button>
                  <a href={current.url} download={`c0mpute-${current.seed || 'image'}.png`}
                    className="cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg bg-white text-black hover:bg-white/90 transition-colors inline-flex items-center gap-1.5">
                    <IconDownload /> Download
                  </a>
                </div>
              </div>
            )}
          </section>

          {/* History */}
          {history.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="pixel-serif text-white text-xl">Your images</h2>
                <span className="pixel-sans text-white/35 text-xs tabular-nums">{history.length}</span>
              </div>
              <p className="pixel-sans text-white/40 text-xs mb-4">
                Saved only in this browser, nothing is uploaded. Deleting here removes an image permanently.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {history.map((g) => (
                  <div key={g.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.url} alt={g.prompt} loading="lazy"
                      onClick={() => { setCurrent(g); previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                      className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-[1.03]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="pointer-events-none absolute inset-x-2 bottom-2 pixel-sans text-[10px] leading-snug text-white/80 line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity pr-14">
                      {g.prompt}
                    </p>
                    <button onClick={() => deleteImage(g.id)} aria-label="Delete image"
                      className="cursor-pointer absolute top-2 right-2 w-6 h-6 rounded-lg bg-black/70 text-white/70 hover:text-white hover:bg-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconX />
                    </button>
                    <a href={g.url} download={`c0mpute-${g.seed || g.id}.png`} aria-label="Download image"
                      className="cursor-pointer absolute bottom-2 right-2 w-6 h-6 rounded-lg bg-black/70 text-white/70 hover:text-white hover:bg-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconDownload className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* 18+ gate */}
      {showGate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="max-w-md w-full border border-white/15 bg-black rounded-2xl p-6">
            <h3 className="pixel-serif text-white text-xl mb-3">Adult content (18+)</h3>
            <p className="pixel-sans text-white/70 text-sm mb-2">
              Enabling NSFW allows generation of adult content. By continuing you confirm you are 18 or older and that adult content is legal where you live.
            </p>
            <p className="pixel-sans text-white/70 text-xs mb-5">
              Sexual content involving minors is never generated and is permanently blocked.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowGate(false)} className="cursor-pointer flex-1 pixel-sans text-sm px-4 py-2.5 rounded-xl border border-white/15 text-white/70 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmGate} className="cursor-pointer flex-1 pixel-serif text-sm px-4 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors">I&apos;m 18+, continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
