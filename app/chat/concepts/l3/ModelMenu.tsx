'use client';

// Model picker for the composer. Every row carries its cost and the live
// worker count for that exact model; the sharded MiniMax M2.5 tier renders as
// a disabled launching row with intentionally no submission path.

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
        className="l3-press cursor-pointer flex items-center gap-2 rounded-full border border-white/10 hover:border-white/20 hover:bg-white/[0.03] px-3 py-1.5 pixel-sans text-[12px] text-white/70 hover:text-white"
        title="choose a model"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${workers > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/25'}`} />
        {plan.name}
        <span
          className="flex"
          style={{ transition: 'transform var(--l3-med) var(--l3-spring)', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <IconChevronDown className="w-3 h-3 text-white/40" />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="l3-pop absolute bottom-full left-0 mb-2 z-50 w-[19.5rem] rounded-2xl border border-white/10 bg-[#161311] shadow-[0_32px_64px_-24px_rgba(0,0,0,0.85)] p-1.5"
          >
            {engine.models.map(m => {
              const n = engine.workerCount(m);
              const active = m.id === current;
              return (
                <button
                  key={m.id}
                  role="menuitem"
                  onClick={() => { onSelect(m.id); setOpen(false); }}
                  className={`l3-press cursor-pointer w-full text-left px-3 py-2.5 rounded-xl ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="pixel-sans text-[13px] text-white">{m.name}</span>
                    <span className="pixel-sans text-[11px] text-white/40">{m.costLabel}</span>
                  </span>
                  <span className="block pixel-sans text-[11px] text-white/45 mt-0.5">{m.description}</span>
                  <span className="flex items-center gap-2 mt-1.5 pixel-sans text-[10px] uppercase tracking-[0.12em]">
                    <span className={`flex items-center gap-1.5 ${n > 0 ? 'text-[rgba(110,231,183,0.9)]' : 'text-white/30'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${n > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/25'}`} />
                      {n} online
                    </span>
                    {m.vision && <span className="text-white/30">vision</span>}
                    {m.thinking && <span className="text-white/30">thinking</span>}
                  </span>
                </button>
              );
            })}

            <div className="border-t border-white/10 my-1.5" />

            {/* Launching tier: visible, honest, not selectable. */}
            <div className="px-3 py-2.5 cursor-default select-none" aria-disabled>
              <span className="flex items-baseline justify-between gap-3">
                <span className="pixel-sans text-[13px] text-white/45">{engine.swarmModel.name}</span>
                <StatusBadge state="launching" />
              </span>
              <span className="block pixel-sans text-[11px] text-white/30 mt-0.5">{engine.swarmModel.description}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
