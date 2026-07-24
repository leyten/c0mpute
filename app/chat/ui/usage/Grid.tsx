'use client';

// Variant 1 — the contribution grid, read literally: 53 columns of 7 days,
// four steps of the one emerald the interface already uses, month labels above
// and weekday labels beside. The squares carry the year; the four figures
// around them carry today.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_SHORT, currentStreak, dayKey, fmt, longDate, type UsageData, type UsageDay } from './data';
import { Empty, Stat, credits as creditFigure } from './parts';

const CELL = 9;
const PITCH = 12; // cell + 3px gap
const WEEKS = 53;

/** Empty, then four steps of --cu-live. One hue, never a scale of hues. */
const STEPS = [
  'rgba(255,255,255,0.05)',
  'rgba(52,211,153,0.20)',
  'rgba(52,211,153,0.38)',
  'rgba(52,211,153,0.60)',
  'rgba(52,211,153,0.88)',
];

interface Cell { key: string; date: Date; prompts: number; credits: number; future: boolean }

export default function Grid({ data }: { data: UsageData }) {
  const scroller = useRef<HTMLDivElement>(null);
  // `below` keeps the tooltip inside the scroller, which clips what leaves it
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean; text: string } | null>(null);

  const built = useMemo(() => build(data.days ?? []), [data.days]);

  // the year ends at the right edge, so open on the part that is current
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [built]);

  if (!data.days) {
    return (
      <div className="space-y-4">
        <Figures data={data} />
        <Empty title="There is no daily history to draw yet." note="Prompts show up here once the account has credit activity to read." />
      </div>
    );
  }

  const { columns, months, cuts, busiest } = built;
  const width = WEEKS * PITCH - 3;
  const streak = currentStreak(data.days);

  return (
    <div className="space-y-5">
      <Figures data={data} />

      {/* the rail stays put while the year scrolls under it on a phone */}
      <div className="flex gap-2">
        <div className="relative w-[22px] shrink-0" style={{ marginTop: 16 }}>
          {[[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([row, label]) => (
            <span
              key={label as string}
              className="absolute text-[10px] leading-none"
              style={{ top: (row as number) * PITCH + 1, color: 'var(--cu-faint)' }}
            >{label}</span>
          ))}
        </div>

        <div ref={scroller} className="cu-scroll min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="relative" style={{ width }}>
            <div className="relative h-4" style={{ width }}>
              {months.map(m => (
                <span
                  key={`${m.label}-${m.col}`}
                  className="absolute top-0 text-[10.5px] leading-none"
                  style={{ left: m.col * PITCH, color: 'var(--cu-faint)' }}
                >{m.label}</span>
              ))}
            </div>

            <div className="flex gap-[3px]" onMouseLeave={() => setTip(null)}>
              {columns.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-[3px]">
                  {col.map((cell, ri) => (
                    <div
                      key={cell.key}
                      onMouseEnter={() => setTip(cell.future ? null : {
                        x: ci * PITCH + CELL / 2,
                        y: ri <= 3 ? 16 + ri * PITCH + CELL + 6 : 16 + ri * PITCH - 6,
                        below: ri <= 3,
                        text: cell.prompts === 0
                          ? `No prompts · ${longDate(cell.date)}`
                          : `${cell.prompts} ${cell.prompts === 1 ? 'prompt' : 'prompts'} · ${fmt(cell.credits)} credits · ${longDate(cell.date)}`,
                      })}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        background: cell.future ? 'transparent' : STEPS[level(cell.prompts, cuts)],
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>

            {tip && (
              <div
                className={`cu-fade pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11.5px] tabular-nums shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ${tip.below ? '' : '-translate-y-full'}`}
                style={{
                  left: Math.min(Math.max(tip.x, 68), width - 68),
                  top: tip.y,
                  // the panel is already --cu-pop, so the hairline is what
                  // separates the tooltip from it
                  background: 'var(--cu-pop)',
                  border: '1px solid var(--cu-line)',
                  color: 'var(--cu-text)',
                }}
              >{tip.text}</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px]" style={{ color: 'var(--cu-faint)' }}>
        <span className="tabular-nums">
          {streak > 0 ? `${streak} day streak` : 'No run going right now'}
          {busiest && `. Busiest ${longDate(busiest.date)}, ${busiest.prompts} prompts`}
        </span>
        <span className="flex items-center gap-1.5">
          Less
          {STEPS.map((bg, i) => (
            <span key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: bg }} />
          ))}
          More
        </span>
      </div>

      {data.partial && (
        <p className="text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>
          Drawn from the recent credit activity the account keeps. The full record lives on your account page.
        </p>
      )}
    </div>
  );
}

function Figures({ data }: { data: UsageData }) {
  const month = (data.days ?? []).filter(d => d.day.slice(0, 7) === dayKey(new Date()).slice(0, 7));
  const spent = month.reduce((n, d) => n + d.credits, 0);
  const prompts = month.reduce((n, d) => n + d.prompts, 0);
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-4">
      <Stat label="Balance" value={creditFigure(data.balance)} sub="credits" />
      <Stat
        label="Free prompts left"
        value={data.freePrompts === null ? '—' : String(data.freePrompts)}
        sub={data.freeLimit === null ? undefined : `of ${data.freeLimit} today`}
      />
      <Stat
        label="Spent this month"
        value={data.days ? fmt(spent) : '—'}
        sub={data.days ? `${prompts} ${prompts === 1 ? 'prompt' : 'prompts'}` : undefined}
      />
    </div>
  );
}

/** Steps sit on the account's own quartiles, so a quiet year still has texture
 *  and one outlier day cannot flatten the rest into the palest square. */
function level(prompts: number, cuts: [number, number, number]): number {
  if (prompts <= 0) return 0;
  if (prompts >= cuts[2]) return 4;
  if (prompts >= cuts[1]) return 3;
  if (prompts >= cuts[0]) return 2;
  return 1;
}

function build(days: UsageDay[]) {
  const byDay = new Map(days.map(d => [d.day, d]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // the left edge is the Sunday 52 weeks before the current week
  const start = new Date(today);
  start.setDate(start.getDate() - today.getDay() - (WEEKS - 1) * 7);

  const columns: Cell[][] = [];
  const months: { col: number; label: string }[] = [];
  const active: number[] = [];
  let lastMonth = -1;
  let busiest: { date: Date; prompts: number } | null = null;

  for (let c = 0; c < WEEKS; c++) {
    const col: Cell[] = [];
    for (let r = 0; r < 7; r++) {
      const date = new Date(start);
      date.setDate(start.getDate() + c * 7 + r);
      const key = dayKey(date);
      const row = byDay.get(key);
      const prompts = row?.prompts ?? 0;
      if (prompts > 0) {
        active.push(prompts);
        if (!busiest || prompts > busiest.prompts) busiest = { date, prompts };
      }
      col.push({ key, date, prompts, credits: row?.credits ?? 0, future: date > today });
    }
    // a column is labelled with its month when that month starts inside it
    const head = col[0].date;
    if (head.getMonth() !== lastMonth && head.getDate() <= 7) {
      months.push({ col: c, label: MONTHS_SHORT[head.getMonth()] });
      lastMonth = head.getMonth();
    }
    columns.push(col);
  }

  active.sort((a, b) => a - b);
  const at = (q: number) => active[Math.min(active.length - 1, Math.floor(active.length * q))] ?? 1;
  const cuts: [number, number, number] = active.length ? [at(0.4), at(0.7), at(0.9)] : [1, 2, 3];

  return { columns, months, cuts, busiest };
}
