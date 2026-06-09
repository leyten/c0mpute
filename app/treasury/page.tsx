'use client';

import { useEffect, useState } from 'react';

interface Treasury {
  launched: boolean;
  pendingBuyback: number;
  pendingStakerRewards: number;
  totalStaked: number;
  totalZeroBurned: number;
  totalUsdBuybackSpent: number;
  totalStakerRewardsPaid: number;
  freeInferenceSubsidizedTodayUsd?: number;
  freeInferenceCreditsToday?: number;
}
interface History {
  burn: { t: string; zero: number; usd: number }[];
  returns: { t: string; usd: number }[];
  staked: { t: string; zero: number }[];
}

const ZERO_SUPPLY = 1_000_000_000; // pump.fun fixed supply

function usd(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function zero(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function compact(n: number): string {
  return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 });
}
function dayLabel(t: string): string {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Lightweight inline SVG area chart with hover tooltip — terminal aesthetic, no deps.
function AreaChart({ points, color, fmt, prefix, suffix }: {
  points: { t: string; v: number }[];
  color: string;
  fmt: (n: number) => string;
  prefix?: React.ReactNode;
  suffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points || points.length < 2) {
    return <div className="h-40 flex items-center justify-center pixel-sans text-white/30 text-xs">not enough data yet</div>;
  }
  // ground the series at 0 on the left so the climb reads from zero
  const series = [{ t: points[0].t, v: 0 }, ...points];
  const W = 800, H = 200, padX = 2, padTop = 18, padBot = 2;
  const ts = series.map((p) => new Date(p.t).getTime());
  const vs = series.map((p) => p.v);
  const minT = Math.min(...ts), maxT = Math.max(...ts);
  const maxV = Math.max(...vs, 1);
  const X = (t: number) => padX + (W - 2 * padX) * (maxT === minT ? 1 : (t - minT) / (maxT - minT));
  const Y = (v: number) => H - padBot - (H - padTop - padBot) * (v / maxV);
  const pts = series.map((p, i) => [X(ts[i]), Y(vs[i])] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `M${pts[0][0].toFixed(1)},${H - padBot} ` + pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0].toFixed(1)},${H - padBot} Z`;
  const gid = `grad_${color.replace('#', '')}`;

  // hover maps mouse x → nearest real data point (positions as % so they track the stretched svg)
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = minT + (maxT - minT) * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    let bi = 0, bd = Infinity;
    points.forEach((p, i) => { const d = Math.abs(new Date(p.t).getTime() - tx); if (d < bd) { bd = d; bi = i; } });
    setHover(bi);
  };
  const h = hover != null ? points[hover] : null;
  const hLeft = h ? (X(new Date(h.t).getTime()) / W) * 100 : 0;
  const hTop = h ? (Y(h.v) / H) * 100 : 0;

  return (
    <div className="relative h-40" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full block">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {h && (
        <>
          {/* vertical guide + dot as HTML overlays (avoids svg aspect-ratio distortion) */}
          <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${hLeft}%`, background: `${color}55` }} />
          <div className="absolute pointer-events-none rounded-full" style={{ left: `${hLeft}%`, top: `${hTop}%`, width: 8, height: 8, background: color, transform: 'translate(-50%,-50%)', boxShadow: `0 0 6px ${color}` }} />
          <div
            className="absolute pointer-events-none z-10 px-2 py-1 rounded-lg border border-white/15 bg-black/90 whitespace-nowrap"
            style={{ left: `${Math.min(85, Math.max(15, hLeft))}%`, top: 0, transform: 'translateX(-50%)' }}
          >
            <div className="pixel-serif text-white text-sm leading-tight">{prefix}{fmt(h.v)}{suffix}</div>
            <div className="pixel-sans text-white/50 text-[10px] leading-tight">{new Date(h.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, last, sub, points, color, fmt, prefix, suffix }: {
  title: React.ReactNode; last: React.ReactNode; sub?: string; points: { t: string; v: number }[]; color: string;
  fmt: (n: number) => string; prefix?: React.ReactNode; suffix?: string;
}) {
  const range = points.length >= 2;
  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="pixel-sans text-white/60 text-xs">{title}</div>
          <div className="pixel-serif text-white text-2xl mt-0.5">{last}</div>
          {sub && <div className="pixel-sans text-white/45 text-[11px] mt-0.5">{sub}</div>}
        </div>
      </div>
      <AreaChart points={points} color={color} fmt={fmt} prefix={prefix} suffix={suffix} />
      {range && (
        <div className="flex justify-between mt-2 pixel-sans text-white/30 text-[10px]">
          <span>{points.length >= 2 ? dayLabel(points[0].t) : ''}</span>
          <span>{points.length >= 2 ? dayLabel(points[points.length - 1].t) : ''}</span>
        </div>
      )}
    </div>
  );
}

