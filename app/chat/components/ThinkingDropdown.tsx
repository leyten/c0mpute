'use client';

import { useState } from 'react';

// Collapsible reasoning block for thinking models. Shows an animated
// "Thinking" label while the model is still inside <think>, and a
// "Thought for Xs" summary once the answer starts.
//
// The duration is only ever shown when one was MEASURED. It used to fall back
// to the word count over five, which reads as a real number and is not one: a
// job that thought for 61s was labelled "Thought for 692s" on the failure path,
// where nothing measures the time.
export default function ThinkingDropdown({ thinking, isStreaming, elapsedSeconds, defaultOpen }: { thinking: string; isStreaming?: boolean; elapsedSeconds?: number; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-fg-60 hover:text-fg transition-colors text-sm pixel-sans cursor-pointer"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {isStreaming ? (
          <span className="inline-flex">
            Thinking
            <span className="thinking-dots">
              <span className="dot">.</span>
              <span className="dot">.</span>
              <span className="dot">.</span>
            </span>
          </span>
        ) : (
          <span>{elapsedSeconds === undefined ? 'Thought' : `Thought for ${elapsedSeconds}s`}</span>
        )}
      </button>
      {isOpen && (
        <div className="mt-2 ml-5 pl-3 border-l border-fg/10 text-fg-60 text-[15px] leading-relaxed whitespace-pre-wrap pixel-sans">
          {thinking}
        </div>
      )}
    </div>
  );
}
