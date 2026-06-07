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
}

function usd(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function zero(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function TreasuryPage() {
  const [data, setData] = useState<Treasury | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/treasury')
        .then((r) => r.json())
        .then(setData)
        .catch(() => setError(true));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

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
              <a href="/" className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">
                ← Back
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
        <h1 className="pixel-serif text-white text-4xl md:text-5xl mb-3">c0mpute treasury</h1>
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {[
                { label: <>Total <span className="dollar">$</span>ZERO burned</>, value: <>{zero(data.totalZeroBurned)} ZERO</> },
                { label: 'Total spent on buybacks', value: <><span className="dollar">$</span>{usd(data.totalUsdBuybackSpent)}</> },
                { label: 'Staker rewards paid', value: <><span className="dollar">$</span>{usd(data.totalStakerRewardsPaid)}</> },
              ].map((s, i) => (
                <div key={i} className="border border-white/10 bg-white/[0.02] rounded-2xl p-5 text-center">
                  <div className="pixel-serif text-white text-2xl">{s.value}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Pending buyback', value: <><span className="dollar">$</span>{usd(data.pendingBuyback)}</> },
                { label: 'Pending staker rewards', value: <><span className="dollar">$</span>{usd(data.pendingStakerRewards)}</> },
                { label: <>Total <span className="dollar">$</span>ZERO staked</>, value: <>{zero(data.totalStaked)} ZERO</> },
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
