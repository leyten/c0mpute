import { STEPS, LIFECYCLE_SUMMARY } from './steps';

// The 8-step spine as one readable chain: number + word, arrows between,
// one condensed paragraph underneath instead of eight one-liners.
export default function LifecycleFlow({ large = false }: { large?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 md:gap-x-4 gap-y-3 md:gap-y-5">
        {STEPS.map((s, i) => (
          <span key={s.n} className="flex items-baseline gap-3 md:gap-4">
            <span className="flex items-baseline gap-2">
              <span className="pixel-sans step-num text-white/40 text-xs md:text-sm">{s.n}</span>
              <span className={`pixel-serif text-white ${large ? 'text-2xl md:text-4xl' : 'text-xl md:text-3xl'}`}>{s.title}</span>
            </span>
            {i < STEPS.length - 1 && (
              <span className={`text-white/25 ${large ? 'text-xl md:text-3xl' : 'text-lg md:text-2xl'}`}>→</span>
            )}
          </span>
        ))}
      </div>
      <p className="pixel-sans text-white/60 text-sm md:text-base leading-relaxed max-w-3xl mx-auto text-center mt-8 md:mt-10">
        {LIFECYCLE_SUMMARY}
      </p>
    </div>
  );
}
