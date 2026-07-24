'use client';

// Model picker for the composer. Every row carries its cost and the live
// worker count for that exact model; the sharded MiniMax M2.5 tier renders as
// a disabled launching row with intentionally no submission path.

import { useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { PlanId } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { IconCheck, IconChevronDown } from './Icons';

export default function ModelMenu({ engine, current, onSelect }: {
  engine: ChatEngine;
  current: PlanId;
  onSelect: (id: PlanId) => void;
}) {
  const [open, setOpen] = useState(false);
  const plan = engine.models.find(m => m.id === current) ?? engine.models[0];
  const workers = engine.workerCount(plan);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="choose a model"
        className="cursor-pointer h-7 flex items-center gap-1.5 rounded-md border border-white/10 hover:border-white/20 px-2 pixel-sans text-[12px] text-white/70 hover:text-white transition-colors duration-150 ease-out"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${workers > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/25'}`} />
        {plan.name}
        <IconChevronDown className={`w-3 h-3 text-white/40 transition-transform duration-150 ease-out ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="l2-pop absolute bottom-full left-0 mb-2 z-50 w-[18rem] rounded-lg border border-white/10 bg-[#14161a] p-1 shadow-[0_2px_8px_rgba(0,0,0,0.5),0_12px_32px_rgba(0,0,0,0.35)]">
            {engine.models.map(m => {
              const n = engine.workerCount(m);
              const active = m.id === current;
              return (
                <button
                  key={m.id}
                  onClick={() => { onSelect(m.id); setOpen(false); }}
                  className={`cursor-pointer w-full text-left px-2 py-2 rounded-md transition-colors duration-150 ease-out ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="pixel-sans text-[13px] text-white truncate">{m.name}</span>
                      {active && <IconCheck className="w-3.5 h-3.5 shrink-0 text-[#80a0c1]" />}
                    </span>
                    <span className="pixel-sans text-[11px] text-white/40 tabular-nums shrink-0">{m.costLabel}</span>
                  </span>
                  <span className="block pixel-sans text-[11px] leading-4 text-white/45 mt-0.5">{m.description}</span>
                  <span className="flex items-center gap-2 mt-1.5 pixel-sans text-[10px] uppercase tracking-[0.12em]">
                    <span className={`flex items-center gap-1.5 tabular-nums ${n > 0 ? 'text-[rgba(110,231,183,0.9)]' : 'text-white/30'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${n > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/25'}`} />
                      {n} online
                    </span>
                    {m.vision && <span className="text-white/30">vision</span>}
                    {m.thinking && <span className="text-white/30">thinking</span>}
                  </span>
                </button>
              );
            })}

            <div className="h-px bg-white/10 my-1" />

            {/* Launching tier: visible, honest, not selectable. */}
            <div className="px-2 py-2 cursor-default select-none" aria-disabled>
              <span className="flex items-center justify-between gap-3">
                <span className="pixel-sans text-[13px] text-white/45">{engine.swarmModel.name}</span>
                <StatusBadge state="launching" />
              </span>
              <span className="block pixel-sans text-[11px] leading-4 text-white/30 mt-0.5">{engine.swarmModel.description}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
