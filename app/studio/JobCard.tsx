'use client';

import { useEffect, useRef } from 'react';
import type { VideoStage } from '@/lib/orchestrator/types';
import { POLL_MS, PENDING_MAX_MS, fmtClock, fmtRemaining, progressOf, type JobState } from './lib';

// A render in progress, or one that failed, at the top of the canvas. Same
// shape as the clip it will become.
export function JobCard({ job, now, expectedMs, onRetry, onDismiss }: {
  job: JobState;
  now: number;
  expectedMs: number;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const ar = job.width / job.height;
  const failed = job.status === 'failed';
  const pr = progressOf(job, now, expectedMs);

  return (
    <div style={{ flex: `${ar} 1 calc(${ar} * var(--st-job))` }} className="relative min-w-0">
      <div style={{ aspectRatio: `${job.width} / ${job.height}` }}
        className={`relative overflow-hidden border ${failed ? 'border-danger/40' : 'border-fg/15'} bg-background`}
        role="status" aria-label={failed ? 'Render failed' : `Rendering, ${pr.pct ?? 'finishing'}`}>
        {!failed && <div className="st-shimmer" aria-hidden="true" />}
        <div className="absolute inset-0 flex flex-col justify-between gap-2 p-3.5 sm:p-4">
          {failed ? (
            <>
              <div>
                <p className="st-eyebrow !text-danger">Failed</p>
                <p className="pixel-sans mt-2 line-clamp-4 text-[13px] leading-snug text-fg-80">{job.error || 'Video generation failed.'}</p>
              </div>
              <div>
                <p className="pixel-sans mb-3 line-clamp-2 text-[12px] leading-snug text-fg-45">{job.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onRetry} className="pixel-sans cursor-pointer bg-fg px-3 py-1.5 text-[12px] text-on-fg hover:opacity-90">Try again</button>
                  <button type="button" onClick={onDismiss} className="pixel-sans cursor-pointer border border-fg/20 px-3 py-1.5 text-[12px] text-fg-70 hover:border-fg/45 hover:text-fg">Dismiss</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="st-eyebrow">{pr.queued ? 'Waiting for a GPU' : pr.pct === null ? 'Almost done' : pr.label}</p>
                {job.adult && <span className="pixel-sans border border-fg/25 px-1.5 text-[10px] leading-4 text-fg-60">18+</span>}
              </div>
              <div className="min-w-0">
                {/* the big figure is the percentage while there is an honest one, else the stage */}
                <p className="pixel-serif text-[28px] tabular-nums leading-none text-fg sm:text-[34px]">
                  {pr.queued ? 'Queued' : pr.pct === null ? 'Finishing' : `${pr.pct}%`}
                </p>
                <p className="pixel-sans mt-2.5 line-clamp-2 text-[12px] leading-snug text-fg-55">{job.prompt}</p>
              </div>
              <div>
                <div className="h-[2px] w-full bg-fg/10">
                  <div className="h-full bg-fg transition-[width] duration-1000 ease-linear" style={{ width: `${pr.barPct}%` }} />
                </div>
                <p className="pixel-sans mt-2 text-[11px] tabular-nums leading-snug text-fg-50">
                  {pr.queued
                    ? `${fmtClock(pr.elapsed)} in the queue`
                    : `${fmtClock(pr.elapsed)}${pr.slow ? ' · taking longer than usual' : pr.pct !== null ? ` · ${fmtRemaining(pr.remaining)}` : ''}`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Polls one render until it lands. Sequential (the next poll waits for this
// one), because the final answer is the whole MP4. A download that dies
// mid-body (res.blob() throws) lands in the catch and simply polls again: the
// server keeps the clip for an hour after it finishes.
export function JobRunner({ job, getAccessToken, onProgress, onDone, onFail }: {
  job: JobState;
  getAccessToken: () => Promise<string | null>;
  onProgress: (jobId: string, status: 'queued' | 'rendering', pct: number, stage?: VideoStage) => void;
  onDone: (jobId: string, blob: Blob) => void;
  onFail: (jobId: string, error: string) => void;
}) {
  // Handlers change every render; the poll loop must not restart for that.
  const handlers = useRef({ getAccessToken, onProgress, onDone, onFail });
  useEffect(() => { handlers.current = { getAccessToken, onProgress, onDone, onFail }; });

  const { jobId, startedAt } = job;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const h = handlers.current;
      if (Date.now() - startedAt > PENDING_MAX_MS) { h.onFail(jobId, 'This render is no longer available.'); return; }
      try {
        // A token call that fails or hangs (auth still starting, a stuck
        // refresh) must not stall the poll: it polls as logged out (401) and
        // tries again on the next round.
        const token = await Promise.race([
          Promise.resolve().then(() => h.getAccessToken()).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ]);
        const res = await fetch(`/api/videos/${jobId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (res.ok && res.headers.get('content-type')?.startsWith('video/')) {
          const blob = await res.blob();
          handlers.current.onDone(jobId, blob);
          return;
        }
        const data = await res.json();
        if (data.status === 'failed' || data.status === 'gone') { handlers.current.onFail(jobId, data.error || 'Video generation failed.'); return; }
        if (!stopped && (data.status === 'queued' || data.status === 'rendering')) {
          handlers.current.onProgress(jobId, data.status, Number(data.pct) || 0, data.stage);
        }
        // Anything else (the network briefly unreachable, a token refresh) just polls again.
      } catch {}
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId, startedAt]);

  return null;
}
