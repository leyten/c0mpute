'use client';

// Standing instructions for one conversation. A popover above the composer,
// same materials as the model menu: solid pop surface, large radius, fills
// instead of borders. What you write here rides in front of every request.
//
// The panel is the source of truth while it is open and writes back whenever
// it closes, including on unmount. The page mounts one per conversation and
// decides where a write lands, so a draft can never straddle two of them.
import { useEffect, useRef, useState } from 'react';

const MAX = 1000;

/** Starting points, meant to be edited after they land in the box. */
const PRESETS: { name: string; text: string }[] = [
  {
    name: 'Direct answers',
    text: 'Answer directly. Lead with the conclusion, then give the reasoning in a few sentences. Skip hedging and caveats unless they change the answer.',
  },
  {
    name: 'Step by step',
    text: 'Explain step by step for someone new to the topic. Define each term the first time it appears, give one small concrete example, and finish with a short recap.',
  },
  {
    name: 'Code first',
    text: 'Lead with working code. Keep prose to what is needed to run it, list the assumptions underneath, and prefer the standard library over new dependencies.',
  },
  {
    name: 'Research brief',
    text: 'Answer as a brief: the finding first, then the evidence behind it, then what would change the conclusion. Say plainly when something is unknown.',
  },
];

export default function Instructions({
  value, onCommit, onClose,
}: {
  value: string;
  onCommit: (v: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const box = useRef<HTMLTextAreaElement>(null);

  const latest = useRef(draft);
  const commit = useRef(onCommit);
  useEffect(() => { latest.current = draft; }, [draft]);
  useEffect(() => { commit.current = onCommit; }, [onCommit]);
  useEffect(() => () => { commit.current(latest.current.trim()); }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-instr]')) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  // The panel grows upward out of the composer, and on a phone it is taller
  // than the room above it: the top ran off the screen, taking the box and the
  // presets with it under the floating controls. Cap it and scroll inside.
  return (
    <div
      data-instr
      className="cu-fade absolute bottom-[calc(100%+8px)] left-4 right-4 z-40 rounded-2xl p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] max-md:max-h-[40dvh] max-md:overflow-y-auto md:right-auto md:w-[26rem]"
      style={{ background: 'var(--cu-pop)' }}
    >
      <p className="text-[13px] leading-[1.5]" style={{ color: 'var(--cu-dim)' }}>
        Standing instructions for this conversation, sent ahead of every message.
      </p>

      <textarea
        ref={box}
        rows={5}
        value={draft}
        maxLength={MAX}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onCommit(draft.trim())}
        placeholder="Answer in plain English, and say when something is uncertain."
        className="cu-scroll mt-3 block w-full resize-none rounded-xl px-3 py-2.5 text-[14px] leading-[1.6] outline-none placeholder:text-white/30"
        style={{ background: 'var(--cu-surface)', color: 'var(--cu-text)' }}
      />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => { setDraft(p.text); box.current?.focus(); }}
            className="cu-chip px-2.5 py-1 text-[12px]"
            style={{ color: 'var(--cu-dim)' }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12.5px]">
        <button
          onClick={() => { setDraft(''); box.current?.focus(); }}
          className="transition-colors hover:text-white/70"
          style={{ color: 'var(--cu-faint)' }}
        >
          Clear
        </button>
        <div className="flex items-center gap-3">
          {draft.length > MAX - 200 && (
            <span className="tabular-nums text-[12px]" style={{ color: 'var(--cu-faint)' }}>{draft.length}/{MAX}</span>
          )}
          <button onClick={onClose} className="transition-colors hover:text-white/90" style={{ color: 'var(--cu-dim)' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
