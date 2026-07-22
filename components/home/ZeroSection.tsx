import StatusBadge from '@/components/StatusBadge';

// The $ZERO flywheel — live tokenomics, kept from the current site.
export default function ZeroSection() {
  return (
    <section className="bg-black py-16 md:py-24 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3 flex items-center justify-center gap-2">
            <span>ECONOMICS</span>
            <StatusBadge state="live" />
          </div>
          <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">
            The <span className="dollar">$</span>ZERO Token
          </h2>
          <p className="pixel-sans text-white/70 text-sm md:text-base mt-4 max-w-2xl mx-auto">
            Revenue from compute and <span className="dollar">$</span>ZERO trading flows into the treasury. Half buys back and burns <span className="dollar">$</span>ZERO; half is paid to everyone who stakes it. The network&apos;s growth accrues straight to the token.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="pixel-serif text-white/60 text-3xl md:text-4xl">01</span>
            </div>
            <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
              Revenue Funds the Treasury
            </h3>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed">
              100% of the c0mpute margin and a share of every <span className="dollar">$</span>ZERO trade flow into the treasury, in <span className="dollar">$</span>USDC.
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="pixel-serif text-white/60 text-3xl md:text-4xl">02</span>
            </div>
            <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
              Buyback &amp; Burn
            </h3>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed">
              Half the treasury buys <span className="dollar">$</span>ZERO on the open market and burns it. Supply shrinks as the network grows.
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="pixel-serif text-white/60 text-3xl md:text-4xl">03</span>
            </div>
            <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
              Stake to Earn
            </h3>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed">
              Stake <span className="dollar">$</span>ZERO to earn the other half of the treasury in <span className="dollar">$</span>USDC. Workers who stake also earn a bigger share of every job they run.
            </p>
          </div>
        </div>

        <div className="mt-12 md:mt-16 text-center">
          <p className="pixel-sans text-white/60 text-xs md:text-sm max-w-xl mx-auto">
            Token trading funds the network. AI for the people, by the people.
          </p>
          <a
            href="https://docs.c0mpute.ai/zero-token"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-xs md:text-sm mt-3 inline-block transition-colors"
          >
            Learn more about <span className="dollar">$</span>ZERO →
          </a>
        </div>
      </div>
    </section>
  );
}
