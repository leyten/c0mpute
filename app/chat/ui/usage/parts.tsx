'use client';

// The two pieces the panel and the grid share: a credit figure that refuses to
// stand in for a number the account does not have, and the block that says so.
import { fmt } from './data';

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
