import StatusBadge from '@/components/StatusBadge';

// The moat, as three mechanisms. Present tense only for built primitives;
// reputation/staking/slashing stays future-mood (roadmap).
export default function Verification({ stacked = false }: { stacked?: boolean }) {
  return (
    <div className={stacked ? 'flex flex-col gap-6 md:gap-8' : 'grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10'}>
      <div className="border-t border-white/15 pt-5 md:pt-6">
        <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Signed Receipts</h3>
        <p className="pixel-sans text-white/70 text-sm leading-relaxed">
          Every stage of every job emits a signed receipt: an activation hash-chain, the GPU that did it,
          real latencies, the output hash. The work carries its own audit trail.
        </p>
      </div>
      <div className="border-t border-white/15 pt-5 md:pt-6">
        <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Lossless Verify + Spot-Checks</h3>
        <p className="pixel-sans text-white/70 text-sm leading-relaxed">
          Speculative decoding re-checks tokens structurally — a stage whose outputs diverge is caught in
          the act. On top of that, random blocks are recomputed on trusted nodes and compared.
        </p>
      </div>
      <div className="border-t border-white/15 pt-5 md:pt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="pixel-serif text-white text-lg md:text-xl">Reputation, Staking &amp; Slashing</h3>
          <StatusBadge state="roadmap" />
        </div>
        <p className="pixel-sans text-white/70 text-sm leading-relaxed">
          Nodes will earn graded trust with every honest job, and trust will gate which roles they can
          hold. Staking buys the sensitive ones; detected cheating costs the stake. Skin in the game is
          what makes open membership safe.
        </p>
      </div>
    </div>
  );
}
