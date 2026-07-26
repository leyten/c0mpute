'use client';

// The instrument's parts. Presentational only: every value arrives as a prop
// from the page, which reads it from the worker engine.

import type { ReactNode } from 'react';
import type { SessionJob } from '../engine/useWorkerEngine';

export type Tone = 'live' | 'steel' | 'fault' | 'warn' | 'idle';

const TONE: Record<Tone, string> = {
  live: 'iv1-t-live',
  steel: 'iv1-t-steel',
  fault: 'iv1-t-fault',
  warn: 'iv1-t-warn',
  idle: 'iv1-t-idle',
};

export const DASH = '—';

export function Pill({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <span className={`iv1-pill ${TONE[tone]}`}>
      <span className={`iv1-dot${pulse ? ' iv1-dot--pulse' : ''}`} />
      {label}
    </span>
  );
}

/* --------------------------------------------------------------- channels */

export function Channel({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const blank = value === DASH;
  return (
    <div className="iv1-ch">
      <div className={`iv1-chval${blank ? ' iv1-chval--muted' : ''}`}>
        <span className="iv1-chnum">{value}</span>
        {unit && !blank && <span className="iv1-chunit">{unit}</span>}
      </div>
      <div className="iv1-chlabel">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ scope */

const W = 600;
const H = 120;

/** Throughput against time: one point per sample, newest at the right edge. */
export function Plot({ samples, ceiling, live }: { samples: number[]; ceiling: number; live: boolean }) {
  const n = samples.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - 3 - (Math.min(v, ceiling) / ceiling) * (H - 6);
  const line = samples.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W.toFixed(1)},${H} L0,${H} Z`;
  const stroke = live ? 'rgba(52,211,153,0.9)' : 'rgba(128,160,193,0.5)';
  const head = { cx: x(n - 1), cy: y(samples[n - 1] ?? 0) };

  return (
    <svg className="iv1-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="iv1-under" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={live ? 'rgba(52,211,153,0.22)' : 'rgba(128,160,193,0.14)'} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke="rgba(255,255,255,0.055)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {[10, 20, 30, 40, 50].map((i) => (
        <line
          key={i}
          x1={x(i)}
          x2={x(i)}
          y1="0"
          y2={H}
          stroke="rgba(255,255,255,0.045)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <path d={area} fill="url(#iv1-under)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={head.cx} cy={head.cy} r="4" fill={stroke} />
    </svg>
  );
}

/** The load channel: the same display, showing the fetch instead. */
export function FetchMeter({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, progress * 100));
  return (
    <div className="iv1-fetch">
      <div className="iv1-fetchnum">
        {pct.toFixed(1)}
        <small>%</small>
      </div>
      <div>
        <div className="iv1-meter">
          <div className="iv1-meterfill" style={{ width: `${pct}%` }} />
        </div>
        <div className="iv1-grads">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="iv1-grad" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- ledger */

const fmtClock = (at: number) =>
  new Date(at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function Ledger({ jobs }: { jobs: SessionJob[] }) {
  return (
    <>
      <div className="iv1-lrow iv1-lhead">
        <span className="iv1-lcell">Time</span>
        <span className="iv1-lcell iv1-lcell--job">Job</span>
        <span className="iv1-lcell iv1-lcell--num">Tokens</span>
        <span className="iv1-lcell iv1-lcell--num">Duration</span>
        <span className="iv1-lcell iv1-lcell--num iv1-lcell--rate">Rate</span>
        <span className="iv1-lcell iv1-lcell--num">Status</span>
      </div>
      <div className="iv1-lrows">
        {jobs.map((j) => {
          const rate = j.ms > 0 ? (j.tokens / j.ms) * 1000 : 0;
          const ok = j.status === 'completed';
          return (
            <div className="iv1-lrow iv1-fade" key={`${j.id}-${j.at}`}>
              <span className="iv1-lcell">{fmtClock(j.at)}</span>
              <span className="iv1-lcell iv1-lcell--job">{j.id.slice(0, 8)}</span>
              <span className="iv1-lcell iv1-lcell--num iv1-lcell--tok">{j.tokens}</span>
              <span className="iv1-lcell iv1-lcell--num">{(j.ms / 1000).toFixed(1)}s</span>
              <span className="iv1-lcell iv1-lcell--num iv1-lcell--rate">{rate.toFixed(1)}</span>
              <span className={`iv1-lcell iv1-lcell--num ${ok ? 'iv1-t-live' : 'iv1-t-fault'}`}>{j.status}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------- key/value */

export function KV({ k, v, tone, big, title }: { k: string; v: ReactNode; tone?: Tone; big?: boolean; title?: string }) {
  return (
    <div className="iv1-kv">
      <span className="iv1-k">{k}</span>
      <span className={`iv1-v${big ? ' iv1-v--big' : ''}${tone ? ` ${TONE[tone]}` : ''}`} title={title}>
        {v}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ peer array */

/** One mark per machine serving the network, capped so the row never wraps
 *  away from the count beside it. Steel marks are native workers. */
export function PeerArray({
  online,
  native,
  you,
}: {
  online: number;
  native: number;
  you: boolean;
}) {
  const shown = Math.min(online, 24);
  const browser = Math.max(0, online - native);
  return (
    <>
      <div className="iv1-peers">
        {Array.from({ length: shown }, (_, i) => {
          const isYou = you && i === 0;
          const isNative = i >= browser;
          return (
            <span
              key={i}
              className={`iv1-peer${isYou ? ' iv1-peer--you' : isNative ? ' iv1-peer--native' : ''}`}
            />
          );
        })}
        {online > shown && <span className="iv1-peermore">+{online - shown}</span>}
      </div>
      <div className="iv1-legend">
        {you && (
          <span className="iv1-legitem"><span className="iv1-swatch iv1-peer--you" />This machine</span>
        )}
        <span className="iv1-legitem"><span className="iv1-swatch iv1-peer--native" />Native</span>
        <span className="iv1-legitem"><span className="iv1-swatch" />Browser</span>
      </div>
    </>
  );
}
