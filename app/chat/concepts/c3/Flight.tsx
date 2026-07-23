'use client';

// The work unit in flight. A compact lifecycle strip in the map's square
// language (submitted → queued №n → serving → done) sits between the request
// and the streaming fulfilment, with a live elapsed clock and transient
// chips for web search and image rendering.

import { ReplyBody, RequestBlock, Square, type SquareTone } from './bits';
import { fmtElapsed } from './types';
import type { SourceRef, PlanId } from '../../lib';

export type FlightPhase = 'dispatch' | 'queued' | 'serving';

export type FlightView = {
  convId: string;
  exchangeId: string;
  requestText: string;
  requestImages: string[];
  planId: PlanId;
  planName: string;
  costLabel: string;
  submittedAt: number;
  phase: FlightPhase;
  queuePos: number | null;
  queuePeak: number | null;
  searching: boolean;
  renderingImage: boolean;
  thinkSeconds: number | null;
  sources: SourceRef[];
};

type StageState = 'past' | 'now' | 'future';

function Stage({ label, state }: { label: string; state: StageState }) {
  const tone: SquareTone = state === 'now' ? 'live' : state === 'past' ? 'idle' : 'off';
  return (
    <span className="flex items-center gap-1.5">
      <Square tone={tone} pulse={state === 'now'} size={7} />
      <span className={`pixel-sans text-[11px] uppercase tracking-[0.14em] ${state === 'now' ? 'text-white/85' : state === 'past' ? 'text-white/40' : 'text-white/25'}`}>
        {label}
      </span>
    </span>
  );
}

function Connector() {
  return <span aria-hidden className="h-px w-4 bg-white/10 md:w-6" />;
}

export default function FlightUnit({
  flight,
  index,
  streamText,
  now,
  onWithdraw,
}: {
  flight: FlightView;
  index: number;
  streamText: string;
  now: number;
  onWithdraw: () => void;
}) {
  const f = flight;
  const stages: { label: string; state: StageState }[] = [
    { label: 'submitted', state: f.phase === 'dispatch' ? 'now' : 'past' },
  ];
  if (f.phase === 'queued' || f.queuePeak !== null) {
    stages.push({
      label: f.phase === 'queued' && f.queuePos !== null ? `queued №${f.queuePos}` : `queued №${f.queuePeak}`,
      state: f.phase === 'queued' ? 'now' : f.phase === 'serving' ? 'past' : 'future',
    });
  }
  stages.push({ label: 'serving', state: f.phase === 'serving' ? 'now' : 'future' });
  stages.push({ label: 'done', state: 'future' });

  const elapsed = Math.max(0, now - f.submittedAt);

  return (
    <article>
      <RequestBlock index={index} text={f.requestText} images={f.requestImages} />

      {/* lifecycle strip */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
        {stages.map((s, i) => (
          <span key={s.label} className="flex items-center gap-2">
            {i > 0 && <Connector />}
            <Stage label={s.label} state={s.state} />
          </span>
        ))}
        <span className="pixel-sans ml-auto text-[11px] tabular-nums tracking-[0.08em] text-white/35">
          {fmtElapsed(elapsed)}
        </span>
        <button
          onClick={onWithdraw}
          className="pixel-sans cursor-pointer text-[11px] uppercase tracking-[0.14em] text-white/25 transition-colors hover:text-white/70"
        >
          withdraw
        </button>
      </div>

      {(f.searching || f.renderingImage) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {f.searching && (
            <span className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
              <Square tone="live" pulse size={5} />
              <span className="pixel-sans text-[11px] uppercase tracking-[0.14em] text-white/45">searching the web</span>
            </span>
          )}
          {f.renderingImage && (
            <span className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
              <Square tone="live" pulse size={5} />
              <span className="pixel-sans text-[11px] uppercase tracking-[0.14em] text-white/45">rendering an image</span>
            </span>
          )}
        </div>
      )}

      {(streamText || f.sources.length > 0) && (
        <div className="mt-5">
          <ReplyBody
            text={streamText}
            sources={f.sources}
            images={[]}
            streaming
            thinkSeconds={f.thinkSeconds}
            awaitingImage={false}
          />
        </div>
      )}
    </article>
  );
}
