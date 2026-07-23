'use client';

// Concept D1 — the receipt DNA, transplanted from C3's Counter into the desk's
// calm. The square/dot map language (emerald = live/served, muted = past,
// hollow = not yet), the one-line receipt under a finished reply, the compact
// in-room lifecycle strip, the library's slim network line, and the quiet
// per-conversation work ledger. Everything here is a whisper: small caps,
// hairlines, steel and emerald used sparingly.

import type { NetworkStats } from '@/lib/orchestrator/types';
import { convoWork, fmtClock, fmtElapsed, ledgerRows, type Convo, type LiveJob, type Provenance } from './store';

type Tone = 'live' | 'done' | 'past' | 'off' | 'fault';

const TONE: Record<Tone, string> = {
  live: 'bg-[rgba(52,211,153,0.95)]',
  done: 'bg-[rgba(52,211,153,0.85)]',
  past: 'bg-white/35',
  off: 'border border-white/25 bg-transparent',
  fault: 'bg-[rgba(248,113,113,0.85)]',
};

// A 2–4px square in the network-map language. Emerald only for live/served.
export function Square({ tone, size = 3, pulse = false }: { tone: Tone; size?: number; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${TONE[tone]} ${pulse ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size }}
    />
  );
}

function Dot() {
  return <span aria-hidden className="text-white/15">·</span>;
}

// ---- the receipt: one quiet line closing a finished reply ----

export function ProvenanceLine({ p }: { p: Provenance }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.06] pt-2 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30">
      <Square tone="done" size={3} />
      <span className="text-white/45">{p.model}</span>
      <Dot />
      <span>{p.costLabel}</span>
      {p.elapsedMs !== null && (
        <>
          <Dot />
          <span>{fmtElapsed(p.elapsedMs)}</span>
        </>
      )}
      {p.thinkSeconds !== null && p.thinkSeconds > 0 && (
        <>
          <Dot />
          <span>thought {p.thinkSeconds}s</span>
        </>
      )}
      {p.sourcesCount > 0 && (
        <>
          <Dot />
          <span>{p.sourcesCount} source{p.sourcesCount === 1 ? '' : 's'}</span>
        </>
      )}
      {p.queuePeak !== null && p.queuePeak > 0 && (
        <>
          <Dot />
          <span>queued №{p.queuePeak}</span>
        </>
      )}
    </div>
  );
}

// ---- the lifecycle, compact, near the streaming block ----

type Phase = 'submitted' | 'queued' | 'serving';

function livePhase(live: LiveJob): Phase {
  if (live.status === 'queued') return live.queuePos !== null && live.queuePos > 0 ? 'queued' : 'submitted';
  return 'serving';
}

function Stage({ label, state }: { label: string; state: 'past' | 'now' | 'future' }) {
  const tone: Tone = state === 'now' ? 'live' : state === 'past' ? 'past' : 'off';
  return (
    <span className="flex items-center gap-1.5">
      <Square tone={tone} size={state === 'now' ? 4 : 3} pulse={state === 'now'} />
      <span className={`pixel-sans text-[10px] uppercase tracking-[0.14em] ${state === 'now' ? 'text-white/70' : state === 'past' ? 'text-white/35' : 'text-white/20'}`}>
        {label}
      </span>
    </span>
  );
}

export function LifecycleStrip({ live, elapsedMs }: { live: LiveJob; elapsedMs: number }) {
  const phase = livePhase(live);
  const queueN = live.queuePos !== null && live.queuePos > 0 ? live.queuePos : live.queuePeak;
  const stages: { label: string; state: 'past' | 'now' | 'future' }[] = [
    { label: 'submitted', state: phase === 'submitted' ? 'now' : 'past' },
  ];
  if (phase === 'queued' || (live.queuePeak !== null && live.queuePeak > 0)) {
    stages.push({
      label: `queued №${queueN ?? live.queuePeak}`,
      state: phase === 'queued' ? 'now' : phase === 'serving' ? 'past' : 'future',
    });
  }
  stages.push({ label: 'serving', state: phase === 'serving' ? 'now' : 'future' });

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {stages.map((s, i) => (
        <span key={s.label} className="flex items-center gap-2.5">
          {i > 0 && <span aria-hidden className="h-px w-3.5 bg-white/10" />}
          <Stage label={s.label} state={s.state} />
        </span>
      ))}
      <span className="pixel-sans text-[10px] tabular-nums tracking-[0.08em] text-white/25">{fmtElapsed(elapsedMs)}</span>
    </div>
  );
}

