'use client';

// The composer: a raised paper surface that grows quietly with the draft.
// Keyed by thread id from the parent, so drafts stay with their conversation.
// While the network writes here, the send button becomes stop. The anon
// sign-in gate replaces the surface at the point of action.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Plan, PlanId } from '../../lib';
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
  onSelectModel: (id: PlanId) => void;
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
    el.style.height = Math.min(el.scrollHeight, 190) + 'px';
  }, [text]);

  // Focus the page on entry, but never pop the keyboard on touch devices.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) taRef.current?.focus();
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

  // One quiet line under the surface; states in priority order.
  const whisper = busyElsewhere
    ? 'The network is writing in another conversation. One job runs at a time.'
    : !engine.connected
      ? 'Connecting to the network.'
      : engine.live && engine.workerCount(plan) === 0
        ? `0 workers are serving ${plan.name} right now. Your job will wait in the queue.`
        : !engine.isAuthenticated && engine.anonRemaining !== null
          ? `${engine.anonRemaining} free ${engine.anonRemaining === 1 ? 'prompt' : 'prompts'} left today`
          : 'Answers come from the open network and can be wrong.';

  if (gated) {
    return (
      <div className="shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-[42rem] mx-auto px-4 md:px-6 pb-4 md:pb-6">
          <div className="ln-enter ln-surface rounded-[1.3rem] px-6 py-7 text-center">
            <p className="pixel-serif text-[21px] ln-ink">Sign in to continue</p>
            <p className="pixel-sans text-[13px] ln-mute mt-2 max-w-[19rem] mx-auto leading-relaxed">
              {engine.anonCapReached
                ? 'The free lane is closed for today. Sign in with X to continue with credits.'
                : 'Your free prompts are used up. Sign in with X to continue with credits.'}
            </p>
            <button
              onClick={() => engine.login()}
              className="ln-btn-paper cursor-pointer mt-5 rounded-full px-6 py-2 pixel-sans text-[13px] font-medium"
            >
              sign in with X
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-[42rem] mx-auto px-4 md:px-6 pb-3 md:pb-5">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {images.map((img, i) => (
              <div key={i} className="ln-enter relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc(img)} alt="attachment" className="w-14 h-14 object-cover rounded-lg border ln-hair" />
                <button
                  onClick={() => setAttached(prev => prev.filter((_, j) => j !== i))}
                  title="remove"
                  className="ln-t cursor-pointer absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full ln-bg-pop border ln-hair-strong ln-faint ln-hov-ink flex items-center justify-center"
                >
                  <IconX className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="ln-surface rounded-[1.3rem]">
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
            onPaste={e => {
              if (plan.vision && e.clipboardData?.files?.length) addFiles(e.clipboardData.files);
            }}
            placeholder="message c0mpute"
            className="ln-ta w-full resize-none bg-transparent outline-none px-4.5 pt-3.5 pb-1 pixel-sans text-[16px] md:text-[15.5px] leading-[1.6] ln-ink placeholder:text-[rgba(237,230,216,0.3)]"
          />
          <div className="flex items-center gap-0.5 pl-2 pr-2.5 pb-2.5">
            <ModelMenu engine={engine} current={plan.id} onSelect={onSelectModel} />
            {plan.thinking && (
              <button
                onClick={onToggleThink}
                title="deep thinking: the model reasons before answering"
                className={`ln-t cursor-pointer pixel-sans text-[11px] rounded-full px-2.5 py-1.5 border ${
                  think
                    ? 'border-[rgba(128,160,193,0.45)] text-[#9db8d4] bg-[rgba(128,160,193,0.09)]'
                    : 'border-transparent ln-mute ln-hov-ink ln-hov-tint'
                }`}
              >
                thinking
              </button>
            )}
            {plan.vision && (
              <label
                title={`attach images, up to ${MAX_IMAGES}`}
                className={`ln-t cursor-pointer rounded-full p-2 ln-mute ln-hov-ink ln-hov-tint ${images.length >= MAX_IMAGES ? 'opacity-40 pointer-events-none' : ''}`}
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
              <span className={`pixel-sans text-[11px] mr-2 ${overLimit ? 'text-[#dba99b]' : 'ln-ghost'}`}>
                {text.length} / {MAX_INPUT}
              </span>
            )}
            {busyHere ? (
              <button
                onClick={onStop}
                title="stop writing"
                className="ln-t cursor-pointer w-[34px] h-[34px] rounded-full border ln-hair-strong ln-faint ln-hov-ink flex items-center justify-center"
              >
                <IconStop className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={trySend}
                disabled={!canSend}
                title="send"
                className={`ln-t w-[34px] h-[34px] rounded-full flex items-center justify-center ${
                  canSend
                    ? 'ln-btn-paper cursor-pointer'
                    : 'ln-bg-tint text-[rgba(237,230,216,0.25)]'
                }`}
              >
                <IconArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <p className="pixel-sans text-[11px] ln-ghost text-center mt-2 h-4 truncate">{whisper}</p>
      </div>
    </div>
  );
}
