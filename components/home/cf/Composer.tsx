'use client';

// The product's own composer as a CTA — the same slab as the chat surface,
// extracted from HeroBlock so the hero card and the closing band share one
// control. Colors come from the chat vars, which the ink card restates dark.
import { useState } from 'react';

export default function Composer({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(prompt); }} className="w-full">
      <div
        className="flex items-center gap-1.5 rounded-[18px] pl-5 pr-2.5 py-2.5"
        style={{ background: 'var(--chat-surface)' }}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask the impossible."
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] leading-[1.6] outline-none placeholder:opacity-50"
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
  );
}
