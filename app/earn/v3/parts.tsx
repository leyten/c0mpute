'use client';

// Pieces of the membership page. Every value here is handed in by the page,
// which reads it from useWorkerEngine.
import type { NetworkStats } from '@/lib/orchestrator/types';
import type { SessionJob } from '../engine/useWorkerEngine';

export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
export const fmtSecs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** Time served, in words. */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Fixed 24h clock. Assembled from date parts so the server and the browser
 *  always produce the same string. */
export function fmtClock(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="m3-eyebrow">{children}</div>;
}

export function LiveDot({ tone, pulse }: { tone: string; pulse?: boolean }) {
  return <span className={`m3-live-dot ${pulse ? 'm3-pulse' : ''}`} style={{ color: tone }} />;
}

/** One labelled fact. Values stay on one line; hints wrap under them. */
export function Fact({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="m3-eyebrow">{label}</div>
      <div className="mt-2 text-[14.5px] leading-snug break-words" style={{ color: 'var(--m3-text)' }}>{value}</div>
      {hint ? <div className="m3-note mt-1 break-words">{hint}</div> : null}
    </div>
  );
}

export type RosterKind = 'mine' | 'browser' | 'native';

/** The machines serving, as counts the orchestrator reports. There is no
 *  roster of other workers on the wire, so a dot carries exactly two facts:
 *  it exists, and it is or is not this account's. The caller passes how many
 *  of its own machines sit in each bucket so they are marked rather than
 *  counted twice. */
export function buildRoster(stats: NetworkStats | null, mineInBrowser: number, mineInNative: number): RosterKind[] {
  const browser = Math.max(0, (stats?.browserWorkers ?? 0) - mineInBrowser);
  const native = Math.max(0, (stats?.nativeWorkers ?? 0) - mineInNative);
  const dots: RosterKind[] = [];
  for (let i = 0; i < mineInBrowser + mineInNative; i++) dots.push('mine');
  for (let i = 0; i < browser; i++) dots.push('browser');
  for (let i = 0; i < native; i++) dots.push('native');
  return dots;
}

const MAX_DOTS = 96;

export function Roster({ dots, mine }: { dots: RosterKind[]; mine: number }) {
  const shown = dots.slice(0, MAX_DOTS);
  const rest = dots.length - shown.length;

  const caption = dots.length === 0
    ? 'No machines are serving right now.'
    : mine >= 1
      ? dots.length === 1
        ? 'This machine is the only one serving right now.'
        : mine === 1
          ? `You are one of ${dots.length} machines serving right now.`
          : `${mine} of the ${dots.length} machines serving right now are yours.`
      : dots.length === 1
        ? 'One machine is serving right now. This machine is not among them.'
        : `${dots.length} machines are serving right now. This machine is not among them.`;

  return (
    <div>
      <div className="m3-roster" data-testid="v3-roster">
        {shown.length === 0
          ? <span className="m3-dot m3-dot--empty" />
          : shown.map((kind, i) => <span key={i} className={`m3-dot m3-dot--${kind}`} />)}
        {rest > 0 ? <span className="m3-note ml-1">+{fmtInt(rest)}</span> : null}
      </div>
      <p className="mt-5 text-[14.5px] leading-relaxed" style={{ color: 'var(--m3-text)' }} data-testid="v3-roster-caption">
        {caption}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 m3-note">
        {mine >= 1 ? (
          <span className="inline-flex items-center gap-2">
            <span className="m3-dot m3-dot--mine" />{mine > 1 ? 'Your machines' : 'This machine'}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2"><span className="m3-dot m3-dot--browser" />Browser workers</span>
        <span className="inline-flex items-center gap-2"><span className="m3-dot m3-dot--native" />Native workers</span>
      </div>
    </div>
  );
}

export function Progress({ value, text }: { value: number; text: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div data-testid="v3-progress">
      <div className="flex items-baseline justify-between gap-4">
        <span className="m3-note truncate" style={{ color: 'var(--m3-dim)' }}>{text}</span>
        <span className="m3-note m3-mono shrink-0" style={{ color: 'var(--m3-steel)' }}>{pct}%</span>
      </div>
      <div className="m3-bar mt-2.5"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Jobs this machine served this session, newest first. */
export function Register({ jobs, empty, limit = 8 }: { jobs: SessionJob[]; empty: string; limit?: number }) {
  if (jobs.length === 0) {
    return <p className="m3-note" data-testid="v3-register-empty">{empty}</p>;
  }
  const shown = jobs.slice(0, limit);
  return (
    <div data-testid="v3-register">
      {shown.map(job => (
        <div key={job.id} className="m3-row m3-fade">
          <span className="m3-mono" style={{ color: 'var(--m3-faint)' }}>{fmtClock(job.at)}</span>
          <span className="m3-mono truncate" style={{ color: job.status === 'failed' ? 'var(--m3-warn)' : 'var(--m3-dim)' }}>
            {job.id.slice(0, 8)}
          </span>
          <span className="m3-mono whitespace-nowrap" style={{ color: 'var(--m3-text)' }}>
            {job.status === 'failed' ? 'failed' : `${fmtInt(job.tokens)} tok`}
            <span style={{ color: 'var(--m3-faint)' }}> · {fmtSecs(job.ms)}</span>
          </span>
        </div>
      ))}
      {jobs.length > shown.length ? (
        <p className="m3-note mt-3">{fmtInt(jobs.length)} jobs served this session.</p>
      ) : null}
    </div>
  );
}
