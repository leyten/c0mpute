'use client';

// The pieces all three views share: a figure with its label, and the block
// that stands in for data the account does not have. Both are quiet by
// default — the panel is glanced at, not read.
import { fmt } from './data';

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>{label}</div>
      <div className="mt-1 text-[16px] tabular-nums" style={{ color: 'var(--cu-text)' }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] tabular-nums" style={{ color: 'var(--cu-faint)' }}>{sub}</div>}
    </div>
  );
}

/** A number the account has, or a dash where it does not. Never a stand-in. */
export const credits = (n: number | null) => (n === null ? '—' : fmt(n));

export function Empty({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-2xl px-4 py-6 text-center" style={{ background: 'var(--cu-surface)' }}>
      <p className="text-[13px]" style={{ color: 'var(--cu-dim)' }}>{title}</p>
      {note && <p className="mt-1 text-[12px]" style={{ color: 'var(--cu-faint)' }}>{note}</p>}
    </div>
  );
}
