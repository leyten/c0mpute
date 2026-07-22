import StatusBadge from '@/components/StatusBadge';

// The honest arc as one slim strip: launching → roadmap → research.
const ITEMS = [
  { state: 'launching' as const, text: 'The betanet — frontier models sharded across user-owned GPUs' },
  { state: 'roadmap' as const, text: 'A control plane built to decentralize — no weights, no user data' },
  { state: 'research' as const, text: 'Verifiable training — same receipts, bigger jobs' },
];

export default function RoadmapStrip() {
  return (
    <section className="bg-black py-10 md:py-14 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 md:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-8">
        {ITEMS.map((it) => (
          <div key={it.state} className="flex items-center gap-3">
            <StatusBadge state={it.state} />
            <span className="pixel-sans text-white/60 text-xs md:text-sm">{it.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
