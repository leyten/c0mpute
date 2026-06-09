'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface ResultImage {
  url: string; // inline data URL — never stored server-side
  prompt: string;
  width: number | null;
  height: number | null;
  seed?: number;
}

const IMAGE_CREDITS = 20; // keep in sync with lib/image-gen IMAGE_CREDITS
const NSFW_ACK_KEY = 'c0mpute_nsfw_ack';

// Style presets: `pos` is appended to the prompt, `neg` to the negative prompt
// (on top of the server-side baseline anti-slop negative). Written in real-photo
// language — stacking "professional photography, sharp focus, high detail" is
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

// Client-side image history. Kept in IndexedDB (not localStorage — full PNGs blow
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

export default function CreatePage() {
  const router = useRouter();
  const { isAuthenticated, login, getAccessToken } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [styleIdx, setStyleIdx] = useState(1); // default to "Photo" — "None" hands users the raw model (CGI look)
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

  const generate = async () => {
    setError(null);
    if (!prompt.trim()) return;
    if (!isAuthenticated) { login(); return; }

    setLoading(true);
    setCurrent(null);
    setElapsed(0);
    // Bring the preview pane into view (matters on mobile, where it's below the form).
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

  return (
    <div className="ui-readable min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
              C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
            </a>
            <div className="flex items-center gap-4">
              {balance !== null && (
                <span className="pixel-sans text-xs text-white/70 hidden sm:inline">{balance.toLocaleString()} credits</span>
              )}
              <button onClick={() => router.push('/settings')} className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">Settings</button>
              <button onClick={() => router.push('/')} className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">← Back</button>
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="pixel-serif text-white text-3xl md:text-4xl mb-2">Create</h1>
          <p className="pixel-sans text-white/70 text-sm mb-2">
            Image generation on the c0mpute network. {IMAGE_CREDITS} credits ($0.20) per image.
          </p>
          {isAuthenticated && freeImages !== null && freeImages > 0 && (
            <p className="pixel-sans text-emerald-300/90 text-sm mb-2">
              {freeImages} free image{freeImages > 1 ? 's' : ''} left — on us.
            </p>
          )}
          <p className="pixel-sans text-white/70 text-xs mb-8">
            Fully private — your images are returned to you and never stored. Download what you want to keep.
          </p>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
          <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
              placeholder="Describe the image you want…"
              rows={3}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 pixel-sans text-white placeholder-white/55 focus:outline-none focus:border-white/25 transition-colors resize-none mb-4"
            />

            {/* Style presets */}
            <label className="pixel-sans text-xs text-white/70 font-semibold block mb-2">Style</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {STYLES.map((s, i) => (
                <button key={s.label} onClick={() => setStyleIdx(i)}
                  className={`pixel-sans text-xs px-3 py-1.5 rounded-lg border transition-colors ${styleIdx === i ? 'bg-white text-black border-white' : 'bg-white/[0.06] text-white/85 border-white/20 hover:border-white/40'}`}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Aspect ratio */}
            <label className="pixel-sans text-xs text-white/70 font-semibold block mb-2">Aspect ratio</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {RATIOS.map((r, i) => (
                <button key={r.label} onClick={() => setRatioIdx(i)}
                  className={`pixel-sans text-xs px-3 py-1.5 rounded-lg border transition-colors ${ratioIdx === i ? 'bg-white text-black border-white' : 'bg-white/[0.06] text-white/85 border-white/20 hover:border-white/40'}`}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* NSFW toggle */}
            <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/10">
              <div>
                <p className="pixel-sans text-sm text-white">NSFW <span className="text-white/70">(18+)</span></p>
                <p className="pixel-sans text-xs text-white/70">Allow adult content. Sexual content involving minors is never generated.</p>
              </div>
              <button onClick={toggleNsfw} aria-pressed={nsfw}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${nsfw ? 'bg-red-500/80' : 'bg-white/15'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${nsfw ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {/* Advanced */}
            <button onClick={() => setShowAdvanced((v) => !v)} className="pixel-sans text-xs text-white/70 hover:text-white/80 transition-colors mb-2">
              {showAdvanced ? '− Advanced' : '+ Advanced'}
            </button>
            {showAdvanced && (
              <div className="space-y-4 mb-4 p-4 rounded-xl bg-white/[0.02] border border-white/10">
                <input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Negative prompt (optional)"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-2.5 pixel-sans text-sm text-white placeholder-white/55 focus:outline-none focus:border-white/25" />
                <div>
                  <label className="pixel-sans text-xs text-white/70 flex justify-between mb-1"><span>Steps</span><span>{steps}</span></label>
                  <input type="range" min={10} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full accent-white" />
                </div>
                <div>
                  <label className="pixel-sans text-xs text-white/70 flex justify-between mb-1"><span>Guidance</span><span>{cfg.toFixed(1)}</span></label>
                  <input type="range" min={1} max={10} step={0.1} value={cfg} onChange={(e) => setCfg(Number(e.target.value))} className="w-full accent-white" />
                </div>
                <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Seed (blank = random)" inputMode="numeric"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-2.5 pixel-sans text-sm text-white placeholder-white/55 focus:outline-none focus:border-white/25" />
              </div>
            )}

            <button
              onClick={generate}
              disabled={loading || !prompt.trim() || (isAuthenticated && lowBalance)}
              className="w-full pixel-serif text-sm px-6 py-3 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? `Generating… ${elapsed}s` : !isAuthenticated ? 'Log in to generate' : lowBalance ? 'Not enough credits' : hasFree ? `Generate · free (${freeImages} left)` : `Generate · ${IMAGE_CREDITS} credits`}
            </button>

            {isAuthenticated && lowBalance && (
              <p className="pixel-sans text-amber-400/90 text-xs mt-3">
                You have {balance?.toLocaleString()} credits. <button onClick={() => router.push('/settings')} className="underline hover:text-amber-300">Top up →</button>
              </p>
            )}
            {error && <p className="pixel-sans text-red-400/90 text-sm mt-3">{error}</p>}
          </section>

          {/* Preview pane — always visible (sticky on desktop) so the result
              never hides below the form. */}
          <div ref={previewRef} className="lg:sticky lg:top-28">
            <div className="aspect-square w-full rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden flex items-center justify-center">
              {loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
                  <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <div className="w-2/3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-white/70 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="pixel-sans text-white/70 text-xs">Generating · {elapsed}s / ~30s</p>
                </div>
              ) : current ? (
                <div className="w-full h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={current.url} alt={current.prompt} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="text-center px-6">
                  <p className="pixel-sans text-white/70 text-sm">Your image appears here</p>
                  <p className="pixel-sans text-white/50 text-xs mt-1">Describe something and hit Generate</p>
                </div>
              )}
            </div>
            {current && !loading && (
              <div className="flex items-center justify-between mt-3">
                <span className="pixel-sans text-white/70 text-xs">{current.seed ? `seed ${current.seed}` : ''}</span>
                <a href={current.url} download={`c0mpute-${current.seed || 'image'}.png`} className="pixel-sans text-xs text-white/70 hover:text-white underline">Download</a>
              </div>
            )}
          </div>
          </div>

          {history.length > 0 && (
            <section className="mt-12">
              <h2 className="pixel-serif text-white text-lg mb-1">Your images</h2>
              <p className="pixel-sans text-white/50 text-xs mb-4">Saved in this browser only — private, never uploaded. Tap to view, × to delete.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {history.map((g) => (
                  <div key={g.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.url} alt={g.prompt} loading="lazy"
                      onClick={() => { setCurrent(g); previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                      className="w-full h-full object-cover cursor-pointer" />
                    <button onClick={() => deleteImage(g.id)} aria-label="Delete"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white/80 hover:text-white hover:bg-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pixel-sans text-sm">×</button>
                    <a href={g.url} download={`c0mpute-${g.seed || g.id}.png`} aria-label="Download"
                      className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/70 text-white/80 hover:text-white text-[10px] pixel-sans opacity-0 group-hover:opacity-100 transition-opacity">save</a>
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
              <button onClick={() => setShowGate(false)} className="flex-1 pixel-sans text-sm px-4 py-2.5 rounded-xl border border-white/15 text-white/70 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmGate} className="flex-1 pixel-serif text-sm px-4 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors">I'm 18+, continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
