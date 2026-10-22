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
import { AdultGate } from './AdultGate';
import { IconBell, IconX } from './icons';
import {
  ASPECTS, MAX_ACTIVE, NSFW_ACK_KEY, SUGGESTED_PROMPTS, VIDEO_CREDITS,
  aspectIdFor, downloadName, expectedRenderMs, idbAll, saveDraft, takeDraft, idbDelete, idbPut, progressOf, readPending, recordRenderMs, removePending, updatePending, writePending,
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
  // Nothing is drawn on the canvas until the history has been read, so a
  // returning user never sees the empty state flash first.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // A clip that came back but could not be written to IndexedDB (quota,
  // private mode): offered as a download before it is lost on reload.
  const [unsaved, setUnsaved] = useState<{ url: string; name: string } | null>(null);
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
  const [sheetH, setSheetH] = useState(240);
  // What landed while nobody was looking, for the tab title.
  const [unseen, setUnseen] = useState({ finished: 0, failed: 0 });
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
      // One broken record (no blob, no size) is skipped, never the whole list.
      idbAll()
        .then((recs) => setHistory(recs.flatMap((r) => {
          if (!(r?.blob instanceof Blob) || !(r.width > 0) || !(r.height > 0)) return [];
          try { return [{ ...r, url: URL.createObjectURL(r.blob) }]; } catch { return []; }
        })))
        .catch(() => {})
        .finally(() => setHistoryLoaded(true));
    } else {
      setHistoryLoaded(true);
    }
    const pending = readPending();
    if (pending.length) setJobs(pending.map((p) => ({ ...p, status: p.renderStartedAt ? 'rendering' : 'queued', pct: 0 })));
    try {
      const a = localStorage.getItem(ASPECT_KEY);
      if (ASPECTS.some((x) => x.id === a)) setAspect(a as AspectId);
      setNoticeDismissed(localStorage.getItem(NOTICE_KEY) === '1');
      const supported = typeof Notification !== 'undefined';
      setNotifySupported(supported);
      setNotify(supported && Notification.permission === 'granted' && localStorage.getItem(NOTIFY_KEY) === '1');
    } catch {}
    // A draft saved on the way out to log in comes back as it was.
    const draft = takeDraft();
    if (draft) {
      setPrompt(draft.prompt);
      if (ASPECTS.some((x) => x.id === draft.aspect)) setAspect(draft.aspect);
      if (draft.adult && localStorage.getItem(NSFW_ACK_KEY) === '1') setAdult(true);
      setSeed(draft.seed || '');
    }
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
  // then what landed while the tab was away ("Finished", "1 finished, 1
  // failed") until it is looked at again.
  useEffect(() => {
    if (!baseTitle.current) return;
    const first = active[0];
    const { finished: f, failed: x } = unseen;
    if (first) {
      const pr = progressOf(first, now, expectedMs);
      const dots = '.'.repeat((Math.floor(now / 1000) % 3) + 1);
      document.title = pr.queued ? 'Queued · Studio' : pr.pct === null ? `Finishing${dots}` : `${pr.pct}% · Generating${dots}`;
    } else if (f && x) {
      document.title = `${f} finished, ${x} failed · Studio`;
    } else if (f || x) {
      const n = f || x;
      document.title = `${n > 1 ? `${n} ${f ? 'finished' : 'failed'}` : f ? 'Finished' : 'Failed'} · Studio`;
    } else {
      document.title = baseTitle.current;
    }
  }, [active, now, expectedMs, unseen]);
  useEffect(() => {
    const seen = () => { if (document.visibilityState === 'visible' && document.hasFocus()) setUnseen({ finished: 0, failed: 0 }); };
    window.addEventListener('focus', seen);
    document.addEventListener('visibilitychange', seen);
    return () => { window.removeEventListener('focus', seen); document.removeEventListener('visibilitychange', seen); };
  }, []);
  useEffect(() => () => { if (baseTitle.current) document.title = baseTitle.current; }, []);

  const away = () => document.visibilityState !== 'visible' || !document.hasFocus();

  const submit = async (s: Submission) => {
    setError(null);
    if (!isAuthenticated) { loginKeepingDraft(s); return; }
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

  // Logging in is a full navigation, so what would have been submitted is
  // saved first and restored when the user comes back.
  const loginKeepingDraft = (s?: Submission) => {
    saveDraft(s
      ? { prompt: s.prompt, aspect: aspectIdFor(s.width, s.height), adult: s.adult, seed: s.seedPinned && s.seed ? String(s.seed) : '' }
      : { prompt, aspect, adult, seed });
    login();
  };

  const generate = () => {
    const a = ASPECTS.find((x) => x.id === aspect) ?? ASPECTS[0];
    const pinned = seed.trim() ? Number(seed) : undefined;
    submit({ prompt: prompt.trim(), width: a.w, height: a.h, adult, seed: pinned, seedPinned: pinned !== undefined });
  };

  const onProgress = useCallback((jobId: string, status: 'queued' | 'rendering', pct: number, stage?: VideoStage) => {
    const prev = jobsRef.current.find((j) => j.jobId === jobId);
    // The first poll that says rendering starts the render clock, and it is
    // kept with the pending job so a reload does not count queue time again.
    const renderStartedAt = prev?.renderStartedAt ?? (status === 'rendering' ? Date.now() : undefined);
    if (renderStartedAt && !prev?.renderStartedAt) updatePending(jobId, { renderStartedAt });
    setJobs((js) => js.map((j) => (j.jobId === jobId ? { ...j, status, pct, stage, renderStartedAt, authLost: false } : j)));
  }, []);
  const onAuthLost = useCallback((jobId: string) => {
    setJobs((js) => js.map((j) => (j.jobId === jobId ? { ...j, authLost: true } : j)));
  }, []);

  // The clip is saved to IndexedDB first, so it is kept even if the page is
  // already on its way out.
  const onDone = useCallback((jobId: string, blob: Blob) => {
    const job = jobsRef.current.find((j) => j.jobId === jobId);
    removePending(jobId);
    setJobs((js) => js.filter((j) => j.jobId !== jobId));
    if (!job) return;
    // Render time only; a clip whose start was never seen has no figure.
    const renderMs = job.renderStartedAt ? Date.now() - job.renderStartedAt : undefined;
    const rec: SavedVideo = {
      id: jobId, blob, prompt: job.prompt, seed: job.seed, width: job.width, height: job.height,
      createdAt: Date.now(), adult: job.adult, renderMs,
    };
    const shownUrl = URL.createObjectURL(blob);
    idbPut(rec).catch(() => setUnsaved({ url: shownUrl, name: downloadName(rec) }));
    if (renderMs) recordRenderMs(renderMs);
    setExpectedMs(expectedRenderMs());
    const shown = { ...rec, url: shownUrl };
    setHistory((h) => (h.some((x) => x.id === jobId) ? h : [shown, ...h]));
    if (away()) {
      setUnseen((u) => ({ ...u, finished: u.finished + 1 }));
      if (localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Your clip is ready', { body: job.prompt.slice(0, 120), tag: jobId }); } catch {}
      }
    }
  }, []);

  const onFail = useCallback((jobId: string, message: string) => {
    removePending(jobId);
    setJobs((js) => js.map((j) => (j.jobId === jobId ? { ...j, status: 'failed', error: message } : j)));
    if (away()) setUnseen((u) => ({ ...u, failed: u.failed + 1 }));
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
  const closeGate = useCallback(() => setShowGate(false), []);

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
    const gate = !!c.adult && !adult && localStorage.getItem(NSFW_ACK_KEY) !== '1';
    if (!!c.adult !== adult) toggleAdult();
    setViewerId(null);
    // the 18+ gate, if it opens, keeps the focus
    if (!gate) requestAnimationFrame(() => document.getElementById('st-prompt')?.focus());
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

  const isEmpty = historyLoaded && !history.length && !jobs.length;
  const shape = ASPECTS.find((x) => x.id === aspect) ?? ASPECTS[0];

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
          grantLeft={grantLeft}
          onSheetHeight={setSheetH}
          expectedMs={expectedMs}
          error={error}
        />

        {/* on small screens the bottom padding is the collapsed sheet's measured height, so the last row is never under it */}
        <main style={{ ['--st-sheet' as string]: `${Math.round(sheetH)}px` }}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--st-sheet)+24px)] pt-5 [--st-job:220px] [--st-row:132px] sm:px-6 sm:[--st-row:170px] lg:px-8 lg:pb-10 lg:pt-7 lg:[--st-job:290px] lg:[--st-row:220px]">
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

          {unsaved && (
            <div role="alert" className="pixel-sans mb-5 flex flex-wrap items-center justify-between gap-3 border border-danger/30 px-3.5 py-2.5 text-[13px] text-fg-80">
              <span>Couldn&apos;t save this clip in your browser. Download it now or it is gone after a reload.</span>
              <span className="flex shrink-0 items-center gap-3">
                <a href={unsaved.url} download={unsaved.name} className="bg-fg px-3 py-1 text-[12px] text-on-fg hover:opacity-90">Download</a>
                <button type="button" aria-label="Dismiss" onClick={() => setUnsaved(null)} className="cursor-pointer p-1 text-fg-40 hover:text-fg"><IconX size={12} /></button>
              </span>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="st-rows mb-2">
              {jobs.map((j) => (
                <JobCard key={j.jobId} job={j} now={now} expectedMs={expectedMs} onRetry={() => retry(j)} onDismiss={() => dismiss(j.jobId)} onLogin={() => loginKeepingDraft()} />
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
                  <span>5 seconds</span><span>{shape.w} x {shape.h}</span><span>32 fps</span><span>~{Math.max(0.5, Math.round((expectedMs / 60_000) * 2) / 2)} min</span><span>{VIDEO_CREDITS} credits</span>
                </div>
                <div className="mt-8 grid gap-2 text-left sm:grid-cols-2">
                  {SUGGESTED_PROMPTS.map((s) => (
                    <button key={s.label} type="button" onClick={() => { setPrompt(s.prompt); document.getElementById('st-prompt')?.focus(); }}
                      className="pixel-sans cursor-pointer border border-fg/12 px-3.5 py-3 text-[13px] leading-snug text-fg-70 transition-colors hover:border-fg/40 hover:text-fg">
                      {s.prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : historyLoaded ? (
            <Gallery clips={history} playingId={playingId} onPlay={setPlayingId} onOpen={openViewer} />
          ) : null}
        </main>
      </div>
      </div>

      {active.map((j) => (
        <JobRunner key={j.jobId} job={j} getAccessToken={getAccessToken} onProgress={onProgress} onDone={onDone} onFail={onFail} onAuthLost={onAuthLost} />
      ))}

      {viewerIndex >= 0 && (
        <Viewer clips={history} index={viewerIndex} onIndex={(i) => setViewerId(history[i]?.id ?? null)} onClose={closeViewer}
          onReuse={reuse} onRegenerate={regenerate} onDelete={remove} />
      )}

      {showGate && <AdultGate onCancel={closeGate} onConfirm={confirmGate} />}
    </div>
  );
}
