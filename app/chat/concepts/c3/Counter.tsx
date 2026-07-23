'use client';

// The counter: where work is handed over. Model choice with cost and live
// worker counts, deep thinking for capable models, image attach for vision
// models, the free-prompt lane for anonymous visitors, and one send button.

import { useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { Plan, PlanId, SWARM_PLAN } from '../../lib';
import { Square } from './bits';
import { MAX_INPUT_CHARS } from './types';

const MAX_IMAGES = 4;

export type CounterProps = {
  plan: Plan;
  models: Plan[];
  swarm: typeof SWARM_PLAN;
  workerCount: (p: Plan) => number;
  live: boolean;
  connected: boolean;
  busy: boolean;
  deepThinking: boolean;
  onToggleThink: () => void;
  onSelectPlan: (id: PlanId) => void;
  onSend: (text: string, images: string[]) => void;
  isAuthenticated: boolean;
  anonRemaining: number | null;
  onLogin: () => void;
};

export default function Counter(props: CounterProps) {
  const {
    plan, models, swarm, workerCount, live, connected, busy,
    deepThinking, onToggleThink, onSelectPlan, onSend,
    isAuthenticated, anonRemaining, onLogin,
  } = props;

  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A non-vision model takes no image input: pending attachments are held
  // inert (hidden, never submitted) until a vision model is selected again.
  const activeImages = plan.vision ? images : [];

  const anonOut = !isAuthenticated && anonRemaining !== null && anonRemaining <= 0;
  const overLimit = text.length > MAX_INPUT_CHARS;
  const canSend = connected && !busy && !overLimit && (text.trim().length > 0 || activeImages.length > 0);
  const selectedWorkers = workerCount(plan);

  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const submit = () => {
    if (!canSend) return;
    onSend(text, activeImages);
    setText('');
    setImages([]);
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const addFiles = (files: FileList) => {
    Array.from(files).slice(0, MAX_IMAGES - images.length).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const uri = reader.result as string;
        if (uri) setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, uri] : prev));
      };
      reader.readAsDataURL(file);
    });
  };

  if (anonOut) {
    return (
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-4 py-5 md:flex-row md:items-center md:px-6">
          <div className="min-w-0 flex-1">
            <div className="pixel-sans text-[14px] text-white/85">Your free prompts are used for today.</div>
            <div className="pixel-sans mt-0.5 text-[12px] text-white/45">Sign in to keep going with free prompts and credits.</div>
          </div>
          <button
            onClick={onLogin}
            className="pixel-sans shrink-0 cursor-pointer rounded-xl bg-white px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/10">
      <div className="mx-auto max-w-3xl px-4 pb-4 pt-3 md:px-6">
        {live && selectedWorkers === 0 && (
          <div className="pixel-sans mb-2 flex items-center gap-2 text-[11px] text-white/45">
            <Square tone="off" size={5} />
            0 workers currently serve {plan.name}. Jobs wait in queue until one comes online.
          </div>
        )}

        {activeImages.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {activeImages.map((src, i) => (
              <div key={i} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`attachment ${i + 1}`} className="h-14 w-14 rounded-lg border border-white/15 object-cover" />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="remove image"
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-white text-black group-hover:flex"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] transition-colors focus-within:border-white/25">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => { setText(e.target.value); grow(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={1}
            placeholder={busy ? 'The network is serving your request' : connected ? 'Hand the network a request' : 'Connecting to the network'}
            className="pixel-sans block w-full resize-none bg-transparent px-4 pb-1.5 pt-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            {/* model menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="pixel-sans flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Square tone={selectedWorkers > 0 ? 'live' : 'off'} size={5} />
                {plan.name}
                <span className="text-white/35">{plan.costLabel}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <button aria-label="close model menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuOpen(false)} />
                  <div className="absolute bottom-full left-0 z-40 mb-2 w-[19rem] rounded-xl border border-white/10 bg-[#0c0a09] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
                    <div className="pixel-sans px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-[0.16em] text-white/25">who serves your job</div>
                    {models.map((m) => {
                      const n = workerCount(m);
                      const active = m.id === plan.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => { onSelectPlan(m.id); setMenuOpen(false); }}
                          className={`w-full cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="pixel-sans text-[13px] text-white">{m.name}</span>
                            <span className="pixel-sans text-[11px] text-white/45">{m.costLabel}</span>
                          </span>
                          <span className="pixel-sans mt-0.5 block text-[11px] text-white/40">{m.description}</span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <Square tone={n > 0 ? 'live' : 'off'} size={5} />
                            <span className="pixel-sans text-[11px] text-white/35">{n} worker{n === 1 ? '' : 's'} online</span>
                          </span>
                        </button>
                      );
                    })}
                    <div className="mt-1 border-t border-white/10 px-2.5 py-2 opacity-60">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="pixel-sans text-[13px] text-white/70">{swarm.name}</span>
                        <StatusBadge state="launching" />
                      </span>
                      <span className="pixel-sans mt-0.5 block text-[11px] text-white/35">{swarm.description}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* deep thinking, only for capable models */}
            {plan.thinking && (
              <button
                onClick={onToggleThink}
                className={`pixel-sans flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors ${deepThinking ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}
              >
                <Square tone={deepThinking ? 'live' : 'off'} size={5} />
                deep thinking
              </button>
            )}

            {/* image attach, only for vision models */}
            {plan.vision && images.length < MAX_IMAGES && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  title="attach images"
                  className="pixel-sans flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  image
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />
              </>
            )}

            <div className="ml-auto flex items-center gap-2.5">
              {!isAuthenticated && anonRemaining !== null && (
                <span className="pixel-sans text-[11px] text-white/35">{anonRemaining} free left</span>
              )}
              {text.length > MAX_INPUT_CHARS * 0.8 && (
                <span className={`pixel-sans text-[11px] tabular-nums ${overLimit ? 'text-[rgba(248,113,113,0.9)]' : 'text-white/35'}`}>
                  {text.length} / {MAX_INPUT_CHARS}
                </span>
              )}
              <button
                onClick={submit}
                disabled={!canSend}
                className={`pixel-sans rounded-xl px-5 py-2 text-sm font-medium transition-colors ${canSend ? 'cursor-pointer bg-white text-black hover:bg-white/90' : 'cursor-not-allowed bg-white/10 text-white/30'}`}
              >
                {busy ? 'serving' : 'send'}
              </button>
            </div>
          </div>
        </div>

        <div className="pixel-sans mt-2 text-center text-[10px] text-white/20">
          Served by real machines on the c0mpute network. Every reply carries its receipt.
        </div>
      </div>
    </div>
  );
}
