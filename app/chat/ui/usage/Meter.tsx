'use client';

// Variant 3 — the glance. One serif figure, one bar for today, thirty days of
// spend as flat squares, and what the credits went on. The fewest words of the
// three: if a line can be a number, it is a number.
import { useEffect, useRef, useState } from 'react';
import { fmt, type UsageData, type UsageDay } from './data';
import { Empty } from './parts';

export default function Meter({ data }: { data: UsageData }) {
  const used = data.freeLimit !== null && data.freePrompts !== null ? data.freeLimit - data.freePrompts : null;
  const recent = (data.days ?? []).slice(-30);
  const spent30 = recent.reduce((n, d) => n + d.credits, 0);

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-baseline gap-2.5">
          <span className="pixel-serif text-[52px] leading-none tabular-nums" style={{ color: 'var(--cu-text)' }}>
            {data.balance === null ? '—' : fmt(data.balance)}
          </span>
          <span className="text-[13px]" style={{ color: 'var(--cu-dim)' }}>credits</span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-[12px]">
          <span style={{ color: 'var(--cu-dim)' }}>Free prompts today</span>
          <span className="tabular-nums" style={{ color: 'var(--cu-faint)' }}>
            {used === null || data.freeLimit === null ? 'unavailable' : `${used} of ${data.freeLimit} used`}
          </span>
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--cu-surface)' }}>
          {used !== null && data.freeLimit !== null && data.freeLimit > 0 && (
            <div style={{ width: `${Math.min(100, (used / data.freeLimit) * 100)}%`, background: 'var(--cu-live)' }} />
          )}
        </div>
        {data.stakerAllowance > 0 && (
          <p className="mt-2 text-[11.5px] tabular-nums" style={{ color: 'var(--cu-faint)' }}>
            {data.stakerAllowance} more from staking
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between text-[12px]">
          <span style={{ color: 'var(--cu-dim)' }}>Last 30 days</span>
          {data.days && <span className="tabular-nums" style={{ color: 'var(--cu-faint)' }}>{fmt(spent30)} credits</span>}
        </div>
        <div className="mt-2.5">
          {data.days ? <Spark days={recent} /> : <Empty title="There is no daily spend to plot yet." />}
        </div>
      </div>

      <div>
        <div className="text-[12px]" style={{ color: 'var(--cu-dim)' }}>By model</div>
        <div className="mt-2.5">
          {data.models ? <Models models={data.models} /> : <Empty title="There is no per-model record yet." />}
        </div>
      </div>
    </div>
  );
}

/** Thirty columns of 2px squares. Flat fills, one hue, no gradient and no glow. */
function Spark({ days }: { days: UsageDay[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 44;
    el.width = width * dpr;
    el.height = height * dpr;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const n = days.length || 1;
    const gap = 3;
    // 3px marks, never wider: this is a sparkline, not a bar chart
    const bar = Math.max(2, Math.min(3, Math.floor((width - (n - 1) * gap) / n)));
    const span = bar * n + gap * (n - 1);
    const left = 0;
    const max = Math.max(1, ...days.map(d => d.credits));

    // baseline, the same hairline the interface uses everywhere else
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left, height - 1, span, 1);

    days.forEach((d, i) => {
      const x = left + i * (bar + gap);
      if (d.credits <= 0) return;
      // quantised to 2px so the column reads as stacked squares, not a curve
      const h = Math.max(2, Math.round(((d.credits / max) * (height - 3)) / 2) * 2);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.75)';
      ctx.fillRect(x, height - 1 - h, bar, h);
    });
  }, [days, width]);

  return (
    <div ref={wrap}>
      <canvas ref={canvas} style={{ width: '100%', height: 44, display: 'block' }} />
    </div>
  );
}

/** One stacked bar, then the counts under it. Steel at four weights. */
function Models({ models }: { models: { model: string; prompts: number; tokens: number }[] }) {
  const shown = models.slice(0, 4);
  const total = shown.reduce((n, m) => n + m.prompts, 0) || 1;
  const shades = ['rgba(128,160,193,0.95)', 'rgba(128,160,193,0.7)', 'rgba(128,160,193,0.45)', 'rgba(128,160,193,0.25)'];

  return (
    <div>
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
        {shown.map((m, i) => (
          <div key={m.model} style={{ width: `${(m.prompts / total) * 100}%`, background: shades[i] }} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {shown.map((m, i) => (
          <div key={m.model} className="flex items-baseline gap-2 text-[12.5px]">
            <span className="h-[6px] w-[6px] shrink-0 translate-y-[-1px] rounded-[1px]" style={{ background: shades[i] }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--cu-dim)' }}>{m.model}</span>
            <span className="tabular-nums" style={{ color: 'var(--cu-faint)' }}>{fmt(m.prompts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
