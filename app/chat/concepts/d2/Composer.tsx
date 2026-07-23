'use client';

// The room composer. Keyed by conversation id from the room, so drafts stay
// with their conversation across context switches. The anon sign-in gate lives
// here, at the point of action; the rest of the desk stays readable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Plan } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { imgSrc, type Prompt } from './store';
import { IconArrowUp, IconImage, IconX } from './Icons';
import ModelMenu from './ModelMenu';
import PromptDrawer from './PromptDrawer';

// Matches the orchestrator's MAX_INPUT_CHARS server cap.
const MAX_INPUT = 2000;
const MAX_IMAGES = 4;

export default function Composer({ engine, plan, think, getDraft, onDraftChange, busyHere, busyElsewhere, anonBlocked, prompts, onSend, onSelectModel, onToggleThink, onSavePrompt, onDeletePrompt }: {
  engine: ChatEngine;
  plan: Plan;
  think: boolean;
  /** Read once at mount (the composer remounts per conversation). */
  getDraft: () => string;
  onDraftChange: (t: string) => void;
  busyHere: boolean;
  busyElsewhere: boolean;
  anonBlocked: boolean;
  prompts: Prompt[];
  onSend: (text: string, images: string[]) => boolean;
  onSelectModel: (id: Plan['id']) => void;
  onToggleThink: () => void;
  onSavePrompt: (name: string, body: string) => void;
  onDeletePrompt: (id: string) => void;
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
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

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

  // A prompt inserted from the drawer replaces the draft and hands focus back.
  const insertPrompt = useCallback((body: string) => {
    setText(body);
    onDraftChange(body);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }, [onDraftChange]);

  const note = busyHere
    ? null
    : busyElsewhere
      ? 'the network is serving your other conversation. one job runs at a time.'
      : !engine.connected
        ? 'Connecting to the network.'
        : engine.live && engine.workerCount(plan) === 0
          ? `0 workers are serving ${plan.name} right now. Your job will wait in the queue.`
          : null;

  return (
    <div className="border-t border-white/10 shrink-0 bg-[#0c0a09]">
      <div className="max-w-3xl mx-auto px-3 md:px-6 pt-3 pb-3 md:pb-4">
        {gated ? (
          <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-6 text-center">
            <p className="pixel-serif text-xl text-white">Sign in to keep going</p>
            <p className="pixel-sans text-sm text-white/50 mt-2 max-w-sm mx-auto leading-relaxed">
              {engine.anonCapReached
                ? 'The free lane is closed for today. Sign in with X to continue with credits.'
                : 'Your free prompts are used up. Sign in with X to continue with credits.'}
            </p>
            <button
              onClick={() => engine.login()}
              className="cursor-pointer mt-4 pixel-sans text-sm font-medium bg-white text-black rounded-full px-6 py-2.5 hover:bg-white/90 transition-colors"
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
                    <img src={imgSrc(img)} alt="attachment" className="w-16 h-16 object-cover rounded-lg border border-white/10" />
                    <button
                      onClick={() => setAttached(prev => prev.filter((_, j) => j !== i))}
                      className="cursor-pointer absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#161311] border border-white/20 text-white/70 hover:text-white flex items-center justify-center"
                      title="remove"
                    >
                      <IconX className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end pl-1 mb-[-1px]">
              <PromptDrawer
                prompts={prompts}
                draft={text}
                onInsert={insertPrompt}
                onSave={onSavePrompt}
                onDelete={onDeletePrompt}
              />
            </div>

            <div className="border border-white/10 focus-within:border-white/25 rounded-2xl rounded-tl-none bg-white/[0.02] transition-colors">
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
                placeholder={`write to ${plan.name}`}
                className="w-full resize-none bg-transparent outline-none px-4 pt-3.5 pb-1 pixel-sans text-[15px] text-white/90 placeholder:text-white/30"
              />
              <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
                <ModelMenu engine={engine} current={plan.id} onSelect={onSelectModel} />
                {plan.thinking && (
                  <button
                    onClick={onToggleThink}
                    title="deep thinking: the model reasons before answering"
                    className={`cursor-pointer pixel-sans text-[11px] uppercase tracking-[0.1em] rounded-full px-3 py-1.5 border transition-colors ${
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
                    className={`cursor-pointer rounded-full p-2 border border-white/10 text-white/40 hover:text-white/80 hover:border-white/25 transition-colors ${images.length >= MAX_IMAGES ? 'opacity-40 pointer-events-none' : ''}`}
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
                <button
                  onClick={trySend}
                  disabled={!canSend}
                  title="send"
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    canSend ? 'cursor-pointer bg-white text-black hover:bg-white/90' : 'bg-white/10 text-white/30'
                  }`}
                >
                  <IconArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {note && <p className="pixel-sans text-[11px] text-white/35 mt-2">{note}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pixel-sans text-[11px] text-white/35">
              {engine.isAuthenticated ? (
                <>
                  <Link href="/settings#usage" className="hover:text-white/70 transition-colors">
                    {engine.credits.balance ?? '…'} credits · usage
                  </Link>
                  {engine.credits.freePrompts !== null && engine.credits.freeLimit !== null && (
                    <span>{engine.credits.freePrompts} of {engine.credits.freeLimit} free prompts</span>
                  )}
                  <Link href="/staking" className="hover:text-white/70 transition-colors">
                    {engine.credits.stakerAllowance > 0
                      ? `${engine.credits.stakerAllowance} staker prompts · staking`
                      : 'stake for daily prompts'}
                  </Link>
                </>
              ) : (
                <>
                  <span>{engine.anonRemaining ?? 0} free prompts left today</span>
                  <button onClick={() => engine.login()} className="cursor-pointer hover:text-white/70 transition-colors">
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
