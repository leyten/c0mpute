'use client';

import { useEffect, useRef } from 'react';

// The 18+ confirmation, as on /create. A real modal: focus moves in and is
// trapped, Esc or a click on the backdrop cancels, and focus goes back to
// whatever opened it (the switch) when it closes.
export function AdultGate({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const boxRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    boxRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      const box = boxRef.current;
      if (!box) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
      if (e.key !== 'Tab') return;
      const items = [...box.querySelectorAll<HTMLElement>('button')];
      const first = items[0], last = items[items.length - 1];
      const at = document.activeElement;
      if (!box.contains(at) || (e.shiftKey && at === first) || (!e.shiftKey && at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      {/* a <section>: globals.css restyles buttons inside div[role="dialog"] for Privy */}
      <section ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="st-gate-title" className="w-full max-w-md border border-fg/15 bg-background p-6">
        <h3 id="st-gate-title" className="pixel-serif mb-3 text-xl text-fg">Adult content (18+)</h3>
        <p className="pixel-sans mb-2 text-sm text-fg-70">
          Enabling 18+ allows generation of adult content. By continuing you confirm you are 18 or older and that adult content is legal where you live.
        </p>
        <p className="pixel-sans mb-5 text-xs text-fg-70">
          Sexual content involving minors is never generated and is permanently blocked.
        </p>
        <div className="flex gap-3">
          <button type="button" data-autofocus onClick={onCancel} className="pixel-sans flex-1 cursor-pointer border border-fg/15 px-4 py-2.5 text-sm text-fg-70 transition-colors hover:text-fg">Cancel</button>
          <button type="button" onClick={onConfirm} className="pixel-serif flex-1 cursor-pointer bg-fg px-4 py-2.5 text-sm text-on-fg transition-colors hover:bg-fg/90">I&apos;m 18+, continue</button>
        </div>
      </section>
    </div>
  );
}
