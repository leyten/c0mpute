'use client';

// Model dropdown in the composer. Opens upward, closes on outside click or
// selection. Shows each model's price and how many workers currently serve it.
// The swarm tier (MiniMax M2.5) sits on top as a disabled launching entry —
// visible, honest about its status, never selectable while unavailable.
//
// `trigger` picks the button skin: 'boxed' (default, bordered chip) or
// 'inline' (quiet text, used by the Gallery variant). The menu is identical.

import { useEffect, useRef, useState } from 'react';
import { NetworkStats } from '@/lib/orchestrator/types';
import StatusBadge from '@/components/StatusBadge';
import { PLANS, PlanId, SWARM_PLAN, planWorkerCount } from '../lib';

interface ModelPickerProps {
  selectedPlan: PlanId;
  networkStats: NetworkStats | null;
  onSelect: (plan: PlanId) => void;
  trigger?: 'boxed' | 'inline';
}

export default function ModelPicker({ selectedPlan, networkStats, onSelect, trigger = 'boxed' }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedPlanObj = PLANS.find(p => p.id === selectedPlan) ?? PLANS[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      {trigger === 'inline' ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="cursor-pointer flex items-center gap-1.5 pixel-sans text-xs px-1.5 py-2 text-white/50 hover:text-white/85 transition-colors"
        >
          <span>{selectedPlanObj.name}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
        </button>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          className="cursor-pointer flex items-center gap-2 pixel-sans text-xs px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] transition-colors"
        >
          <span className="text-white/90">{selectedPlanObj.name}</span>
          <span className="text-white/45">{selectedPlanObj.cost > 0 ? `${selectedPlanObj.cost} cr/msg` : 'Free'}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#141210] border border-white/10 rounded-xl p-1.5 z-50 shadow-2xl">
          {/* Swarm tier — shown first, disabled until it actually serves */}
          <button
            disabled={!SWARM_PLAN.available}
            className="w-full text-left px-3 py-2.5 rounded-lg disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="pixel-sans text-sm text-white/55">{SWARM_PLAN.name}</span>
              <StatusBadge state="launching" />
            </div>
            <div className="pixel-sans text-white/35 text-xs mt-0.5">{SWARM_PLAN.description}</div>
          </button>
          <div className="h-px bg-white/[0.07] my-1 mx-1.5" />
          {PLANS.map((plan) => {
            const isSel = plan.id === selectedPlan;
            const count = planWorkerCount(plan, networkStats);
            return (
              <button
                key={plan.id}
                onClick={() => { onSelect(plan.id); setOpen(false); }}
                className={`cursor-pointer w-full text-left px-3 py-2.5 rounded-lg transition-colors ${isSel ? 'bg-[#80a0c1]/[0.12]' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`pixel-sans text-sm ${isSel ? 'text-[#80a0c1]' : 'text-white/85'}`}>{plan.name}</span>
                  <span className={`pixel-sans text-xs shrink-0 ${isSel ? 'text-[#80a0c1]/60' : 'text-white/45'}`}>{plan.cost > 0 ? `${plan.cost} cr/msg` : 'Free'}</span>
                </div>
                <div className="pixel-sans text-white/45 text-xs mt-0.5">{plan.description}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-emerald-400/90' : 'bg-white/20'}`} />
                  <span className={`pixel-sans text-[11px] ${count > 0 ? 'text-emerald-300/70' : 'text-white/35'}`}>
                    {count} {count === 1 ? 'worker' : 'workers'} online
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
