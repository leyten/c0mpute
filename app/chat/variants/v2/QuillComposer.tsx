'use client';

// V2 "Manuscript" composer — a floating centered pill in the homepage
// hero-input character: rounded-xl, hairline border, send arrow. At rest it
// is a single quiet line. On focus it grows (wider column, brighter border)
// and reveals a whisper row of text controls: model, thinking, character
// count. The paperclip (vision models) and the send arrow stay visible so
// nothing essential ever hides. The model menu is a manuscript-voiced fork
// of the shared picker, with the disabled launching MiniMax M2.5 row kept.
//
// Control buttons preventDefault on mousedown so clicking them never blurs
// the textarea — the revealed row cannot collapse under the pointer.

import { RefObject, useEffect, useRef, useState } from 'react';
import { MAX_INPUT_CHARS, NetworkStats } from '@/lib/orchestrator/types';
import { ChatState, PLANS, Plan, PlanId, SWARM_PLAN, planWorkerCount } from '../../lib';

interface QuillComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  chatState: ChatState;
  isConnected: boolean;
  selectedPlan: PlanId;
  selectedPlanObj: Plan;
  onSelectPlan: (plan: PlanId) => void;
  deepThinking: boolean;
  onToggleDeepThinking: () => void;
  pendingImages: string[];
  onRemoveImage: (index: number) => void;
  onImageFiles: (files: FileList) => void;
  networkStats: NetworkStats | null;
}

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

