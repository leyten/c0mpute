// Honesty-as-structure: every section carries its status at the point of claim.
// live = clickable today · launching = betanet (dated demos / future tense only)
// roadmap = designed, not built · research = open problems, no delivery implied.
export default function StatusBadge({ state }: { state: 'live' | 'launching' | 'roadmap' | 'research' }) {
  return (
    <span className={`pixel-sans badge-chip ${state === 'live' ? 'badge-live' : ''}`}>
      {state === 'live' && <span className="badge-dot" />}
      {state}
    </span>
  );
}
