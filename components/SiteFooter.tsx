'use client';

import { LogoMark } from '@/components/Logo';
import { useBrand } from '@/components/BrandProvider';

// The site footer, shared by the homepage and /network.
export default function SiteFooter() {
  const brand = useBrand();
  return (
    <footer className="border-t border-fg/10 mt-8">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div>
            <a href="/" className="pixel-serif-logo text-fg text-lg flex items-center gap-2">
              {brand.mark ? (
                <>
                  <LogoMark className="w-6 h-6 shrink-0" />
                  <span>Compute Network</span>
                </>
              ) : (
                <span>
                  c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
                </span>
              )}
            </a>
            <p className="pixel-sans text-fg-40 text-xs mt-3 max-w-[220px]">
              AI infrastructure should be open, verifiable, and owned by the people who run it.
            </p>
          </div>
          <div>
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">PRODUCT</div>
            <div className="flex flex-col gap-2">
              <a href="/chat" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Chat</a>
              <a href="/create" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Create</a>
              <a href="/earn" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Earn</a>
              <a href={`${brand.urls.docs}/api`} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">API</a>
            </div>
          </div>
          <div>
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">NETWORK</div>
            <div className="flex flex-col gap-2">
              <a href="/network" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Network</a>
              <a href="/staking" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Staking</a>
              <a href="https://docs.compute.tech" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Docs</a>
              <a href="https://github.com/leyten/shard" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">GitHub</a>
            </div>
          </div>
          <div>
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3"><span className="dollar">$</span>ZERO</div>
            <div className="flex flex-col gap-2">
              <a href="/staking" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Staking</a>
              <a href="/treasury" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Treasury</a>
              <a href={brand.urls.data} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Data</a>
            </div>
          </div>
          <div>
            <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">RESOURCES</div>
            <div className="flex flex-col gap-2">
              <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Docs</a>
              <a href={brand.urls.blog} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Blog</a>
              <a href="https://x.com/computenet_" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">X</a>
              <a href="https://t.me/c0mputeAI" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Telegram</a>
            </div>
          </div>
        </div>

        {/* Operating entity + legal links. Reviewers look for the corporation by
            name, so this is not decorative. New brand only until cutover. */}
        {brand.legalFooter && (
          <div className="mt-10 pt-6 border-t border-fg/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="pixel-sans text-fg-40 text-xs">
              &copy; {new Date().getFullYear()} Compute Network Inc.
            </div>
            <div className="flex items-center gap-5">
              <a href="/terms" className="pixel-sans text-fg-40 hover:text-fg transition-colors text-xs">Terms</a>
              <a href="/privacy" className="pixel-sans text-fg-40 hover:text-fg transition-colors text-xs">Privacy</a>
              <a href="/acceptable-use" className="pixel-sans text-fg-40 hover:text-fg transition-colors text-xs">Acceptable Use</a>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
