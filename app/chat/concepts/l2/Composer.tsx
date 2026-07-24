'use client';

// The composer, built like an instrument: one hairline field that grows
// smoothly, a control row on an exact 8px rhythm, and a send key that becomes
// the stop key while a job runs. Keyed by chat id from the thread, so drafts
// stay with their conversation across switches. The anon sign-in gate lives
// here, at the point of action.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Plan } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { imgSrc } from './store';
import { IconArrowUp, IconImage, IconStop, IconX } from './Icons';
import ModelMenu from './ModelMenu';

// Matches the orchestrator's MAX_INPUT_CHARS server cap.
const MAX_INPUT = 2000;
const MAX_IMAGES = 4;
const MAX_FIELD_PX = 168; // ~7 lines before the field scrolls internally

export default function Composer({ engine, plan, think, getDraft, onDraftChange, busyHere, busyElsewhere, anonBlocked, onSend, onStop, onSelectModel, onToggleThink }: {
  engine: ChatEngine;
  plan: Plan;
  think: boolean;
  /** Read once at mount (the composer remounts per conversation). */
  getDraft: () => string;
  onDraftChange: (t: string) => void;
  busyHere: boolean;
  busyElsewhere: boolean;
  anonBlocked: boolean;
  onSend: (text: string, images: string[]) => boolean;
  onStop: () => void;
  onSelectModel: (id: Plan['id']) => void;
  onToggleThink: () => void;
}) {
  const [text, setText] = useState(getDraft);
  const [attached, setAttached] = useState<string[]>([]);
  // Text-only models reject multimodal input; attachments only count for
  // vision models (and reappear if the user switches back).
  const images = useMemo(() => (plan.vision ? attached : []), [plan.vision, attached]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Smooth growth: measure at auto height, restore the previous height, force
  // a reflow, then set the new value so the 130ms height transition always
  // starts from where the field actually was.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const prev = el.style.height;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_FIELD_PX);
    el.style.overflowY = el.scrollHeight > MAX_FIELD_PX ? 'auto' : 'hidden';
    el.style.height = prev || `${next}px`;
    void el.offsetHeight;
    el.style.height = `${next}px`;
  }, [text]);

  // Focus the field on mount, but only where a hardware keyboard is likely —
  // popping the software keyboard on phones is hostile.
  useEffect(() => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) taRef.current?.focus();
  }, []);

  const gated = !engine.authLoading && !engine.isAuthenticated &&
    (anonBlocked || engine.anonCapReached || (engine.anonRemaining !== null && engine.anonRemaining <= 0));

  const overLimit = text.length > MAX_INPUT;
  const canSend = !gated && !busyHere && !busyElsewhere && engine.connected && !overLimit &&
    (text.trim().length > 0 || images.length > 0);

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .slice(0, MAX_IMAGES)
      .forEach(f => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = reader.result;
          if (typeof s === 'string') setAttached(prev => (prev.length < MAX_IMAGES ? [...prev, s] : prev));
        };
        reader.readAsDataURL(f);
      });
  }, []);

  const trySend = useCallback(() => {
    if (!canSend) return;
    if (onSend(text.trim(), images)) {
      setText('');
      setAttached([]);
      onDraftChange('');
    }
  }, [canSend, onSend, text, images, onDraftChange]);

  const note = busyHere
    ? null
    : busyElsewhere
      ? 'The network is writing in another conversation. One job runs at a time.'
      : !engine.connected
        ? 'Connecting to the network.'
        : engine.live && engine.workerCount(plan) === 0
          ? `0 workers are serving ${plan.name} right now. Your job will wait in the queue.`
          : null;

  return (
    <div className="border-t border-white/10 shrink-0" style={{ background: '#0b0c0e' }}>
      <div
        className="max-w-[44rem] mx-auto px-4 md:px-6 pt-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        {gated ? (
          <div className="border border-white/10 rounded-lg bg-white/[0.02] px-6 py-6 text-center">
            <p className="pixel-serif text-xl text-white">Sign in to keep going</p>
            <p className="pixel-sans text-[13px] leading-5 text-white/50 mt-2 max-w-sm mx-auto">
              {engine.anonCapReached
                ? 'The free lane is closed for today. Sign in with X to continue with credits.'
                : 'Your free prompts are used up. Sign in with X to continue with credits.'}
            </p>
            <button
              onClick={() => engine.login()}
              className="cursor-pointer mt-4 h-8 px-5 pixel-sans text-[13px] font-medium bg-white text-black rounded-md hover:bg-white/90 active:scale-[0.98] transition-[background-color,transform] duration-150 ease-out"
            >
              sign in with X
            </button>
          </div>
        ) : (
          <>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgSrc(img)} alt="attachment" className="w-12 h-12 object-cover rounded-md border border-white/10" />
                    <button
                      onClick={() => setAttached(prev => prev.filter((_, j) => j !== i))}
                      className="cursor-pointer absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#14161a] border border-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors duration-150"
                      title="remove"
                    >
                      <IconX className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-white/10 focus-within:border-[#80a0c1]/40 rounded-lg bg-white/[0.02] transition-colors duration-150 ease-out">
              <textarea
                ref={taRef}
                rows={1}
                value={text}
                onChange={e => { setText(e.target.value); onDraftChange(e.target.value); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    trySend();
                  }
                }}
                onPaste={e => {
                  if (!plan.vision) return;
                  const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
                  if (files.length > 0) { e.preventDefault(); addFiles(files); }
                }}
                placeholder={`write to ${plan.name}`}
                className="l2-ta w-full resize-none bg-transparent outline-none px-4 pt-3 pb-1 pixel-sans text-[15px] leading-[22px] text-white/90 placeholder:text-white/30"
              />
              <div className="flex items-center gap-2 px-2 pb-2">
                <ModelMenu engine={engine} current={plan.id} onSelect={onSelectModel} />
                {plan.thinking && (
                  <button
                    onClick={onToggleThink}
                    aria-pressed={think}
                    title="deep thinking: the model reasons before answering"
                    className={`cursor-pointer h-7 px-2 pixel-sans text-[11px] uppercase tracking-[0.08em] rounded-md border transition-colors duration-150 ease-out ${
                      think
                        ? 'border-[#80a0c1]/50 text-[#80a0c1] bg-[#80a0c1]/10'
                        : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                    }`}
                  >
                    thinking
                  </button>
                )}
                {plan.vision && (
                  <label
                    className={`cursor-pointer h-7 w-7 flex items-center justify-center rounded-md border border-white/10 text-white/40 hover:text-white/80 hover:border-white/20 transition-colors duration-150 ease-out ${images.length >= MAX_IMAGES ? 'opacity-40 pointer-events-none' : ''}`}
                    title={`attach images, up to ${MAX_IMAGES}`}
                  >
                    <IconImage className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                )}
                <span className="flex-1" />
                {text.length > MAX_INPUT - 200 && (
                  <span className={`pixel-sans text-[11px] tabular-nums ${overLimit ? 'text-red-300' : 'text-white/35'}`}>
                    {text.length} / {MAX_INPUT}
                  </span>
                )}
                {busyHere ? (
                  <button
                    onClick={onStop}
                    title="stop generating"
                    className="cursor-pointer w-8 h-8 rounded-md border border-white/15 text-white/80 hover:text-white hover:border-white/30 flex items-center justify-center active:scale-[0.96] transition-[color,border-color,transform] duration-150 ease-out"
                  >
                    <IconStop className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={trySend}
                    disabled={!canSend}
                    title="send"
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-[background-color,color,transform] duration-150 ease-out ${
                      canSend
                        ? 'cursor-pointer bg-white text-black hover:bg-white/90 active:scale-[0.96]'
                        : 'bg-white/[0.06] text-white/25'
                    }`}
                  >
                    <IconArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {note && <p className="pixel-sans text-[11px] leading-4 text-white/40 mt-2">{note}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pixel-sans text-[11px] leading-4 text-white/35">
              {engine.isAuthenticated ? (
                <>
                  <Link href="/settings#usage" className="tabular-nums hover:text-white/70 transition-colors duration-150">
                    {engine.credits.balance ?? '…'} credits · usage
                  </Link>
                  {engine.credits.freePrompts !== null && engine.credits.freeLimit !== null && (
                    <span className="tabular-nums">{engine.credits.freePrompts} of {engine.credits.freeLimit} free prompts</span>
                  )}
                  <Link href="/staking" className="tabular-nums hover:text-white/70 transition-colors duration-150">
                    {engine.credits.stakerAllowance > 0
                      ? `${engine.credits.stakerAllowance} staker prompts · staking`
                      : 'stake for daily prompts'}
                  </Link>
                </>
              ) : (
                <>
                  <span className="tabular-nums">{engine.anonRemaining ?? 0} free prompts left today</span>
                  <button onClick={() => engine.login()} className="cursor-pointer hover:text-white/70 transition-colors duration-150">
                    sign in to add credits
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
