'use client';

// The composer: the instrument's playing surface. Enter sends, Shift+Enter
// breaks a line, Esc stops generation (wired globally), pasted or attached
// images ride along for vision models. When the anon lane is spent it swaps
// itself for a sign-in bar.

import { useCallback, useRef } from 'react';
import { ANON_FREE_LIMIT } from '../../lib';
import { MAX_INPUT_CHARS } from './types';
import type { Instrument } from './useInstrument';

export default function Composer({ inst, inputRef }: {
  inst: Instrument;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { engine, currentPlan } = inst;
  const fileRef = useRef<HTMLInputElement>(null);

  const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inst.setInput(e.target.value);
    if (inst.notice) inst.setNotice(null);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inst]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inst.submit();
      const el = inputRef.current;
      if (el) el.style.height = 'auto';
    }
  }, [inst, inputRef]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    if (!currentPlan.vision) return;
    const files = e.clipboardData?.files;
    if (files && files.length > 0 && Array.from(files).some(f => f.type.startsWith('image/'))) {
      e.preventDefault();
      inst.addImageFiles(files);
    }
  }, [currentPlan.vision, inst]);

  // Anon lane spent: the composer's honest replacement.
  const anonSpent = !engine.isAuthenticated && engine.anonRemaining !== null && engine.anonRemaining <= 0;
  if (anonSpent) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="pixel-sans text-sm text-white/70">
          Your {ANON_FREE_LIMIT} free prompts are used. Sign in to keep going.
        </div>
        <button
          onClick={() => engine.login()}
          className="pixel-sans cursor-pointer rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
        >
          Sign in
        </button>
      </div>
    );
  }

  const overLimit = inst.input.length > MAX_INPUT_CHARS;
  const nearLimit = inst.input.length > MAX_INPUT_CHARS - 400;
  const canSend = !inst.turn && !engine.busy && (inst.input.trim().length > 0 || inst.pendingImages.length > 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors focus-within:border-white/20">
      {inst.pendingImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {inst.pendingImages.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="pending attachment" className="h-16 w-16 rounded-md border border-white/10 object-cover" />
              <button
                onClick={() => inst.removeImage(i)}
                aria-label="remove image"
                className="pixel-sans absolute -right-1.5 -top-1.5 h-5 w-5 cursor-pointer rounded-full border border-white/20 bg-[#0c0a09] text-[10px] leading-none text-white/70 hover:text-white"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {inst.notice && <div className="pixel-sans mb-2 text-xs text-red-200/90">{inst.notice}</div>}

      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          rows={1}
          value={inst.input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={inst.turn ? 'Generating, Esc stops it' : 'Ask the network'}
          className="pixel-sans max-h-[200px] min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-white/90 outline-none placeholder:text-white/30"
        />
        <div className="flex shrink-0 items-center gap-2 pb-0.5">
          {(nearLimit || overLimit) && (
            <span className={`pixel-sans text-[11px] ${overLimit ? 'text-red-300' : 'text-white/35'}`}>
              {inst.input.length}/{MAX_INPUT_CHARS}
            </span>
          )}
          {currentPlan.vision && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={inst.pendingImages.length >= 4}
                className="pixel-sans cursor-pointer text-xs text-white/40 transition-colors hover:text-white/80 disabled:cursor-default disabled:opacity-40"
              >
                attach{inst.pendingImages.length > 0 ? ` ${inst.pendingImages.length}/4` : ''}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  if (e.target.files) inst.addImageFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          {inst.turn ? (
            <button
              onClick={inst.cancel}
              className="pixel-sans cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition-colors hover:text-white"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={inst.submit}
              className={`pixel-sans rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black transition-opacity ${
                canSend ? 'cursor-pointer hover:bg-white/90' : 'cursor-default opacity-40'
              }`}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
