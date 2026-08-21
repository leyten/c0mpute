'use client';

// The two audiences who can act today, routed above the mechanism. Card A is
// the page's ink focal cell (GPU owners — supply is the constraint); card B
// speaks to developers in their own language: a curl block, not a diagram.
// Rates come from the earn page's own constant so the two can never drift.
import CoinsIdle from '../CoinsIdle';
import Reveal from './Reveal';
import { NATIVE_RATE } from '@/app/earn/shared';
import { useBrand } from '@/components/BrandProvider';

export default function TwoDoors() {
  const brand = useBrand();
  return (
    <section id="doors" className="px-4 md:px-6">
      <Reveal className="max-w-[1080px] mx-auto text-center">
        <h2 className="rv pixel-serif text-fg text-3xl md:text-[48px] md:leading-none">Two ways in</h2>
      </Reveal>
      <Reveal className="max-w-[1480px] mx-auto mt-14 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* GPU owners — the ink cell */}
        <div id="gpu-owners" className="rv ink-card hdr-on-ink rounded-2xl overflow-hidden flex flex-col">
          <div className="p-6 md:p-10 flex flex-col min-w-0">
            <div className="pixel-sans text-white/50 text-xs tracking-widest mb-3">FOR GPU OWNERS</div>
            <h3 className="pixel-serif text-white text-2xl md:text-3xl leading-tight">Put your GPU to work</h3>
            <p className="pixel-sans text-white/70 text-sm md:text-base mt-3 leading-relaxed max-w-md">
              A browser tab pays $0.07 a job. Your own machine pays {NATIVE_RATE}. Paid in USDC on
              Solana. Start and stop whenever you want.
            </p>
            <p className="pixel-sans text-white/45 text-xs mt-3 leading-relaxed max-w-md">
              Sign in to start. The native worker needs Node.js 18 and an NVIDIA, AMD or Apple
              Silicon GPU.
            </p>
            <div className="mt-6 flex items-center gap-5">
              <a href="/earn" className="hdr-btn hdr-btn-primary pixel-sans text-sm font-medium" style={{ '--fg': '#ffffff', '--on-fg': '#0c0a09' } as React.CSSProperties}>
                <span>Start earning</span>
              </a>
              <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors">
                Run a full node →
              </a>
            </div>
          </div>
          <div className="relative flex-1 min-h-[170px] flex items-end justify-center pb-6 px-10">
            <div className="w-full max-w-[420px] aspect-[5/2] light:invert">
              <CoinsIdle />
            </div>
          </div>
        </div>

        {/* Developers — the curl block is the art */}
        <div id="developers" className="rv relative rounded-2xl border border-fg/10 bg-fg/[0.02] hover:bg-fg/[0.04] transition-colors overflow-hidden flex flex-col">
          <div className="p-6 md:p-10 flex flex-col min-w-0 flex-1">
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">FOR DEVELOPERS</div>
            <h3 className="pixel-serif text-fg text-2xl md:text-3xl leading-tight">OpenAI-compatible, live now</h3>
            <p className="pixel-sans text-fg-70 text-sm md:text-base mt-3 leading-relaxed max-w-md">
              Change the base URL and the key. Every response is backed by the receipts underneath
              it. The betanet API opens at launch.
            </p>
            <pre className="mt-6 rounded-lg bg-recess-soft border border-fg/10 p-4 overflow-x-auto text-[12.5px] leading-relaxed text-fg-70" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
{`curl ${brand.urls.api}/chat/completions \\
  -H "Authorization: Bearer $KEY" \\
  -d '{"model": "qwen3.8-27b-uncensored", "messages": [...]}'`}
            </pre>
            <div className="mt-auto pt-6 flex items-center gap-5">
              <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className="hdr-btn pixel-sans text-sm font-medium">
                <span>Read the docs</span>
              </a>
              <a href={`${brand.urls.docs}/api`} target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
                API reference →
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
