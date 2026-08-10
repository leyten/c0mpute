'use client';

import { useState } from 'react';

// The block the page opens with, and the block the scroll story closes with:
// headline, one line of copy, and the product's own composer. One component so
// the two instances can never drift — the submit handler is the page's, passed
// in, so both composers do exactly the same thing.
export default function HeroBlock({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');

  return (
    <div className="w-full max-w-6xl mx-auto px-5 md:px-6">
      <div className="max-w-2xl mx-auto md:mx-0 text-center md:text-left space-y-6">
        <h1 className="pixel-serif text-fg text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
          The founding layer<br />of decentralized AI
        </h1>
        <p className="pixel-sans text-fg-90 text-sm md:text-lg max-w-lg mx-auto md:mx-0">
          A permissionless network of user-owned GPUs doing verifiable AI work.
        </p>
        {/* The same slab as the chat composer, not a bordered input with a
            button bolted to its side: one rounded surface, the field
            transparent inside it, the arrow living in the slab. The hero is
            a preview of the product, so it should use the product's control. */}
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(prompt); }}
          className="w-full max-w-xl mx-auto md:mx-0 pt-2"
        >
          <div
            className="flex items-center gap-1.5 rounded-[18px] pl-5 pr-2.5 py-2.5"
            style={{ background: 'var(--chat-surface)' }}
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask the impossible."
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] leading-[1.6] outline-none placeholder:text-fg-30"
              style={{ color: 'var(--chat-text)' }}
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!prompt.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-all duration-150 hover:bg-[var(--chat-row-on)] active:scale-95 disabled:hover:bg-transparent"
              style={{ color: prompt.trim() ? 'var(--chat-text)' : 'var(--chat-faint)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