export default function TreasuryPage() {
  const [data, setData] = useState<Treasury | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch('/api/treasury').then((r) => r.json()).then(setData).catch(() => setError(true));
      fetch('/api/treasury/history').then((r) => r.json()).then(setHist).catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const GREEN = '#4ade80';
  const BLUE = '#80a0c1';
  const burnPts = (hist?.burn ?? []).map((p) => ({ t: p.t, v: p.zero }));
  const stakedPts = (hist?.staked ?? []).map((p) => ({ t: p.t, v: p.zero }));
  const totalReturned = data ? data.totalUsdBuybackSpent + data.totalStakerRewardsPaid : 0;
  const pctBurned = data ? (data.totalZeroBurned / ZERO_SUPPLY) * 100 : 0;

  return (
    <div className="min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex-1">
              <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
              </a>
            </div>
            <div className="flex items-center gap-4">
              <a href="/" className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">← Back</a>
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="pixel-serif text-white text-4xl md:text-5xl mb-3">Treasury</h1>
          <p className="pixel-sans text-white/70 text-sm mb-8 max-w-2xl">
            100% of the compute margin and a share of <span className="dollar">$</span>ZERO trading fees flow into this treasury. Half buys back and
            burns <span className="dollar">$</span>ZERO; half is paid to stakers in USDC. Everything below updates live.
          </p>

          {error && <p className="pixel-sans text-white/60 text-sm">Could not load treasury data.</p>}
          {!error && !data && <p className="pixel-sans text-white/60 text-sm">Loading…</p>}

          {data && !data.launched && (
            <div className="border border-[#80a0c1]/30 bg-[#80a0c1]/10 rounded-2xl p-6 mb-8">
              <p className="pixel-sans text-[#80a0c1] text-sm">
                <span className="dollar">$</span>ZERO has not launched yet. Buybacks and staking rewards activate the moment the token goes live.
              </p>
            </div>
          )}

          {data && (
            <>
              {/* Hero band */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="border border-green-500/20 bg-green-500/[0.04] rounded-2xl p-6">
                  <div className="pixel-serif text-green-400 text-3xl">{zero(data.totalZeroBurned)}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1"><span className="dollar">$</span>ZERO burned forever</div>
                  <div className="pixel-sans text-green-400/60 text-[11px] mt-1">{pctBurned.toFixed(2)}% of supply removed</div>
                </div>
                <div className="border border-[#80a0c1]/20 bg-[#80a0c1]/[0.05] rounded-2xl p-6">
                  <div className="pixel-serif text-white text-3xl"><span className="dollar">$</span>{usd(totalReturned)}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1">returned to holders + stakers</div>
                  <div className="pixel-sans text-white/45 text-[11px] mt-1">buybacks + USDC rewards</div>
                </div>
                <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
                  <div className="pixel-serif text-white text-3xl">{compact(data.totalStaked)}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1"><span className="dollar">$</span>ZERO staked</div>
                  <div className="pixel-sans text-white/45 text-[11px] mt-1">{((data.totalStaked / ZERO_SUPPLY) * 100).toFixed(1)}% of supply</div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <ChartCard
                  title={<>Cumulative <span className="dollar">$</span>ZERO burned</>}
                  last={`${compact(data.totalZeroBurned)} ZERO`}
                  sub={`across ${hist?.burn.length ?? 0} buybacks`}
                  points={burnPts}
                  color={GREEN}
                  fmt={(n) => zero(n)}
                  suffix=" ZERO"
                />
                <ChartCard
                  title={<><span className="dollar">$</span>ZERO staked over time</>}
                  last={`${compact(data.totalStaked)} ZERO`}
                  sub="rises on stakes, dips on unstakes"
                  points={stakedPts}
                  color={BLUE}
                  fmt={(n) => zero(n)}
                  suffix=" ZERO"
                />
              </div>

              {/* Detail stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Total spent on buybacks', value: <><span className="dollar">$</span>{usd(data.totalUsdBuybackSpent)}</> },
                  { label: 'Staker rewards paid', value: <><span className="dollar">$</span>{usd(data.totalStakerRewardsPaid)}</> },
                  { label: 'Pending buyback', value: <><span className="dollar">$</span>{usd(data.pendingBuyback)}</> },
                  { label: 'Pending staker rewards', value: <><span className="dollar">$</span>{usd(data.pendingStakerRewards)}</> },
                  ...(data.freeInferenceCreditsToday && data.freeInferenceCreditsToday > 0
                    ? [{ label: 'Free credits to stakers (today)', value: <><span className="dollar">$</span>{usd(data.freeInferenceSubsidizedTodayUsd ?? 0)}</> }]
                    : []),
                ].map((s, i) => (
                  <div key={i} className="border border-white/5 bg-white/[0.01] rounded-xl p-4 text-center">
                    <div className="pixel-serif text-white/80 text-xl">{s.value}</div>
                    <div className="pixel-sans text-white/60 text-xs mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
