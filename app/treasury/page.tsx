'use client';

import SiteNav from '@/components/SiteNav';

// Public treasury dashboard. Every figure comes from /api/treasury (polled every
// 30s) and /api/treasury/history; nothing on this page is estimated client-side.
// Presentation: editorial money surface (Newsreader figures, Inter labels), with
// the $ZERO flywheel expressed once as a diagram strip.
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

const card = 'border border-fg/10 bg-fg/[0.02] rounded-2xl';
const secLabel = 'pixel-sans text-fg-40 text-[10px] tracking-widest uppercase';

// Lightweight inline SVG area chart with hover tooltip. No deps.
function AreaChart({ points, color, fmt, prefix, suffix }: {
  points: { t: string; v: number }[];
  color: string;
  fmt: (n: number) => string;
  prefix?: React.ReactNode;
  suffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points || points.length < 2) {
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-1">
        <span className="pixel-sans text-fg-35 text-xs">no data points yet</span>
        <span className="pixel-sans text-fg-20 text-[10px]">this chart fills in as events land on-chain</span>
      </div>
    );
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
  // colour is a var() reference now, so strip it to letters for a legal id
  const gid = `grad_${color.replace(/[^a-z0-9]/gi, '')}`;

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
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {h && (
        <>
          {/* vertical guide + dot as HTML overlays (avoids svg aspect-ratio distortion) */}
          <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${hLeft}%`, background: `color-mix(in srgb, ${color} 33.33%, transparent)` }} />
          <div className="absolute pointer-events-none rounded-full" style={{ left: `${hLeft}%`, top: `${hTop}%`, width: 8, height: 8, background: color, transform: 'translate(-50%,-50%)', boxShadow: `0 0 6px ${color}` }} />
          <div
            className="absolute pointer-events-none z-10 px-2 py-1 rounded-lg border border-fg/15 bg-tooltip whitespace-nowrap"
            style={{ left: `${Math.min(85, Math.max(15, hLeft))}%`, top: 0, transform: 'translateX(-50%)' }}
          >
            <div className="pixel-serif text-fg text-sm leading-tight">{prefix}{fmt(h.v)}{suffix}</div>
            <div className="pixel-sans text-fg-50 text-[10px] leading-tight">{new Date(h.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
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
    <div className={`${card} p-5`}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="pixel-sans text-fg-50 text-xs">{title}</div>
          <div className="pixel-serif text-fg text-2xl mt-1">{last}</div>
          {sub && <div className="pixel-sans text-fg-45 text-[11px] mt-0.5">{sub}</div>}
        </div>
      </div>
      <AreaChart points={points} color={color} fmt={fmt} prefix={prefix} suffix={suffix} />
      {range && (
        <div className="flex justify-between mt-2 pixel-sans text-fg-30 text-[10px]">
          <span>{dayLabel(points[0].t)}</span>
          <span>{dayLabel(points[points.length - 1].t)}</span>
        </div>
      )}
    </div>
  );
}

// The mechanic, stated rather than drawn. Boxes with arrows between them add
// nothing a sentence does not already carry.
function Flywheel() {
  return (
    <div className="mb-10">
      <div className={`${secLabel} mb-3`}>How value flows</div>
      <p className="pixel-serif text-fg text-xl md:text-2xl leading-snug max-w-[46rem]">
        The compute margin and a share of <span className="dollar">$</span>ZERO trading fees
        accumulate here in <span className="dollar">$</span>USDC, then split in half.
      </p>
      <div className="mt-6 grid gap-px sm:grid-cols-2 max-w-[46rem]">
        <div className="pt-4 border-t border-fg/10 sm:pr-8">
          <div className="pixel-sans text-fg text-sm">Half buys <span className="dollar">$</span>ZERO and burns it</div>
          <div className="pixel-sans text-fg-45 text-[12.5px] mt-1">Supply shrinks permanently, on-chain.</div>
        </div>
        <div className="pt-4 border-t border-fg/10 sm:pl-8">
          <div className="pixel-sans text-fg text-sm">Half is paid to stakers</div>
          <div className="pixel-sans text-fg-45 text-[12.5px] mt-1">In <span className="dollar">$</span>USDC, claimable from the staking page.</div>
        </div>
      </div>
    </div>
  );
}

export default function TreasuryPage() {
  const [data, setData] = useState<Treasury | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch('/api/treasury').then((r) => r.json()).then((d) => { setData(d); setError(false); }).catch(() => setError(true));
      fetch('/api/treasury/history').then((r) => r.json()).then(setHist).catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const GREEN = 'var(--success)';
  const BLUE = 'var(--steel)';
  const STONE = 'var(--stone)';
  const burnPts = (hist?.burn ?? []).map((p) => ({ t: p.t, v: p.zero }));
  const returnPts = (hist?.returns ?? []).map((p) => ({ t: p.t, v: p.usd }));
  const stakedPts = (hist?.staked ?? []).map((p) => ({ t: p.t, v: p.zero }));
  const totalReturned = data ? data.totalUsdBuybackSpent + data.totalStakerRewardsPaid : 0;
  const pctBurned = data ? (data.totalZeroBurned / ZERO_SUPPLY) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />

      <main className="pt-32 pb-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Page lede */}
          <div className="mb-8">
            <h1 className="pixel-serif text-fg text-4xl md:text-5xl mb-3">Treasury</h1>
            <p className="pixel-sans text-fg-70 text-sm max-w-2xl">
              100% of the compute margin and a share of <span className="dollar">$</span>ZERO trading fees flow into this treasury.
              Half buys back and burns <span className="dollar">$</span>ZERO; half is paid to stakers in <span className="dollar">$</span>USDC.
              Everything below updates live.
            </p>
          </div>

          <Flywheel />

          {data && !data.launched && (
            <div className="border border-steel/30 bg-steel/10 rounded-2xl p-6 mb-8">
              <p className="pixel-sans text-steel text-sm">
                <span className="dollar">$</span>ZERO has not launched yet. Buybacks and staking rewards activate the moment the token goes live.
              </p>
            </div>
          )}

          {/* Labeled empty state: never fabricate figures when the feed is down. */}
          {error && !data && (
            <div className={`${card} p-10 text-center mb-8`}>
              <div className="pixel-serif text-fg-80 text-2xl mb-2">Treasury data unavailable</div>
              <p className="pixel-sans text-fg-50 text-sm max-w-md mx-auto">
                Live figures could not be loaded. This page retries automatically every 30 seconds and fills in as soon as the feed responds.
              </p>
            </div>
          )}

          {!error && !data && (
            <div className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`${card} p-6 animate-pulse`}>
                    <div className="h-8 w-28 bg-fg/10 rounded mb-3" />
                    <div className="h-3 w-36 bg-fg/5 rounded" />
                  </div>
                ))}
              </div>
              <p className="pixel-sans text-fg-40 text-xs mt-4">Loading live treasury data</p>
            </div>
          )}

          {data && (
            <>
              {/* Headline band: what has been burned, returned, and staked. */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="border border-green-500/20 bg-green-500/[0.04] rounded-2xl p-6">
                  <div className="pixel-serif text-green-400 text-3xl md:text-4xl">{zero(data.totalZeroBurned)}</div>
                  <div className="pixel-sans text-fg-70 text-xs mt-2"><span className="dollar">$</span>ZERO burned forever</div>
                  <div className="pixel-sans text-green-400/60 text-[11px] mt-1">{pctBurned.toFixed(2)}% of supply removed</div>
                </div>
                <div className="border border-steel/20 bg-steel/[0.05] rounded-2xl p-6">
                  <div className="pixel-serif text-fg text-3xl md:text-4xl"><span className="dollar">$</span>{usd(totalReturned)}</div>
                  <div className="pixel-sans text-fg-70 text-xs mt-2">returned to holders + stakers</div>
                  <div className="pixel-sans text-fg-45 text-[11px] mt-1">buybacks + <span className="dollar">$</span>USDC rewards</div>
                </div>
                <div className={`${card} p-6`}>
                  <div className="pixel-serif text-fg text-3xl md:text-4xl">{compact(data.totalStaked)}</div>
                  <div className="pixel-sans text-fg-70 text-xs mt-2"><span className="dollar">$</span>ZERO staked</div>
                  <div className="pixel-sans text-fg-45 text-[11px] mt-1">{((data.totalStaked / ZERO_SUPPLY) * 100).toFixed(1)}% of supply</div>
                </div>
              </div>

              {/* History: each series in its own chart, one color per entity. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                  title={<>Cumulative value returned</>}
                  last={<><span className="dollar">$</span>{usd(totalReturned)}</>}
                  sub="buybacks + staker payouts, in USD"
                  points={returnPts}
                  color={STONE}
                  fmt={(n) => usd(n)}
                  prefix={<span className="dollar">$</span>}
                />
              </div>
              <div className="mb-6">
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

              {/* Ledger detail */}
              <div className={`${secLabel} mb-3`}>Ledger detail</div>
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
                  <div key={i} className="border border-fg/5 bg-fg/[0.01] rounded-xl p-4 text-center">
                    <div className="pixel-serif text-fg-80 text-xl">{s.value}</div>
                    <div className="pixel-sans text-fg-60 text-xs mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Cross-link: the staker half of the flywheel is one page away. */}
          <div className={`${card} mt-10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
            <div>
              <div className="pixel-serif text-fg text-xl">Earn the staker half</div>
              <p className="pixel-sans text-fg-60 text-sm mt-1">
                Stake <span className="dollar">$</span>ZERO from self-custody and receive <span className="dollar">$</span>USDC from every distribution.
              </p>
            </div>
            <a href="/staking" className="pixel-sans text-sm font-medium px-6 py-2.5 rounded-xl bg-fg text-on-fg hover:bg-fg/90 transition-colors whitespace-nowrap">
              Stake <span className="dollar">$</span>ZERO
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
