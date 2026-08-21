'use client';

// The proof section: title, the globe in its tinted art region, and the
// page's only marked panel pulled over its bottom edge — now a LIVE stat
// strip (server-summarized; the row hides entirely if the fetch fails,
// because a row of dashes is worse than no row). Under it, three honest
// one-liners — state, privacy, payment integrity — and the proof links.
import { useCallback, useEffect, useRef, useState } from 'react';
import CfGlobe from './CfGlobe';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';
import { useBrand } from '@/components/BrandProvider';

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);

const LINES = [
  'The chat and the v1 API answer today. Full nodes, the sharded 229B model, and the betanet API open at launch.',
  'Prompts are not stored in our database. The machines that serve a job see the tokens they process.',
  'Machines are paid per job, and only for work that passes checks.',
];

export default function EarthSection() {
  const brand = useBrand();
  const globeWrapRef = useRef<HTMLDivElement>(null);
  const onGlobeReady = useCallback(() => {
    globeWrapRef.current?.classList.add('on');
  }, []);
  const [stats, setStats] = useState<{ workers: number; jobs: number; tokens: number } | null>(null);
  useEffect(() => {
    fetch('/api/home-stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStats(d); })
      .catch(() => {});
  }, []);

  return (
    <section id="network" className="px-4 md:px-6">
      <Reveal className="max-w-[1080px] mx-auto text-center flex flex-col items-center gap-4">
        <h2 className="rv pixel-serif text-fg text-3xl md:text-5xl">Torrent, but for compute</h2>
        <p
          className="rv pixel-sans text-fg-60 text-sm md:text-[19px] max-w-[700px]"
          style={{ '--d': '0.08s' } as React.CSSProperties}
        >
          Every model is split across user-owned GPUs that together hold one full copy. No single
          machine holds the whole thing.
        </p>
      </Reveal>
      <div className="relative mt-14">
        <div
          ref={globeWrapRef}
          className="globe-enter relative mx-auto max-w-[1000px] h-[420px] md:h-[620px] overflow-hidden bg-fg/[0.02]"
        >
          <CfGlobe onReady={onGlobeReady} />
        </div>
        {stats && (
          <Reveal className="relative max-w-[1200px] mx-auto -mt-10 md:-mt-16 border border-fg/10 bg-background grid grid-cols-3 divide-x divide-fg/10">
            <CornerMarks />
            {[
              { n: fmt(stats.workers), l: 'GPUs online' },
              { n: fmt(stats.jobs), l: 'Jobs served' },
              { n: fmt(stats.tokens), l: 'Tokens generated' },
            ].map((c, i) => (
              <div key={c.l} className="rv p-5 md:p-8 text-center" style={{ '--d': `${i * 0.08}s` } as React.CSSProperties}>
                <div className="pixel-serif text-fg text-2xl md:text-4xl">{c.n}</div>
                <div className="pixel-sans text-fg-45 text-xs md:text-sm mt-1.5 tracking-wide">{c.l}</div>
              </div>
            ))}
          </Reveal>
        )}
      </div>
      <Reveal className="max-w-[1080px] mx-auto mt-12 text-center flex flex-col items-center gap-3">
        {LINES.map((l, i) => (
          <p key={i} className="rv pixel-sans text-fg-60 text-sm md:text-base max-w-2xl" style={{ '--d': `${i * 0.06}s` } as React.CSSProperties}>
            {l}
          </p>
        ))}
        <div className="rv mt-4 flex flex-wrap items-center justify-center gap-6" style={{ '--d': '0.24s' } as React.CSSProperties}>
          <a href={brand.urls.shard} target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
            See the live map →
          </a>
          <a href={brand.urls.data} target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
            Network data →
          </a>
          <a href="https://github.com/leyten/shard" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
            Read the engine on GitHub →
          </a>
        </div>
      </Reveal>
    </section>
  );
}
