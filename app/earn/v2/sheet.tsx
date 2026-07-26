'use client';

// Presentational pieces of the /earn/v2 statement. Pure props in, markup out —
// every value they render comes from useWorkerEngine via page.tsx.

import type { ReactNode } from 'react';
import type { SessionJob } from '../engine/useWorkerEngine';

/* -------------------------------------------------------------- primitives */

export function Label({ children }: { children: ReactNode }) {
  return <div className="st2-label">{children}</div>;
}

export function Rule({ strong }: { strong?: boolean }) {
  return <hr className={strong ? 'st2-rule st2-rule-strong' : 'st2-rule'} />;
}

export type Tone = 'idle' | 'prep' | 'live' | 'bad';

const TONE_CLASS: Record<Tone, string> = {
  idle: '',
  prep: 'st2-status-prep',
  live: 'st2-status-live',
  bad: 'st2-status-bad',
};

export function StatusMark({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <div className={`st2-status ${TONE_CLASS[tone]}`.trim()} data-testid="st2-status">
      <span className={`st2-dot${pulse ? ' st2-pulse' : ''}`} />
      {label}
    </div>
  );
}

/** One figure in the strip under the headline amount. */
export function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={`st2-fig-value${muted ? ' st2-fig-value-dim' : ''}`}>{value}</div>
    </div>
  );
}

export function Money({ amount }: { amount: number }) {
  return (
    <>
      <span className="st2-cur">$</span>
      {amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </>
  );
}

/* ------------------------------------------------------------------ notice */

export function Notice({
  title,
  tone,
  children,
  action,
}: {
  title: string;
  tone?: 'bad' | 'warn';
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const cls = tone === 'bad' ? 'st2-notice st2-notice-bad' : tone === 'warn' ? 'st2-notice st2-notice-warn' : 'st2-notice';
  return (
    <div className={cls}>
      <div className="st2-notice-title">{title}</div>
      <div className="st2-notice-body">{children}</div>
      {action && (
        <button type="button" className="st2-link" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ledger */

const fmtClock = (at: number) =>
  new Date(at).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function Ledger({
  jobs,
  pendingId,
  emptyText,
}: {
  jobs: SessionJob[];
  /** A job the engine is generating right now. It has no settled reading yet. */
  pendingId: string | null;
  emptyText: string;
}) {
  if (jobs.length === 0 && !pendingId) {
    return <p className="st2-empty">{emptyText}</p>;
  }

  return (
    <div className="st2-scroll" data-testid="st2-ledger-scroll">
      <table className="st2-ledger">
        <colgroup>
          <col className="st2-col-time" />
          <col />
          <col className="st2-col-tok" />
          <col className="st2-col-dur" />
          <col className="st2-col-status" />
        </colgroup>
        <thead>
          <tr>
            <th>Time</th>
            <th>Reference</th>
            <th className="st2-num">Tokens</th>
            <th className="st2-num st2-cell-dur">Duration</th>
            <th className="st2-num">Status</th>
          </tr>
        </thead>
        <tbody data-testid="st2-ledger-body">
          {pendingId && (
            <tr className="st2-fade">
              <td>&ndash;</td>
              <td className="st2-ref">{pendingId.slice(0, 8)}</td>
              <td className="st2-num">&ndash;</td>
              <td className="st2-num st2-cell-dur">&ndash;</td>
              <td className="st2-num">
                <span className="st2-mark-status st2-mark-pending">
                  <span className="st2-dot st2-pulse" />
                  In progress
                </span>
              </td>
            </tr>
          )}
          {jobs.map((j) => (
            <tr key={`${j.id}-${j.at}`} className="st2-fade">
              <td>{fmtClock(j.at)}</td>
              <td className="st2-ref">{j.id.slice(0, 8)}</td>
              <td className="st2-num st2-tok">{j.tokens.toLocaleString('en-US')}</td>
              <td className="st2-num st2-cell-dur">{(j.ms / 1000).toFixed(1)}s</td>
              <td className="st2-num">
                <span className={`st2-mark-status${j.status === 'completed' ? '' : ' st2-mark-failed'}`}>
                  <span className="st2-dot" />
                  {j.status === 'completed' ? 'Settled' : 'Failed'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- particulars */

export function ParticularRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="st2-prow">
      <span className="st2-prow-key">{label}</span>
      <span className={`st2-prow-val${mono ? ' st2-prow-val-mono' : ''}`} title={value}>
        {value}
      </span>
    </div>
  );
}
