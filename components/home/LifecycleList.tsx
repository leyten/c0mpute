import { STEPS } from './steps';

// The 8-step spine as a vertical editorial list — used beside a sticky heading.
export default function LifecycleList() {
  return (
    <div>
      {STEPS.map((s) => (
        <div key={s.n} className="border-t border-white/15 py-4 md:py-5 flex gap-4 md:gap-6">
          <span className="pixel-serif step-num text-white/40 text-lg md:text-xl w-8 shrink-0">{s.n}</span>
          <div>
            <h3 className="pixel-serif text-white text-lg md:text-xl">{s.title}</h3>
            <p className="pixel-sans text-white/60 text-sm mt-1 leading-relaxed">{s.line}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
