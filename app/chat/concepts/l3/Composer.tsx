'use client';

// The composer: a floating slab of smoked glass at the foot of the thread.
// Keyed by conversation from the thread so drafts stay with their
// conversation across switches. The anon sign-in gate lives here, at the
// point of action.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Plan } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { imgSrc } from './store';
import { IconArrowUp, IconImage, IconStop, IconX } from './Icons';
import ModelMenu from './ModelMenu';

// Matches the orchestrator's MAX_INPUT_CHARS server cap.
const MAX_INPUT = 2000;
const MAX_IMAGES = 4;

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

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [text]);

  // Focus the page's one input on arrival, desktop only (mobile keyboards
  // should never pop uninvited).
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) taRef.current?.focus();
  }, []);

  const gated = !engine.authLoading && !engine.isAuthenticated &&
    (anonBlocked || engine.anonCapReached || (engine.anonRemaining !== null && engine.anonRemaining <= 0));

  const overLimit = text.length > MAX_INPUT;
  const canSend = !gated && !busyHere && !busyElsewhere && engine.connected && !overLimit &&
    (text.trim().length > 0 || images.length > 0);

  const addFiles = useCallback((files: FileList | null) => {
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

  if (gated) {
    return (
      <div className="l3-glass l3-rise rounded-[24px] p-6 text-center">
        <p className="pixel-serif text-xl text-white">Sign in to keep going</p>
        <p className="pixel-sans text-[13px] text-white/50 mt-2 max-w-sm mx-auto leading-relaxed">
          {engine.anonCapReached
            ? 'The free lane is closed for today. Sign in with X to continue with credits.'
            : 'Your free prompts are used up. Sign in with X to continue with credits.'}
        </p>
        <button
          onClick={() => engine.login()}
          className="l3-press cursor-pointer mt-4 pixel-sans text-sm font-medium bg-white text-black rounded-full px-6 py-2.5 hover:bg-white/90"
        >
          sign in with X
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="l3-glass rounded-[24px]">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {images.map((img, i) => (
              <div key={i} className="relative l3-fade">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc(img)} alt="attachment" className="w-14 h-14 object-cover rounded-lg border border-white/10" />
                <button
                  onClick={() => setAttached(prev => prev.filter((_, j) => j !== i))}
                  className="l3-press cursor-pointer absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#161311] border border-white/20 text-white/70 hover:text-white flex items-center justify-center"
                  title="remove"
                  aria-label="remove attachment"
                >
                  <IconX className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={e => { setText(e.target.value); onDraftChange(e.target.value); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              trySend();
            }
          }}
          placeholder={`message ${plan.name}`}
          className="w-full resize-none bg-transparent outline-none px-4 pt-3.5 pb-1 pixel-sans text-[15px] text-white/90 placeholder:text-white/30"
        />

        <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
          <ModelMenu engine={engine} current={plan.id} onSelect={onSelectModel} />
          {plan.thinking && (
            <button
              onClick={onToggleThink}
              title="deep thinking: the model reasons before answering"
              className={`l3-press cursor-pointer pixel-sans text-[11px] uppercase tracking-[0.1em] rounded-full px-3 py-1.5 border ${
                think
                  ? 'border-[#80a0c1]/50 text-[#80a0c1] bg-[#80a0c1]/10'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/25'
              }`}
            >
              thinking
            </button>
          )}
          {plan.vision && (
            <label
              className={`l3-press cursor-pointer rounded-full p-2 border border-white/10 text-white/40 hover:text-white/80 hover:border-white/25 ${images.length >= MAX_IMAGES ? 'opacity-40 pointer-events-none' : ''}`}
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
            <span className={`pixel-sans text-[11px] ${overLimit ? 'text-red-300' : 'text-white/35'}`}>
              {text.length} / {MAX_INPUT}
            </span>
          )}
          {busyHere ? (
            <button
              onClick={onStop}
              title="stop"
              aria-label="stop generating"
              className="l3-press cursor-pointer w-9 h-9 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center"
            >
              <IconStop className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={trySend}
              disabled={!canSend}
              title="send"
              aria-label="send message"
              className={`l3-press w-9 h-9 rounded-full flex items-center justify-center ${
                canSend ? 'cursor-pointer bg-white text-black hover:bg-white/90' : 'bg-white/[0.07] text-white/25'
              }`}
            >
              <IconArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 min-h-[1.1rem] px-2 text-center pixel-sans text-[11px] text-white/35">
        {note ? (
          <span>{note}</span>
        ) : !engine.authLoading && !engine.isAuthenticated ? (
          <span>
            {engine.anonRemaining ?? 0} free prompts left today ·{' '}
            <button onClick={() => engine.login()} className="cursor-pointer hover:text-white/70 transition-colors">
              sign in for credits
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
