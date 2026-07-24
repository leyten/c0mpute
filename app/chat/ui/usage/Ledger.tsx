'use client';

// Variant 2 — the statement. Newest first, one line per movement, the running
// balance down the right in tabular figures, days broken by a quiet rule. The
// balance on each line is walked back from the balance now, so it is derived
// from the account rather than assumed.
import { useMemo } from 'react';
import { clockTime, dayKey, dayLabel, fmt, recentSpend, relTime, type UsageData, type UsageEntry } from './data';
import { Empty, Stat, credits as creditFigure } from './parts';

export default function Ledger({ data }: { data: UsageData }) {
  const entries = data.entries;

  const groups = useMemo(() => {
    if (!entries) return [];
    const out: { day: string; rows: UsageEntry[]; spent: number }[] = [];
    for (const e of entries) {
      const day = dayKey(new Date(e.at));
      let group = out[out.length - 1];
      if (!group || group.day !== day) {
        group = { day, rows: [], spent: 0 };
        out.push(group);
      }
      group.rows.push(e);
      if (e.kind === 'spend') group.spent += e.credits;
    }
    return out;
  }, [entries]);

  const spends = (entries ?? []).filter(e => e.kind === 'spend');
  const week = recentSpend(entries ?? [], 7);
  const average = spends.length ? spends.reduce((n, e) => n + e.credits, 0) / spends.length : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Stat label="Balance" value={creditFigure(data.balance)} sub="credits" />
        <Stat
          label="Spent this week"
          value={entries ? fmt(week.credits) : '—'}
          sub={entries ? `${week.prompts} ${week.prompts === 1 ? 'prompt' : 'prompts'}` : undefined}
        />
        <Stat
          label="Average per prompt"
          value={average === null ? '—' : fmt(average)}
          sub={average === null ? undefined : 'credits'}
        />
      </div>

      {!entries ? (
        <Empty title="There is no recent credit activity to list." note="Movements appear here as soon as the account spends or receives credits." />
      ) : (
        <div className="cu-scroll max-h-[46vh] overflow-y-auto md:max-h-[42vh]">
          {groups.map(group => {
            const label = dayLabel(group.day);
            return (
            <section key={group.day}>
              <header className="flex items-baseline justify-between pb-1 pt-4 text-[11.5px] first:pt-0" style={{ color: 'var(--cu-faint)' }}>
                <span>{label}</span>
                <span className="tabular-nums">{group.spent > 0 ? `${fmt(group.spent)} credits` : ''}</span>
              </header>
              <div style={{ borderTop: '1px solid var(--cu-line)' }}>
                {group.rows.map(row => (
                  <div key={row.id} className="flex items-baseline gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: 'var(--cu-text)' }}>{row.label}</span>
                    {/* the heading already dates every row under it, so only
                        today's lines carry a relative time */}
                    <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: 'var(--cu-faint)' }}>
                      {label === 'Today' ? relTime(row.at) : clockTime(row.at)}
                    </span>
                    <span
                      className="w-[4.5rem] shrink-0 text-right text-[13px] tabular-nums"
                      style={{ color: row.kind === 'spend' ? 'var(--cu-dim)' : 'var(--cu-live)' }}
                    >
                      {row.kind === 'spend' ? '−' : '+'}{fmt(row.credits)}
                    </span>
                    <span className="hidden w-[5.5rem] shrink-0 text-right text-[13px] tabular-nums sm:block" style={{ color: 'var(--cu-faint)' }}>
                      {row.balance === null ? '' : fmt(row.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            );
          })}
        </div>
      )}

      <p className="text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>
        {data.freePrompts === null
          ? 'Free prompt state is unavailable right now.'
          : `${data.freePrompts} free ${data.freePrompts === 1 ? 'prompt' : 'prompts'} left today${data.freeLimit === null ? '' : ` of ${data.freeLimit}`}${data.stakerAllowance > 0 ? `, plus ${data.stakerAllowance} from staking` : ''}.`}
      </p>
    </div>
  );
}