// ---- the desk knows the network: a slim library strip ----

export function NetworkStrip({ live, demo, stats }: { live: boolean; demo: boolean; stats: NetworkStats | null }) {
  const state = live ? 'network live' : demo ? 'preview demo' : 'connecting';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30">
      <span className="flex items-center gap-1.5">
        <Square tone={live ? 'live' : 'off'} size={4} pulse={live} />
        <span className={live ? 'text-white/45' : ''}>{state}</span>
      </span>
      {stats && (
        <>
          <Dot />
          <span>{stats.workersOnline} worker{stats.workersOnline === 1 ? '' : 's'} online</span>
          {stats.jobsInQueue > 0 && (
            <>
              <Dot />
              <span>{stats.jobsInQueue} in queue</span>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---- cards carry work history: a whisper of a footer ----

export function CardWork({ convo }: { convo: Convo }) {
  const w = convoWork(convo);
  return (
    <>
      <span>{w.exchanges} {w.exchanges === 1 ? 'exchange' : 'exchanges'}</span>
      {w.creditsSpent > 0 && (
        <>
          <Dot />
          <span>{w.creditsSpent} cr</span>
        </>
      )}
      {w.lastModel && (
        <>
          <Dot />
          <span className="truncate max-w-[9rem]">{w.lastModel}</span>
        </>
      )}
    </>
  );
}

// ---- the per-conversation work ledger ----

function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`pixel-sans text-[11px] text-white/45 ${className}`}>{children}</span>;
}

export function WorkLedger({ convo }: { convo: Convo }) {
  const rows = ledgerRows(convo);
  const w = convoWork(convo);
  const withReceipt = rows.filter(r => r.provenance).length;

  if (rows.length === 0) {
    return (
      <p className="pixel-sans text-[12px] text-white/35 px-1 py-2">
        No work yet. Every reply the network serves lands here with its receipt.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[3.5rem_1fr_auto_auto] gap-x-3 gap-y-2 items-baseline">
        <span className="pixel-sans text-[9px] uppercase tracking-[0.16em] text-white/25">time</span>
        <span className="pixel-sans text-[9px] uppercase tracking-[0.16em] text-white/25">model</span>
        <span className="pixel-sans text-[9px] uppercase tracking-[0.16em] text-white/25 text-right">cost</span>
        <span className="pixel-sans text-[9px] uppercase tracking-[0.16em] text-white/25 text-right">elapsed</span>
        {rows.map(r => {
          const p = r.provenance;
          return (
            <div key={r.id} className="contents">
              <Cell className="tabular-nums text-white/35">{fmtClock(r.createdAt)}</Cell>
              <Cell className="truncate">{p ? p.model : ''}</Cell>
              <Cell className="text-right whitespace-nowrap">{p ? p.costLabel : ''}</Cell>
              <Cell className="text-right tabular-nums">{p && p.elapsedMs !== null ? fmtElapsed(p.elapsedMs) : ''}</Cell>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 pt-2.5 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35">
        <Square tone="done" size={3} />
        <span>{w.exchanges} {w.exchanges === 1 ? 'exchange' : 'exchanges'}</span>
        {w.creditsSpent > 0 && (
          <>
            <Dot />
            <span>{w.creditsSpent} cr spent</span>
          </>
        )}
        {withReceipt < rows.length && (
          <>
            <Dot />
            <span className="text-white/25">{rows.length - withReceipt} without a receipt</span>
          </>
        )}
      </div>
    </div>
  );
}