// Quiet text trigger + upward hairline panel. Same catalog and worker-count
// truth as the shared ModelPicker, including the launching M2.5 row.
function ModelMenu({
  selectedPlan, networkStats, onSelect, open, onToggle, onClose,
}: {
  selectedPlan: PlanId;
  networkStats: NetworkStats | null;
  onSelect: (plan: PlanId) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedPlanObj = PLANS.find(p => p.id === selectedPlan) ?? PLANS[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onMouseDown={keepFocus}
        onClick={onToggle}
        className="cursor-pointer flex items-center gap-1 pixel-sans text-[11px] text-white/45 hover:text-white/85 transition-colors"
      >
        <span>{selectedPlanObj.name}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-3 w-72 bg-[#12100e] border border-white/10 rounded-xl p-1.5 z-50 shadow-2xl">
          {/* Swarm tier — visible, honest, never selectable while unavailable */}
          <button
            disabled={!SWARM_PLAN.available}
            onMouseDown={keepFocus}
            className="w-full text-left px-3 py-2.5 rounded-lg disabled:cursor-not-allowed"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="pixel-sans text-sm text-white/50">{SWARM_PLAN.name}</span>
              <span className="pixel-sans text-[10px] uppercase tracking-[0.16em] text-white/35 shrink-0">launching</span>
            </div>
            <p className="pixel-sans text-[11px] text-white/30 mt-0.5">{SWARM_PLAN.description}</p>
          </button>
          <div className="h-px bg-white/[0.07] my-1 mx-1.5" />
          {PLANS.map((plan) => {
            const isSel = plan.id === selectedPlan;
            const count = planWorkerCount(plan, networkStats);
            return (
              <button
                key={plan.id}
                onMouseDown={keepFocus}
                onClick={() => { onSelect(plan.id); onClose(); }}
                className={`cursor-pointer w-full text-left px-3 py-2.5 rounded-lg transition-colors ${isSel ? 'bg-white/[0.05]' : 'hover:bg-white/[0.04]'}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`pixel-sans text-sm ${isSel ? 'text-[#80a0c1]' : 'text-white/85'}`}>{plan.name}</span>
                  <span className="pixel-sans text-[11px] text-white/40 shrink-0">{plan.cost > 0 ? `${plan.cost} cr/msg` : 'Free'}</span>
                </div>
                <p className="pixel-sans text-[11px] text-white/35 mt-0.5">{plan.description}</p>
                <p className="flex items-center gap-1.5 mt-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-emerald-400/90' : 'bg-white/20'}`} />
                  <span className={`pixel-sans text-[10px] ${count > 0 ? 'text-emerald-300/70' : 'text-white/35'}`}>
                    {count} {count === 1 ? 'worker' : 'workers'} online
                  </span>
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function QuillComposer({
  inputRef, inputValue, onInputChange, onSend,
  chatState, isConnected,
  selectedPlan, selectedPlanObj, onSelectPlan,
  deepThinking, onToggleDeepThinking,
  pendingImages, onRemoveImage, onImageFiles,
  networkStats,
}: QuillComposerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [engaged, setEngaged] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const disabled = chatState !== 'idle' || !isConnected;
  const active = engaged || modelOpen;

  const hasWorkers = planWorkerCount(selectedPlanObj, networkStats) > 0;
  const otherCount = PLANS
    .filter(p => p.id !== selectedPlan)
    .reduce((n, p) => n + planWorkerCount(p, networkStats), 0);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-6 md:pb-9 pointer-events-none">
      <div
        ref={wrapRef}
        onFocusCapture={() => setEngaged(true)}
        onBlurCapture={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node)) setEngaged(false);
        }}
        className={`pointer-events-auto mx-auto w-full transition-all duration-300 ease-out ${active ? 'max-w-2xl' : 'max-w-xl'}`}
      >
        {/* Only promise queueing when NO model can serve — same truth rule as
            the other shells, spoken as a line above the pill. */}
        {!hasWorkers && otherCount === 0 && isConnected && (
          <p className="pixel-serif italic text-white/45 text-sm text-center mb-3">
            No workers are online for {selectedPlanObj.name}. Your message will queue until one connects.
          </p>
        )}

        <div className={`bg-[#12100e]/95 backdrop-blur-md border rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)] transition-colors ${active ? 'border-white/25' : 'border-white/10'}`}>
          {/* Image previews, inside the pill so they travel with it */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3.5 pt-3">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={`data:image/jpeg;base64,${img}`} alt="Upload preview" className="w-14 h-14 rounded-md object-cover border border-white/10" />
                  <button
                    onClick={() => onRemoveImage(idx)}
                    onMouseDown={keepFocus}
                    aria-label="Remove image"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* The writing line: paperclip · textarea · send arrow */}
          <div className="flex items-end gap-1.5 px-2.5 py-2">
            {selectedPlanObj.vision && (
              <>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) onImageFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => imageInputRef.current?.click()}
                  onMouseDown={keepFocus}
                  disabled={disabled || pendingImages.length >= 4}
                  title="Attach image"
                  aria-label="Attach image"
                  className="cursor-pointer p-2 mb-0.5 text-white/35 hover:text-white/75 transition-colors disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              </>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={inputValue}
              onChange={(e) => {
                if (e.target.value.length <= MAX_INPUT_CHARS) {
                  onInputChange(e.target.value);
                }
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={isConnected ? (pendingImages.length > 0 ? 'Describe the image...' : 'Write...') : 'Connecting to the network...'}
              disabled={disabled}
              className={`flex-1 bg-transparent py-2 pixel-sans text-white text-base placeholder:text-white/30 placeholder:italic focus:outline-none resize-none overflow-y-auto disabled:opacity-50 ${selectedPlanObj.vision ? '' : 'pl-2'}`}
            />
            <button
              onClick={onSend}
              onMouseDown={keepFocus}
              disabled={(!inputValue.trim() && pendingImages.length === 0) || inputValue.length > MAX_INPUT_CHARS || disabled}
              aria-label="Send"
              className="cursor-pointer w-8 h-8 mb-0.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/50 flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>

          {/* Whisper controls — present only while the composer is engaged.
              Everything here is also reachable in the menu overlay. */}
          <div className={`grid transition-all duration-200 ease-out ${active ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              <div className="flex items-center gap-4 px-4 pb-2.5 pt-0.5">
                <ModelMenu
                  selectedPlan={selectedPlan}
                  networkStats={networkStats}
                  onSelect={onSelectPlan}
                  open={modelOpen}
                  onToggle={() => setModelOpen(o => !o)}
                  onClose={() => setModelOpen(false)}
                />
                {selectedPlanObj.thinking && (
                  <button
                    onMouseDown={keepFocus}
                    onClick={onToggleDeepThinking}
                    title="Deep thinking: the model reasons step-by-step before answering. Slower, costs 20 cr/msg."
                    className={`cursor-pointer pixel-sans text-[11px] transition-colors ${deepThinking ? 'text-[#80a0c1]' : 'text-white/40 hover:text-white/75'}`}
                  >
                    thinking {deepThinking ? 'on' : 'off'}
                  </button>
                )}
                <div className="flex-1" />
                {inputValue.length > MAX_INPUT_CHARS * 0.75 && (
                  <span className={`pixel-sans text-[11px] tabular-nums ${inputValue.length > MAX_INPUT_CHARS * 0.9 ? 'text-red-400' : 'text-white/40'}`}>
                    {inputValue.length}/{MAX_INPUT_CHARS}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
