'use client';

import SiteNav from '@/components/SiteNav';
import './studio.css';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { VideoStage } from '@/lib/orchestrator/types';
import Composer from './Composer';
import { JobCard, JobRunner } from './JobCard';
import { Gallery } from './Gallery';
import { Viewer } from './Viewer';
import { IconBell, IconX } from './icons';
import {
  ASPECTS, MAX_ACTIVE, NSFW_ACK_KEY, SUGGESTED_PROMPTS, VIDEO_CREDITS,
  aspectIdFor, expectedRenderMs, idbAll, idbDelete, idbPut, progressOf, readPending, recordRenderMs, removePending, writePending,
  type AspectId, type JobState, type PendingJob, type SavedVideo, type ShownVideo,
} from './lib';

const ASPECT_KEY = 'c0mpute_studio_aspect';
const NOTIFY_KEY = 'c0mpute_studio_notify';
const NOTICE_KEY = 'c0mpute_studio_notice_dismissed';

interface Submission { prompt: string; width: number; height: number; adult: boolean; seed?: number; seedPinned?: boolean }

export default function StudioPage() {
  const { isAuthenticated, login, getAccessToken } = useAuth();

  // composer
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<AspectId>('landscape');
  const [adult, setAdult] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [seed, setSeed] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noWorker, setNoWorker] = useState(false);

  // canvas
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [history, setHistory] = useState<ShownVideo[]>([]);
  // The open clip, by id: a render landing while the viewer is open adds a clip
  // at the front, and an index would then point at a different one.
  const [viewerId, setViewerId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [expectedMs, setExpectedMs] = useState(150_000);
  const [notify, setNotify] = useState(false);
  const [notifySupported, setNotifySupported] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [grantLeft, setGrantLeft] = useState(0);
  // What the tab says after a render lands while nobody is looking.
  const [titleNote, setTitleNote] = useState<'Finished' | 'Failed' | null>(null);
  const historyRef = useRef<ShownVideo[]>([]);
  const jobsRef = useRef<JobState[]>([]);
  const baseTitle = useRef('');

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
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  // Everything this browser remembers: clips, renders in flight, preferences.
  useEffect(() => {
    if (typeof indexedDB !== 'undefined') {
      idbAll().then((recs) => setHistory(recs.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) })))).catch(() => {});
    }
    const pending = readPending();
    if (pending.length) setJobs(pending.map((p) => ({ ...p, status: 'queued', pct: 0 })));
    try {
      const a = localStorage.getItem(ASPECT_KEY);
      if (ASPECTS.some((x) => x.id === a)) setAspect(a as AspectId);
      setNoticeDismissed(localStorage.getItem(NOTICE_KEY) === '1');
      const supported = typeof Notification !== 'undefined';
      setNotifySupported(supported);
      setNotify(supported && Notification.permission === 'granted' && localStorage.getItem(NOTIFY_KEY) === '1');
    } catch {}
    setExpectedMs(expectedRenderMs());
    setNow(Date.now());
    baseTitle.current = document.title;
    return () => { for (const v of historyRef.current) URL.revokeObjectURL(v.url); };
  }, []);

  const active = jobs.filter((j) => j.status !== 'failed');

  // One clock for every card's elapsed time, and the tab title's dots.
  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active.length]);

  // The tab says what is happening: "42% · Generating..." while a render
  // runs (background tabs tick about once a second, so the dots are discrete),
  // then "Finished" or "Failed" until the tab is looked at again.
  useEffect(() => {
    if (!baseTitle.current) return;
    const first = active[0];
    if (first) {
      const pr = progressOf(first, now, expectedMs);
      const dots = '.'.repeat((Math.floor(now / 1000) % 3) + 1);
      document.title = first.status === 'queued' ? `Queued · Studio` : `${pr.pct === null ? 'Finishing' : `${pr.pct}%`} · Generating${dots}`;
    } else {
      document.title = titleNote ? `${titleNote} · Studio` : baseTitle.current;
    }
  }, [active, now, expectedMs, titleNote]);
  useEffect(() => {
    const seen = () => { if (document.visibilityState === 'visible' && document.hasFocus()) setTitleNote(null); };
    window.addEventListener('focus', seen);
    document.addEventListener('visibilitychange', seen);
    return () => { window.removeEventListener('focus', seen); document.removeEventListener('visibilitychange', seen); };
  }, []);
  useEffect(() => () => { if (baseTitle.current) document.title = baseTitle.current; }, []);

  const away = () => document.visibilityState !== 'visible' || !document.hasFocus();

  const submit = async (s: Submission) => {
    setError(null);
    if (!isAuthenticated) { login(); return; }
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Please log in first.'); return; }
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: s.prompt, width: s.width, height: s.height, adult: s.adult, seed: s.seed }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NO_VIDEO_WORKER') {
          setNoWorker(true);
          setTimeout(() => setNoWorker(false), 30_000);
        }
        setError(data.error || 'Generation failed.');
        loadBalance();
        return;
      }
      const pending: PendingJob = {
        jobId: data.jobId, prompt: s.prompt, seed: data.seed, seedPinned: s.seedPinned,
        width: data.width, height: data.height, adult: s.adult, startedAt: Date.now(),
      };
      writePending([...readPending(), pending]);
      setNow(Date.now());
      setJobs((js) => [{ ...pending, status: 'queued', pct: 0 }, ...js]);
      loadBalance();
    } catch {
      setError('Generation failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const generate = () => {
    const a = ASPECTS.find((x) => x.id === aspect) ?? ASPECTS[0];
    const pinned = seed.trim() ? Number(seed) : undefined;
    submit({ prompt: prompt.trim(), width: a.w, height: a.h, adult, seed: pinned, seedPinned: pinned !== undefined });
  };

  const onProgress = useCallback((jobId: string, status: 'queued' | 'rendering', pct: number, stage?: VideoStage) => {
    setJobs((js) => js.map((j) => (j.jobId === jobId ? { ...j, status, pct, stage } : j)));
  }, []);

  // The clip is saved to IndexedDB first, so it is kept even if the page is
  // already on its way out.
  const onDone = useCallback((jobId: string, blob: Blob) => {
    const job = jobsRef.current.find((j) => j.jobId === jobId);
    removePending(jobId);
    setJobs((js) => js.filter((j) => j.jobId !== jobId));
    if (!job) return;
    const renderMs = Date.now() - job.startedAt;
    const rec: SavedVideo = {
      id: jobId, blob, prompt: job.prompt, seed: job.seed, width: job.width, height: job.height,
      createdAt: Date.now(), adult: job.adult, renderMs,
    };
    idbPut(rec).catch(() => {});
    recordRenderMs(renderMs);
    setExpectedMs(expectedRenderMs());
    const shown = { ...rec, url: URL.createObjectURL(blob) };
    setHistory((h) => (h.some((x) => x.id === jobId) ? h : [shown, ...h]));
    if (away()) {
      setTitleNote('Finished');
      if (localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Your clip is ready', { body: job.prompt.slice(0, 120), tag: jobId }); } catch {}
      }
    }
  }, []);

  const onFail = useCallback((jobId: string, message: string) => {
    removePending(jobId);
    setJobs((js) => js.map((j) => (j.jobId === jobId ? { ...j, status: 'failed', error: message } : j)));
    if (away()) setTitleNote('Failed');
    loadBalance();
  }, [loadBalance]);

  const dismiss = (jobId: string) => setJobs((js) => js.filter((j) => j.jobId !== jobId));
  const retry = (job: JobState) => {
    dismiss(job.jobId);
    submit({ prompt: job.prompt, width: job.width, height: job.height, adult: !!job.adult, seed: job.seedPinned ? job.seed : undefined, seedPinned: job.seedPinned });
  };

  const toggleAdult = () => {
    if (adult) { setAdult(false); return; }
    if (localStorage.getItem(NSFW_ACK_KEY) === '1') { setAdult(true); return; }
    setShowGate(true);
  };
  const confirmGate = () => {
    localStorage.setItem(NSFW_ACK_KEY, '1');
    setAdult(true);
    setShowGate(false);
  };

  const chooseAspect = (a: AspectId) => {
    setAspect(a);
    try { localStorage.setItem(ASPECT_KEY, a); } catch {}
  };

  const toggleNotify = async () => {
    if (notify) { setNotify(false); localStorage.setItem(NOTIFY_KEY, '0'); return; }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => 'denied' as const);
    const on = perm === 'granted';
    setNotify(on);
    localStorage.setItem(NOTIFY_KEY, on ? '1' : '0');
  };

  const reuse = (c: ShownVideo) => {
    setPrompt(c.prompt);
    chooseAspect(aspectIdFor(c.width, c.height));
    if (!!c.adult !== adult) toggleAdult();
    setViewerId(null);
    requestAnimationFrame(() => document.getElementById('st-prompt')?.focus());
  };
  const regenerate = (c: ShownVideo) => {
    closeViewer();
    submit({ prompt: c.prompt, width: c.width, height: c.height, adult: !!c.adult });
  };
  const remove = (c: ShownVideo) => {
    URL.revokeObjectURL(c.url);
    const at = history.findIndex((x) => x.id === c.id);
    const left = history.filter((x) => x.id !== c.id);
    setHistory(left);
    // the viewer moves on to the clip that took its place, or closes
    setViewerId(left.length ? left[Math.min(at, left.length - 1)].id : null);
    idbDelete(c.id).catch(() => {});
  };

  const viewerIndex = viewerId ? history.findIndex((c) => c.id === viewerId) : -1;
  const openViewer = (i: number) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setViewerId(history[i]?.id ?? null);
  };
  // Focus goes back to the tile the viewer was opened from.
  const closeViewer = () => {
    setViewerId(null);
    requestAnimationFrame(() => { if (openerRef.current?.isConnected) openerRef.current.focus(); });
  };

  const lowBalance = balance !== null && balance + grantLeft < VIDEO_CREDITS;
  const blocked = !isAuthenticated
    ? null
    : !prompt.trim()
      ? { reason: 'Write a prompt to start.' }
      : active.length >= MAX_ACTIVE
        ? { reason: '2 renders are already running. Generate opens again when one finishes.' }
        : lowBalance
          ? { reason: `A clip costs ${VIDEO_CREDITS} credits.`, href: '/pricing', cta: 'Get credits' }
          : noWorker
            ? { reason: 'No video GPU is online right now. Try again in a minute.' }
            : null;

  const isEmpty = !history.length && !jobs.length;

  return (
    <div className="studio ui-readable flex h-dvh flex-col overflow-hidden bg-background">
      <SiteNav />

      {/* the nav is fixed, so the studio starts below it */}
      <div className="flex min-h-0 flex-1 flex-col pt-[54px] md:pt-[72px]">
      <div className="flex min-h-0 flex-1 flex-col border-t border-fg/10 lg:flex-row">
        <Composer
          prompt={prompt} onPrompt={setPrompt}
          aspect={aspect} onAspect={chooseAspect}
          adult={adult} onToggleAdult={toggleAdult}
          seed={seed} onSeed={setSeed}
          onGenerate={generate}
          blocked={blocked}
          submitting={submitting}
          activeCount={active.length}
          isAuthenticated={isAuthenticated}
          balance={balance}
          expectedMs={expectedMs}
          error={error}
        />

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-48 pt-5 [--st-job:220px] [--st-row:132px] sm:px-6 sm:[--st-row:170px] lg:px-8 lg:pb-10 lg:pt-7 lg:[--st-job:290px] lg:[--st-row:220px]">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h1 className="pixel-serif text-[26px] text-fg lg:text-[30px]">
              Your clips{history.length > 0 && <span className="ml-2 text-fg-35 tabular-nums">{history.length}</span>}
            </h1>
            {notifySupported && (
              <button type="button" onClick={toggleNotify} aria-pressed={notify}
                className={`pixel-sans flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-[12px] transition-colors ${
                  notify ? 'border-fg bg-fg text-on-fg' : 'border-fg/15 text-fg-60 hover:border-fg/40 hover:text-fg'
                }`}>
                <IconBell size={13} />
                <span className="sm:hidden">{notify ? 'Notifying' : 'Notify me'}</span>
                <span className="hidden sm:inline">{notify ? 'Notifying when done' : 'Notify me when done'}</span>
              </button>
            )}
          </div>

          {!noticeDismissed && (history.length > 0 || jobs.length > 0) && (
            <div className="pixel-sans mb-5 flex items-center justify-between gap-3 border border-fg/12 px-3.5 py-2.5 text-[13px] text-fg-60">
              <span>Clips live only in this browser. Download the ones you want to keep.</span>
              <button type="button" aria-label="Dismiss" onClick={() => { setNoticeDismissed(true); localStorage.setItem(NOTICE_KEY, '1'); }}
                className="shrink-0 cursor-pointer p-1 text-fg-40 hover:text-fg"><IconX size={12} /></button>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="st-rows mb-2">
              {jobs.map((j) => (
                <JobCard key={j.jobId} job={j} now={now} expectedMs={expectedMs} onRetry={() => retry(j)} onDismiss={() => dismiss(j.jobId)} />
              ))}
            </div>
          )}

          {isEmpty ? (
            <div className="grid min-h-[56vh] place-items-center py-8">
              <div className="max-w-[34rem] text-center">
                <p className="st-eyebrow">Studio</p>
                <h2 className="pixel-serif mt-4 text-[36px] text-fg lg:text-[48px]">Describe a scene. Get a five second clip.</h2>
                <p className="pixel-sans mx-auto mt-4 max-w-[28rem] text-[15px] leading-relaxed text-fg-55">
                  Wan 2.2 renders it on a GPU in the network and sends it straight to this browser. It is not stored anywhere else.
                </p>
                <div className="pixel-sans mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] tabular-nums text-fg-45">
                  <span>5 seconds</span><span>1280 x 720</span><span>32 fps</span><span>~{Math.max(0.5, Math.round((expectedMs / 60_000) * 2) / 2)} min</span><span>{VIDEO_CREDITS} credits</span>
                </div>
                <div className="mt-8 grid gap-2 text-left sm:grid-cols-2">
                  {SUGGESTED_PROMPTS.map((s) => (
                    <button key={s.label} type="button" onClick={() => setPrompt(s.prompt)}
                      className="pixel-sans cursor-pointer border border-fg/12 px-3.5 py-3 text-[13px] leading-snug text-fg-70 transition-colors hover:border-fg/40 hover:text-fg">
                      {s.prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Gallery clips={history} playingId={playingId} onPlay={setPlayingId} onOpen={openViewer} />
          )}
        </main>
      </div>
      </div>

      {active.map((j) => (
        <JobRunner key={j.jobId} job={j} getAccessToken={getAccessToken} onProgress={onProgress} onDone={onDone} onFail={onFail} />
      ))}

      {viewerIndex >= 0 && (
        <Viewer clips={history} index={viewerIndex} onIndex={(i) => setViewerId(history[i]?.id ?? null)} onClose={closeViewer}
          onReuse={reuse} onRegenerate={regenerate} onDelete={remove} />
      )}

      {/* 18+ gate, as on /create */}
      {showGate && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm">
          <div className="w-full max-w-md border border-fg/15 bg-background p-6">
            <h3 className="pixel-serif mb-3 text-xl text-fg">Adult content (18+)</h3>
            <p className="pixel-sans mb-2 text-sm text-fg-70">
              Enabling 18+ allows generation of adult content. By continuing you confirm you are 18 or older and that adult content is legal where you live.
            </p>
            <p className="pixel-sans mb-5 text-xs text-fg-70">
              Sexual content involving minors is never generated and is permanently blocked.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowGate(false)} className="pixel-sans flex-1 cursor-pointer border border-fg/15 px-4 py-2.5 text-sm text-fg-70 transition-colors hover:text-fg">Cancel</button>
              <button onClick={confirmGate} className="pixel-serif flex-1 cursor-pointer bg-fg px-4 py-2.5 text-sm text-on-fg transition-colors hover:bg-fg/90">I&apos;m 18+, continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
