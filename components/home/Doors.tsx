// Three audience doors — every CTA lands on an existing surface.
export default function Doors() {
  return (
    <section id="doors" className="bg-black py-16 md:py-24 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">Pick your door</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Door 1 — Developers */}
          <div id="developers" className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8 flex flex-col">
            <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Developers</h3>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed">
              One API, served by a network instead of a data center — every response backed by the receipts
              underneath it.
            </p>
            <div className="mt-5 mb-6 flex flex-col gap-2.5">
              <a href="/chat" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Try it live →</a>
              <a href="https://docs.c0mpute.ai/api" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Betanet API — at launch →</a>
            </div>
            <a
              href="https://docs.c0mpute.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer pixel-serif-logo text-sm px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors text-center"
              style={{ marginTop: 'auto' }}
            >
              Read the docs
            </a>
          </div>
          {/* Door 2 — GPU owners */}
          <div id="gpu-owners" className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8 flex flex-col">
            <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">GPU Owners</h3>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed">
              Your idle hardware earns USDC for real work — from a browser tab today, a full node when the
              betanet opens. No lock-in; leave whenever.
            </p>
            <div className="mt-5 mb-6 flex flex-col gap-2.5">
              <a href="/earn" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Earn in your browser →</a>
              <a href="https://docs.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Run a full node — at launch →</a>
            </div>
            <a
              href="/earn"
              className="cursor-pointer pixel-serif-logo text-sm px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors text-center"
              style={{ marginTop: 'auto' }}
            >
              Start earning
            </a>
          </div>
          {/* Door 3 — Open-model community */}
          <div id="community" className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8 flex flex-col">
            <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Open-Model Community</h3>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed">
              Open models need open infrastructure to run on. Network revenue funds the treasury — half
              burns <span className="dollar">$</span>ZERO, half pays the people who stake it.
            </p>
            <div className="mt-5 mb-6 flex flex-col gap-2.5">
              <a href="/treasury" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Treasury →</a>
              <a href="https://data.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Network data →</a>
            </div>
            <a
              href="/staking"
              className="cursor-pointer pixel-serif-logo text-sm px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors text-center"
              style={{ marginTop: 'auto' }}
            >
              Explore <span className="dollar">$</span>ZERO
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
