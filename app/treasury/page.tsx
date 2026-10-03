'use client';

import SiteNav from '@/components/SiteNav';

// Public treasury dashboard. Every figure comes from /api/treasury (polled every
// 30s) and /api/treasury/history; nothing on this page is estimated client-side.
// Presentation: editorial money surface (Newsreader figures, Inter labels), with
// the $ZERO flywheel expressed once as a diagram strip.
import TreasuryPanel from '@/components/treasury/TreasuryPanel';

const card = 'border border-fg/10 bg-fg/[0.02] rounded-2xl';

export default function TreasuryPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />

      <main className="pt-32 pb-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Page lede */}
          <div className="mb-8 flow-root">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/art/treasury-bonfire.png" width={200} height={176} alt="" aria-hidden="true" className="dither-art mb-6 md:float-right md:ml-8 md:mb-0" />
            <h1 className="pixel-serif text-fg text-4xl md:text-5xl mb-3">Treasury</h1>
            <p className="pixel-sans text-fg-70 text-sm max-w-2xl">
              The compute margin and a share of <span className="dollar">$</span>ZERO trading fees accumulate here.
              Half buys back and burns <span className="dollar">$</span>ZERO; half is paid to stakers in <span className="dollar">$</span>USDC.
            </p>
          </div>

          <TreasuryPanel />

          {/* Cross-link: the staker half of the flywheel is one page away. */}
          <div className={`${card} mt-10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
            <div>
              <div className="pixel-serif text-fg text-xl">Earn the staker half</div>
              <p className="pixel-sans text-fg-60 text-sm mt-1">
                Stake <span className="dollar">$</span>ZERO from self-custody and receive <span className="dollar">$</span>USDC from every distribution.
              </p>
            </div>
            <a href="/staking" className="btn-ink pixel-sans text-sm font-medium px-6 py-2.5 rounded-xl bg-fg text-on-fg hover:bg-fg/90 transition-colors whitespace-nowrap">
              Stake <span className="dollar">$</span>ZERO
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
