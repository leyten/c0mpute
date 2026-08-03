'use client';

// Select text inside an answer and a single quiet action appears over it:
// Ask about this. It only ever reads the selection, so copy, paste and the
// native context menu behave exactly as they did.
//
// Desktop only, on purpose. Touch platforms already own the selection with
// their own callout, and competing with it is worse than not offering this.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Answer bodies only, so the composer, the reasoning and the source strip are
 *  all out of scope. */
const HOST = '[data-answer]';
const MAX_QUOTE = 280;

type Spot = { x: number; y: number; text: string };

function quoteOf(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_QUOTE ? flat.slice(0, MAX_QUOTE).trimEnd() + '…' : flat;
}

export default function AskSelection({ onAsk }: { onAsk: (quote: string) => void }) {
  const [spot, setSpot] = useState<Spot | null>(null);

  const read = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSpot(null); return; }
    const text = sel.toString().trim();
    if (text.length < 2) { setSpot(null); return; }

    // the common ancestor, not the anchor: a selection that starts in an
    // answer and runs into the next bubble is not a quote from that answer
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const host = node instanceof Element ? node : node.parentElement;
    if (!host?.closest(HOST)) { setSpot(null); return; }

    const r = range.getBoundingClientRect();
    if (!r.width && !r.height) { setSpot(null); return; }
    setSpot({
      x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
      y: Math.max(r.top, 46),
      text,
    });
  }, []);

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    // after mouseup so the range is final, not mid-drag
    const up = () => {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(read, 0);
    };
    // keyboard selection: shift + a caret key, and nothing else
    const keyUp = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.startsWith('Arrow')) read();
    };
    const keyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setSpot(null); };
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-ask]')) setSpot(null);
    };
    const away = () => setSpot(null);

    document.addEventListener('mouseup', up);
    document.addEventListener('mousedown', down);
    document.addEventListener('keyup', keyUp);
    document.addEventListener('keydown', keyDown);
    // capture: the thread scrolls in its own container, not the window
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      if (settle.current) { clearTimeout(settle.current); settle.current = null; }
      document.removeEventListener('mouseup', up);
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keyup', keyUp);
      document.removeEventListener('keydown', keyDown);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [read]);

  if (!spot) return null;

  return (
    <button
      data-ask
      // keeps the selection alive through the click, so the quote is still there
      onMouseDown={e => e.preventDefault()}
      onClick={() => {
        onAsk(quoteOf(spot.text));
        window.getSelection()?.removeAllRanges();
        setSpot(null);
      }}
      className="cu-fade fixed z-50 -translate-x-1/2 -translate-y-full rounded-full px-3 py-1.5 text-[12.5px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]"
      style={{ left: spot.x, top: spot.y - 8, background: 'var(--cu-pop)', color: 'var(--cu-text)' }}
    >
      Ask about this
    </button>
  );
}
