'use client';

// One slab. Text on top, controls inside the bottom edge, send at the right.
// This is the 2026 shape: nothing floats outside it, nothing is bordered off.
import { useEffect, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { Plan } from '../lib';
import type { ChatEngine } from '../engine/useChatEngine';
import { Clip, Arrow, Stop, Chevron, Check, X, Spark } from './Icons';

const MAX_CHARS = 2000;

export default function Composer({
  engine, plan, onPlan, think, onThink, images, onImages, value, onValue, onSend, onStop, busy, centered,
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
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 224) + 'px';
  }, [value]);

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

  return (
    <div className={centered ? '' : 'pb-5 pt-2'}>
      <div className="mx-auto w-full max-w-[46rem] px-4">
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
                <div
                  className="cu-fade absolute bottom-[calc(100%+8px)] left-0 z-40 w-[300px] overflow-hidden rounded-2xl p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]"
                  style={{ background: 'var(--cu-pop)' }}
                >
                  {engine.models.map(m => {
                    const n = engine.workerCount(m);
                    const on = m.id === plan.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { onPlan(m); setMenu(false); }}
                        className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
                      >
                        <span className="mt-[3px] w-4 shrink-0" style={{ color: 'var(--cu-steel)' }}>{on && <Check />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--cu-text)' }}>
                            {m.name}
                            <span className="text-[12px]" style={{ color: 'var(--cu-faint)' }}>{m.costLabel}</span>
                          </span>
                          <span className="mt-0.5 block text-[12px]" style={{ color: 'var(--cu-faint)' }}>
                            {n > 0 ? `${n} ${n === 1 ? 'worker' : 'workers'} online` : 'no workers right now'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="mx-3 my-1 h-px" style={{ background: 'var(--cu-line)' }} />
                  <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 opacity-55">
                    <span className="mt-[3px] w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--cu-text)' }}>
                        {engine.swarmModel.name}
                        <StatusBadge state="launching" />
                      </span>
                      <span className="mt-0.5 block text-[12px]" style={{ color: 'var(--cu-faint)' }}>
                        {engine.swarmModel.description}
                      </span>
                    </span>
                  </div>
                </div>
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

            <div className="ml-auto flex items-center gap-2.5">
              {value.length > MAX_CHARS - 200 && (
                <span className="text-[12px] tabular-nums" style={{ color: over ? '#f87171' : 'var(--cu-faint)' }}>
                  {value.length}/{MAX_CHARS}
                </span>
              )}
              {busy ? (
                <button
                  onClick={onStop}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition-transform active:scale-95"
                  aria-label="Stop"
                ><Stop /></button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!canSend}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition-all active:scale-95 disabled:bg-white/[0.09] disabled:text-white/30"
                  aria-label="Send"
                ><Arrow /></button>
              )}
            </div>
          </div>
        </div>

        <FootNote engine={engine} />
      </div>
    </div>
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
