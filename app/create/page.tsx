'use client';

import SiteNav from '@/components/SiteNav';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface ResultImage {
  url: string; // inline data URL, never stored server-side
  prompt: string;
  width: number | null;
  height: number | null;
  seed?: number;
}

const IMAGE_CREDITS = 20; // keep in sync with lib/image-gen IMAGE_CREDITS
const NSFW_ACK_KEY = 'c0mpute_nsfw_ack';
const ACCENT = 'var(--steel)';

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
  return { aspectRatio: `${w || 1024} / ${h || 1024}`, maxHeight: '100%', maxWidth: '100%' };
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
      active ? 'bg-fg text-on-fg border-fg' : 'bg-transparent text-fg-60 border-fg/15 hover:text-fg hover:border-fg/35'
    }`;

  return (
    <div className="ui-readable flex h-dvh flex-col overflow-hidden bg-background">
      <SiteNav />

      {/* the nav is fixed, so the studio starts below it */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-[70px] md:pt-[88px] md:flex-row md:gap-4 md:px-6 md:pb-6">
        {/* Everything you have made, beside the canvas rather than below it. */}
        {history.length > 0 && (
          <aside className="flex shrink-0 gap-2 overflow-x-auto pb-1 md:w-[88px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pb-0">
            {history.map((g) => (
              <div key={g.id} className="group relative aspect-square h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-fg/10 md:h-auto md:w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt={g.prompt} loading="lazy" onClick={() => setCurrent(g)}
                  className={`h-full w-full cursor-pointer object-cover transition-opacity ${current?.url === g.url ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`} />
                {/* the veil never inverts — it sits on a generated image, which
                    has no theme — so the glyph on it stays white in both */}
                <button onClick={() => deleteImage(g.id)} aria-label="Delete image"
                  className="absolute right-1 top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-md bg-img-veil text-white/70 opacity-0 transition-opacity hover:bg-img-veil-hi hover:text-white group-hover:opacity-100">
                  <IconX />
                </button>
              </div>
            ))}
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* The canvas takes whatever room is left, so the image is always in
              front of you and the page never scrolls to reach it. */}
          <section className="grid min-h-0 flex-1 place-items-center">
            <div style={canvasShape}
              className={`overflow-hidden rounded-2xl border bg-fg/[0.02] ${loading ? 'border-fg/15' : 'border-fg/10'}`}>
              {loading ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8" role="status">
                  <div className="h-1 w-48 max-w-full overflow-hidden rounded-full bg-fg/10">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: ACCENT }} />
                  </div>
                  <p className="pixel-sans text-xs tabular-nums text-fg-70">
                    {elapsed}s elapsed{elapsed > 45 ? ', taking longer than usual' : ' · typically about 30s'}
                  </p>
                  <p className="pixel-sans line-clamp-2 max-w-sm text-center text-xs text-fg-35">{prompt.trim()}</p>
                </div>
              ) : current ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={current.url} alt={current.prompt} className="block h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-8 text-center">
                  <p className="pixel-sans text-sm text-fg-55">Your image appears here</p>
                  <p className="pixel-sans text-xs text-fg-30">Describe it below and press Generate</p>
                </div>
              )}
            </div>
          </section>

          {current && !loading && (
            <div className="mt-3 flex shrink-0 items-center justify-between gap-4">
              <span className="pixel-sans truncate text-xs tabular-nums text-fg-45">
                {current.width && current.height ? `${current.width} x ${current.height}` : ''}
                {current.seed ? ` · seed ${current.seed}` : ''}
              </span>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button onClick={() => copyPrompt(current.prompt)}
                  className="pixel-sans inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg-70 transition-colors hover:border-fg/35 hover:text-fg">
                  <IconCopy /> {copied ? 'Copied' : 'Copy prompt'}
                </button>
                <a href={current.url} download={`compute-${current.seed || 'image'}.png`}
                  className="pixel-sans inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-xs text-on-fg transition-colors hover:bg-fg/90">
                  <IconDownload /> Download
                </a>
              </div>
            </div>
          )}

          {/* Notices sit with the controls, not above the picture. */}
          {isAuthenticated && lowBalance && (
            <div className="pixel-sans mt-3 shrink-0 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-2.5 text-xs text-amber-300/90">
              You have {balance?.toLocaleString()} credits and an image costs {IMAGE_CREDITS}.{' '}
              <button onClick={() => router.push('/settings')} className="cursor-pointer underline hover:text-amber-200">Top up in settings</button>
            </div>
          )}
          {error && (
            <div role="alert" className="pixel-sans mt-3 shrink-0 rounded-xl border border-danger/20 bg-danger/[0.05] px-4 py-2.5 text-xs text-danger-soft/90">{error}</div>
          )}

          {showAdvanced && (
            <div className="mt-3 grid shrink-0 gap-x-8 gap-y-4 rounded-2xl border border-fg/10 bg-fg/[0.02] p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="pixel-sans mb-1.5 block text-xs text-fg-50">Negative prompt</label>
                <input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Things to avoid (optional)"
                  className="pixel-sans w-full rounded-lg border border-fg/10 bg-fg/[0.03] px-3 py-2 text-sm text-fg placeholder-fg-40 transition-colors focus:border-field-focus focus:outline-none" />
              </div>
              <div>
                <label className="pixel-sans mb-1.5 flex justify-between text-xs text-fg-50"><span>Steps</span><span className="tabular-nums text-fg-80">{steps}</span></label>
                <input type="range" min={10} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full" style={{ accentColor: ACCENT }} />
              </div>
              <div>
                <label className="pixel-sans mb-1.5 flex justify-between text-xs text-fg-50"><span>Guidance</span><span className="tabular-nums text-fg-80">{cfg.toFixed(1)}</span></label>
                <input type="range" min={1} max={10} step={0.1} value={cfg} onChange={(e) => setCfg(Number(e.target.value))} className="w-full" style={{ accentColor: ACCENT }} />
              </div>
              <div className="md:col-span-2">
                <label className="pixel-sans mb-1.5 block text-xs text-fg-50">Seed</label>
                <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Blank for random" inputMode="numeric"
                  className="pixel-sans w-full rounded-lg border border-fg/10 bg-fg/[0.03] px-3 py-2 text-sm text-fg placeholder-fg-40 transition-colors focus:border-field-focus focus:outline-none md:w-64" />
              </div>
            </div>
          )}

          {/* The controls, pinned under the canvas. */}
          <section className="mt-3 shrink-0 rounded-2xl border border-fg/10 bg-fg/[0.02] p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {STYLES.map((s, i) => (
                <button key={s.label} onClick={() => setStyleIdx(i)} aria-pressed={styleIdx === i} className={chip(styleIdx === i)}>{s.label}</button>
              ))}
              <span className="mx-1 hidden h-5 w-px bg-fg/10 sm:block" aria-hidden="true" />
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
              <button onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}
                className="pixel-sans inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-fg-60 transition-colors hover:text-fg">
                Advanced <IconChevron open={showAdvanced} />
              </button>
            </div>

            <div className="flex items-end gap-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } }}
                placeholder="Describe the image you want"
                rows={2}
                className="pixel-sans min-w-0 flex-1 resize-none bg-transparent text-[15px] text-fg placeholder-fg-40 focus:outline-none"
              />
              <button
                onClick={generate}
                disabled={loading || !prompt.trim() || (isAuthenticated && lowBalance)}
                className="pixel-serif shrink-0 cursor-pointer rounded-xl bg-fg px-6 py-2.5 text-sm text-on-fg transition-colors hover:bg-fg/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? `Generating ${elapsed}s` : !isAuthenticated ? 'Log in to generate' : lowBalance ? 'Not enough credits' : hasFree ? `Generate free (${freeImages} left)` : 'Generate'}
              </button>
            </div>

            <div className="pixel-sans mt-2 text-xs">
              {isAuthenticated && hasFree
                ? <span className="text-[var(--live-text)]">{freeImages} free image{(freeImages ?? 0) > 1 ? 's' : ''} left, on us</span>
                : <span className="text-fg-45">{IMAGE_CREDITS} credits ($0.20) per image</span>}
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
              Enabling NSFW allows generation of adult content. By continuing you confirm you are 18 or older and that adult content is legal where you live.
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
