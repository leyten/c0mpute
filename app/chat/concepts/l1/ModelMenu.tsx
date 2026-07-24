'use client';

// Model picker for the composer. A quiet text trigger; the panel carries each
// model's cost, description, live worker count, and capability tags. The
// sharded MiniMax M2.5 tier renders as a disabled launching row with
// intentionally no submission path.

import { useEffect, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { PlanId } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { IconChevronDown } from './Icons';

export default function ModelMenu({ engine, current, onSelect }: {
  engine: ChatEngine;
  current: PlanId;
  onSelect: (id: PlanId) => void;
}) {
  const [open, setOpen] = useState(false);
  const plan = engine.models.find(m => m.id === current) ?? engine.models[0];
  const workers = engine.workerCount(plan);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="choose a model"
        className="ln-t cursor-pointer flex items-center gap-1.5 rounded-full px-2.5 py-1.5 pixel-sans text-[12.5px] ln-faint ln-hov-ink ln-hov-tint"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${workers > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-[rgba(237,230,216,0.22)]'}`} />
        {plan.name}
        <IconChevronDown className={`ln-t w-3 h-3 opacity-60 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="ln-pop-anim absolute bottom-full left-0 mb-2.5 z-50 w-[19rem] rounded-2xl border ln-hair ln-bg-pop shadow-2xl shadow-black/50 p-1.5">
            {engine.models.map(m => {
              const n = engine.workerCount(m);
              const active = m.id === current;
              return (
                <button
                  key={m.id}
                  onClick={() => { onSelect(m.id); setOpen(false); }}
                  className={`ln-t cursor-pointer w-full text-left px-3 py-2.5 rounded-xl ${active ? 'ln-bg-tint' : 'ln-hov-tint'}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="pixel-sans text-[13px] ln-ink">{m.name}</span>
                    <span className="pixel-sans text-[11px] ln-mute">{m.costLabel}</span>
                  </span>
                  <span className="block pixel-sans text-[11.5px] ln-mute mt-0.5 leading-relaxed">{m.description}</span>
                  <span className="flex items-center gap-2.5 mt-1.5 pixel-sans text-[10px] uppercase tracking-[0.12em]">
                    <span className={`flex items-center gap-1.5 ${n > 0 ? 'text-[rgba(110,231,183,0.85)]' : 'ln-ghost'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${n > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-[rgba(237,230,216,0.22)]'}`} />
                      {n} online
                    </span>
                    {m.vision && <span className="ln-ghost">vision</span>}
                    {m.thinking && <span className="ln-ghost">thinking</span>}
                  </span>
                </button>
              );
            })}

            <div className="border-t ln-hair my-1.5" />

            {/* Launching tier: visible, honest, not selectable. */}
            <div className="px-3 py-2.5 cursor-default select-none" aria-disabled>
              <span className="flex items-baseline justify-between gap-3">
                <span className="pixel-sans text-[13px] ln-mute">{engine.swarmModel.name}</span>
                <StatusBadge state="launching" />
              </span>
              <span className="block pixel-sans text-[11.5px] ln-ghost mt-0.5 leading-relaxed">{engine.swarmModel.description}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
