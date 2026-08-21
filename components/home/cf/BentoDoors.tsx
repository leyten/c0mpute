'use client';

// The three audience doors as a composed bento. Row 1: developers (8 cols,
// art right) and the ink focal cell for GPU owners (4 cols) — ink appears
// exactly three times on the page: hero, here, close. Row 2 mirrors: art
// LEFT (5 cols), text right (7 cols). Art regions declare their own aspect
// boxes and are never stretched by the text column (squash) or sliced by a
// card edge (closed silhouettes stay contained).
import BuildIdle from '../BuildIdle';
import CoinsIdle from '../CoinsIdle';
import GlobeMini from '../GlobeMini';
import Reveal from './Reveal';
import { useBrand } from '@/components/BrandProvider';

function Links({ items, onInk = false }: { items: { href: string; text: string; external?: boolean }[]; onInk?: boolean }) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {items.map((l) => (
        <a
          key={l.text}
          href={l.href}
          {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className={
            onInk
              ? 'cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors'
              : 'cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors'
          }
        >
          {l.text}
        </a>
      ))}
    </div>
  );
}

export default function BentoDoors() {
  const brand = useBrand();
  return (
    <section id="doors" className="px-4 md:px-6">
      <Reveal className="max-w-[1080px] mx-auto text-center">
        <h2 className="rv pixel-serif text-fg text-3xl md:text-[48px] md:leading-none">Pick your door</h2>
      </Reveal>
      <Reveal className="max-w-[1480px] mx-auto mt-14 grid grid-cols-1 lg:grid-cols-12 gap-2 lg:auto-rows-[440px]">
        {/* Developers — 8 cols, art right on a 16:10 box so it can never squash */}
        <div id="developers" className="rv relative rounded-2xl border border-fg/10 bg-fg/[0.02] hover:bg-fg/[0.04] transition-colors overflow-hidden flex flex-col lg:flex-row lg:col-span-8">
          <div className="p-6 md:p-8 flex flex-col min-w-0 flex-1">
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">FOR DEVELOPERS</div>
            <h3 className="pixel-serif text-fg text-2xl md:text-3xl leading-tight">Build on the network</h3>
            <p className="pixel-sans text-fg-70 text-sm mt-3 leading-relaxed max-w-md">
              One API, served by a network instead of a data center. Every response is backed by the
              receipts underneath it. The v1 endpoint answers today, and the betanet API opens at launch.
            </p>
            <Links
              items={[
                { href: '/chat', text: 'Try it live →' },
                { href: `${brand.urls.docs}/api`, text: 'Betanet API →', external: true },
              ]}
            />
            <div className="pt-6 mt-auto">
              <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className="hdr-btn pixel-sans text-sm font-medium">
                <span>Read the docs</span>
              </a>
            </div>
          </div>
          <div className="relative shrink-0 lg:w-[44%] flex items-center min-h-[220px]">
            <div className="w-full aspect-[16/10] max-h-full">
              <BuildIdle />
            </div>
          </div>
        </div>

        {/* GPU owners — the ink focal cell. hdr-on-ink flips the fg ladder
            white; the canvas inverts on paper because its palette follows the
            page theme, not the cell. */}
        <div id="gpu-owners" className="rv ink-card hdr-on-ink rounded-2xl overflow-hidden flex flex-col lg:col-span-4">
          <div className="p-6 md:p-8 flex flex-col min-w-0">
            <div className="pixel-sans text-white/50 text-xs tracking-widest mb-3">FOR GPU OWNERS</div>
            <h3 className="pixel-serif text-white text-2xl md:text-3xl leading-tight">Plug in, get paid</h3>
            <p className="pixel-sans text-white/70 text-sm mt-3 leading-relaxed">
              Your idle hardware earns USDC for real work: from a browser tab today, a full node when the
              betanet opens. Leave whenever you want.
            </p>
            <Links onInk items={[{ href: '/earn', text: 'Earn in your browser →' }]} />
            <div className="pt-6">
              <a href="/earn" className="hdr-btn pixel-sans text-sm font-medium">
                <span>Start earning</span>
              </a>
            </div>
          </div>
          <div className="relative flex-1 min-h-[160px] flex items-end justify-center pb-8 px-8">
            <div className="w-full aspect-[4/3] max-h-full light:invert">
              <CoinsIdle />
            </div>
          </div>
        </div>

        {/* Community — row 2 mirrors: art LEFT (5 cols), text right (7) */}
        <div id="community" className="rv relative rounded-2xl border border-fg/10 bg-fg/[0.02] hover:bg-fg/[0.04] transition-colors overflow-hidden flex flex-col lg:flex-row lg:col-span-12">
          <div className="relative shrink-0 lg:w-[41.6%] order-last lg:order-first flex items-center justify-center p-10 min-h-[240px]">
            <div className="h-full max-h-[360px] aspect-square">
              <GlobeMini />
            </div>
          </div>
          <div className="p-6 md:p-8 flex flex-col min-w-0 flex-1 lg:max-w-xl">
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">FOR THE OPEN-MODEL COMMUNITY</div>
            <h3 className="pixel-serif text-fg text-2xl md:text-3xl leading-tight">Own a piece</h3>
            <p className="pixel-sans text-fg-70 text-sm mt-3 leading-relaxed max-w-md">
              Open models need open infrastructure to run on. Network revenue funds the treasury: half
              burns <span className="dollar">$</span>ZERO, half pays the people who stake it.
            </p>
            <Links
              items={[
                { href: '/treasury', text: 'Treasury →' },
                { href: brand.urls.data, text: 'Network data →', external: true },
              ]}
            />
            <div className="pt-6 mt-auto">
              <a href="/staking" className="hdr-btn pixel-sans text-sm font-medium">
                <span>Explore <span className="dollar">$</span>ZERO</span>
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
