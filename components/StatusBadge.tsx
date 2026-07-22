// Honesty-as-structure: every section carries its status at the point of claim.
// live = clickable today · launching = betanet (dated demos / future tense only)
// roadmap = designed, not built · research = open problems, no delivery implied.
export default function StatusBadge({ state }: { state: 'live' | 'launching' | 'roadmap' | 'research' }) {
  return (
    <span className="pixel-sans text-[10px] tracking-widest uppercase border border-white/15 rounded-md px-2 py-0.5 inline-flex items-center gap-1.5 align-middle">
      {state === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 inline-block" />}
      <span className={state === 'live' ? 'text-emerald-300/90' : 'text-white/50'}>{state}</span>
    </span>
  );
}
