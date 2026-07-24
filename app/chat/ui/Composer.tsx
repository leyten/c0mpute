'use client';

// One slab. Text on top, controls inside the bottom edge, send at the right.
// This is the 2026 shape: nothing floats outside it, nothing is bordered off.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Plan } from '../lib';
import type { ChatEngine } from '../engine/useChatEngine';
import Instructions from './Instructions';
import ModelMenu from './ModelMenu';
import { Clip, Arrow, Stop, Chevron, X, Spark, Tune } from './Icons';

const MAX_CHARS = 2000;

export default function Composer({
  engine, plan, onPlan, think, onThink, images, onImages, value, onValue, onSend, onStop, busy, centered,
  inputRef, convoId, instructions, onInstructions, instrOpen, onInstrOpen, sendStyle, queue, elapsed,
}: {
  engine: ChatEngine;
  plan: Plan;
  onPlan: (p: Plan) => void;
  think: boolean;
  onThink: (v: boolean) => void;
  images: string[];
  onImages: (v: string[]) => void;
  value: string;
  onValue: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  centered: boolean;
  /** Live job facts the send control can narrate. */
  queue: number | null;
  elapsed: number;
  /** Preview only: which treatment of the send control to render. */
  sendStyle: SendStyle;
  /** Lets the page focus the field after dropping text in, e.g. a quote. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** The conversation on screen. The instructions editor is keyed by it, so a
   *  draft can never straddle two conversations. */
  convoId: string | null;
  instructions: string;
  onInstructions: (v: string) => void;
  instrOpen: boolean;
  onInstrOpen: (v: boolean) => void;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ta = inputRef ?? own;
  const file = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 224) + 'px';
  }, [value, ta]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-model-menu]')) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const addFiles = async (files: FileList | null) => {
    if (!files || !plan.vision) return;
    const room = 4 - images.length;
    const picked = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room);
    const read = await Promise.all(picked.map(f => new Promise<string>(res => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    })));
    onImages([...images, ...read.filter(Boolean)]);
  };

  const canSend = (value.trim().length > 0 || images.length > 0) && !busy && value.length <= MAX_CHARS;
  const over = value.length > MAX_CHARS;
  const hasInstructions = instructions.trim().length > 0;

  return (
    <div className={centered ? '' : 'pb-5 pt-2'}>
      <div className="relative mx-auto w-full max-w-[46rem] px-4">
        {instrOpen && (
          <Instructions
            key={convoId ?? 'new'}
            value={instructions}
            onCommit={onInstructions}
            onClose={() => onInstrOpen(false)}
          />
        )}

        {/* the slab */}
        <div
          className="rounded-[26px] transition-colors duration-200"
          style={{ background: 'var(--cu-surface)' }}
        >
          {images.length > 0 && (
            <div className="flex gap-2 px-4 pt-4">
              {images.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <button
                    onClick={() => onImages(images.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full text-white/70 hover:text-white"
                    style={{ background: 'var(--cu-pop)' }}
                    aria-label="Remove image"
                  ><X /></button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={ta}
            rows={1}
            value={value}
            onChange={e => onValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            onPaste={e => {
              if (!plan.vision) return;
              const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
              if (imgs.length) { e.preventDefault(); void addFiles(e.clipboardData.files); }
            }}
            placeholder="Ask anything"
            className="cu-scroll block w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-[1.6] outline-none placeholder:text-white/30"
            style={{ color: 'var(--cu-text)' }}
          />

          {/* controls live inside the slab */}
          <div className="flex items-center gap-1.5 px-3 pb-3 pt-1.5">
            <button
              onClick={() => file.current?.click()}
              disabled={!plan.vision || images.length >= 4}
              title={plan.vision ? 'Attach an image' : 'This model does not read images'}
              className="grid h-9 w-9 place-items-center rounded-full text-white/45 transition-colors hover:text-white/85 disabled:opacity-30 disabled:hover:text-white/45"
            ><Clip /></button>
            <input ref={file} type="file" accept="image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />

            {/* model */}
            <div className="relative" data-model-menu>
              <button
                onClick={() => setMenu(v => !v)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors hover:bg-white/[0.06]"
                style={{ color: 'var(--cu-dim)' }}
              >
                {engine.workerCount(plan) > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cu-live)' }} />
                )}
                {plan.name}
                <Chevron className="opacity-60" />
              </button>

              {menu && (
                <ModelMenu
                  engine={engine}
                  selectedId={plan.id}
                  onPick={m => { onPlan(m); setMenu(false); }}
                  placement="up"
                />
              )}
            </div>

            {plan.thinking && (
              <button
                onClick={() => onThink(!think)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors hover:bg-white/[0.06]"
                style={{ color: think ? 'var(--cu-steel)' : 'var(--cu-dim)' }}
              >
                <Spark />
                Thinking
              </button>
            )}

            {/* standing instructions: quiet while unset, steel once written */}
            <button
              data-instr
              onClick={() => onInstrOpen(!instrOpen)}
              title="Instructions for this conversation"
              aria-label="Instructions for this conversation"
              className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${hasInstructions ? 'hover:bg-white/[0.06]' : 'text-white/45 hover:text-white/85'}`}
              style={hasInstructions ? { color: 'var(--cu-steel)' } : undefined}
            ><Tune /></button>

            <div className="ml-auto flex items-center gap-2.5">
              {value.length > MAX_CHARS - 200 && (
                <span className="text-[12px] tabular-nums" style={{ color: over ? '#f87171' : 'var(--cu-faint)' }}>
                  {value.length}/{MAX_CHARS}
                </span>
              )}
              <SendControl
                style={sendStyle}
                busy={busy}
                canSend={canSend}
                onSend={onSend}
                onStop={onStop}
                plan={plan}
                engine={engine}
                onPlan={onPlan}
                queue={queue}
                elapsed={elapsed}
              />
            </div>
          </div>
        </div>

        <FootNote engine={engine} />
      </div>
    </div>
  );
}


/** Four treatments of the one control that matters most. Preview only: pick
 *  one and this collapses to it. */
export type SendStyle = 'labelled' | 'cost' | 'network' | 'stateful' | 'split' | 'ghost';

function SendControl({
  style, busy, canSend, onSend, onStop, plan, engine, onPlan, queue, elapsed,
}: {
  style: SendStyle;
  busy: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
  plan: Plan;
  engine: ChatEngine;
  onPlan: (p: Plan) => void;
  queue: number | null;
  elapsed: number;
}) {
  const [menu, setMenu] = useState(false);
  const press = 'transition-all duration-150 active:scale-95';
  const solid = (on: boolean) => (on ? 'bg-white text-black' : 'bg-white/[0.09] text-white/30');
  const live = busy || canSend;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-send-menu]')) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  // no chrome at rest: the arrow brightens only when there is something to send
  if (style === 'ghost') {
    return (
      <button
        onClick={busy ? onStop : onSend}
        disabled={!live}
        aria-label={busy ? 'Stop' : 'Send'}
        className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-white/[0.06] disabled:hover:bg-transparent ${press}`}
        style={{ color: live ? 'var(--cu-text)' : 'var(--cu-faint)' }}
      >{busy ? <Stop /> : <Arrow />}</button>
    );
  }

  // what this prompt will cost, on the button that spends it
  if (style === 'cost') {
    return (
      <button
        onClick={busy ? onStop : onSend}
        disabled={!live}
        aria-label={busy ? 'Stop' : 'Send'}
        className={`flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium ${press} ${solid(live)}`}
      >
        {busy ? <><Stop /> Stop</> : <>Send <span className="opacity-45">·</span> <span className="tabular-nums">{plan.costLabel}</span></>}
      </button>
    );
  }

  // the machines that will answer, counted live — omitted when none are up,
  // never guessed
  if (style === 'network') {
    const n = engine.workerCount(plan);
    return (
      <button
        onClick={busy ? onStop : onSend}
        disabled={!live}
        aria-label={busy ? 'Stop' : 'Send'}
        className={`flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium ${press} ${solid(live)}`}
      >
        {busy ? <><Stop /> Stop</> : (
          <>Send{n > 0 && <span className="opacity-45">to {n} {n === 1 ? 'machine' : 'machines'}</span>}</>
        )}
      </button>
    );
  }

  // one control that narrates the job: send, then where it is, then how long
  // it has been running. Clicking it while it works stops it.
  if (style === 'stateful') {
    const label = !busy
      ? <>Send <span className="opacity-45">↵</span></>
      : queue !== null && queue > 0
        ? <><span className="cu-dots"><span /></span> Queued <span className="opacity-45 tabular-nums">{queue} ahead</span></>
        : <><Stop /> <span className="tabular-nums">{(elapsed / 1000).toFixed(1)}s</span></>;
    return (
      <button
        onClick={busy ? onStop : onSend}
        disabled={!live}
        aria-label={busy ? 'Stop' : 'Send'}
        className={`flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium ${press} ${solid(live)}`}
      >{label}</button>
    );
  }

  // send, or send this one to a different model without changing the default
  if (style === 'split') {
    return (
      <div className="relative flex items-stretch" data-send-menu>
        <button
          onClick={busy ? onStop : onSend}
          disabled={!live}
          aria-label={busy ? 'Stop' : 'Send'}
          className={`flex h-9 items-center gap-2 rounded-l-xl pl-3.5 pr-2.5 text-[13px] font-medium ${press} ${solid(live)}`}
        >{busy ? <><Stop /> Stop</> : <>Send <span className="opacity-45">↵</span></>}</button>
        <button
          onClick={() => setMenu(v => !v)}
          disabled={busy}
          aria-label="Send with another model"
          className={`grid h-9 w-7 place-items-center rounded-r-xl border-l border-black/15 ${press} ${solid(live)}`}
        ><Chevron className="rotate-180" /></button>
        {menu && (
          <div className="cu-fade absolute bottom-[calc(100%+8px)] right-0 z-40 w-[300px] overflow-hidden rounded-2xl p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]" style={{ background: 'var(--cu-pop)' }}>
            {engine.models.map(m => (
              <button
                key={m.id}
                onClick={() => { onPlan(m); setMenu(false); onSend(); }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13.5px] hover:bg-white/[0.06]"
                style={{ color: 'var(--cu-text)' }}
              >
                {m.name}
                <span className="text-[12px]" style={{ color: 'var(--cu-faint)' }}>{m.costLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // labelled: says what it does, and what Enter does
  return (
    <button
      onClick={busy ? onStop : onSend}
      disabled={!live}
      aria-label={busy ? 'Stop' : 'Send'}
      className={`flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium ${press} ${solid(live)}`}
    >{busy ? <><Stop /> Stop</> : <>Send <span className="opacity-45">↵</span></>}</button>
  );
}

function FootNote({ engine }: { engine: ChatEngine }) {
  const { credits, isAuthenticated, anonRemaining } = engine;
  return (
    <div className="mt-2.5 flex items-center justify-center gap-3 text-[12px]" style={{ color: 'var(--cu-faint)' }}>
      {!isAuthenticated ? (
        <span>{anonRemaining !== null ? `${anonRemaining} free prompts left` : 'Free to try'}</span>
      ) : (
        <>
          {credits.freePrompts !== null && credits.freePrompts > 0 && <span>{credits.freePrompts} free prompts</span>}
          {credits.balance !== null && (
            <a href="/settings#usage" className="transition-colors hover:text-white/70">{credits.balance} credits</a>
          )}
          <a href="/staking" className="transition-colors hover:text-white/70">Stake for daily prompts</a>
        </>
      )}
    </div>
  );
}
