'use client';

// V3 composer: dense console fork of the shared Composer (studio skin).
// Behavior is identical — autosizing textarea, model picker (incl. the
// disabled launching M2.5 row via the shared ModelPicker), deep-thinking
// toggle, vision attachments, character counter, no-workers note. The skin
// is flatter and tighter: hairline square-cornered panel, compact controls.

import { RefObject, useRef } from 'react';
import { MAX_INPUT_CHARS, NetworkStats } from '@/lib/orchestrator/types';
import { ChatState, PLANS, Plan, PlanId, planWorkerCount } from '../../lib';
import ModelPicker from '../../components/ModelPicker';

interface ConsoleComposerProps {
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

export default function ConsoleComposer({
  inputRef, inputValue, onInputChange, onSend,
  chatState, isConnected,
  selectedPlan, selectedPlanObj, onSelectPlan,
  deepThinking, onToggleDeepThinking,
  pendingImages, onRemoveImage, onImageFiles,
  networkStats,
}: ConsoleComposerProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const disabled = chatState !== 'idle' || !isConnected;

  const hasWorkers = planWorkerCount(selectedPlanObj, networkStats) > 0;
  const otherCount = PLANS
    .filter(p => p.id !== selectedPlan)
    .reduce((n, p) => n + planWorkerCount(p, networkStats), 0);

  return (
    <div className="relative px-4 pb-4">
      <div className="pointer-events-none absolute bottom-full left-0 right-0 h-12 bg-gradient-to-t from-[#0c0a09] to-transparent" />
      <div className="max-w-2xl mx-auto">
        {/* Only promise queueing when NO model can serve. If another model is
            online, sending shows a one-tap switch prompt instead of queueing. */}
        {!hasWorkers && otherCount === 0 && isConnected && (
          <div className="pixel-sans text-white/50 text-[11px] text-center mb-2">
            No workers are online for {selectedPlanObj.name}. Your message will queue until one connects.
          </div>
        )}

        {/* Image previews */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={`data:image/jpeg;base64,${img}`} alt="Upload preview" className="w-14 h-14 rounded-md object-cover border border-white/10" />
                <button
                  onClick={() => onRemoveImage(idx)}
                  aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Composer panel — flat hairline console box */}
        <div className="bg-white/[0.02] border border-white/10 rounded-lg focus-within:border-white/25 transition-colors">
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
            placeholder={isConnected ? (pendingImages.length > 0 ? 'Describe the image...' : 'Ask anything...') : 'Connecting to network...'}
            disabled={disabled}
            className="w-full bg-transparent px-3.5 pt-3 pb-1 pixel-sans text-white text-[15px] placeholder:text-white/35 focus:outline-none resize-none overflow-y-auto disabled:opacity-50"
          />
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <ModelPicker
              selectedPlan={selectedPlan}
              networkStats={networkStats}
              onSelect={onSelectPlan}
              trigger="boxed"
            />
            {selectedPlanObj.thinking && (
              <button
                onClick={onToggleDeepThinking}
                className={`cursor-pointer flex items-center gap-1.5 pixel-sans text-[11px] px-2.5 py-2 rounded-md border transition-colors ${deepThinking ? 'border-[#80a0c1]/40 bg-[#80a0c1]/[0.12] text-[#80a0c1]' : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'}`}
                title="Deep thinking: the model reasons step-by-step before answering. Slower, costs 20 cr/msg."
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" /><path d="M9 21h6" /></svg>
                <span className="hidden sm:inline">Deep thinking</span>
                <span className="text-[10px]">{deepThinking ? 'ON · 20 cr' : 'OFF'}</span>
              </button>
            )}
            <div className="flex-1" />
            {/* Hidden file input for image uploads — only on vision models */}
            {selectedPlanObj.vision && (
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
            )}
            {selectedPlanObj.vision && (
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled || pendingImages.length >= 4}
                className="cursor-pointer p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                title="Upload image"
                aria-label="Upload image"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
            )}
            {/* Character counter — only when approaching the limit */}
            {inputValue.length > MAX_INPUT_CHARS * 0.75 && (
              <span className={`pixel-sans text-[11px] mr-1 tabular-nums ${inputValue.length > MAX_INPUT_CHARS * 0.9 ? 'text-red-400' : 'text-white/50'}`}>
                {inputValue.length}/{MAX_INPUT_CHARS}
              </span>
            )}
            <button
              onClick={onSend}
              disabled={(!inputValue.trim() && pendingImages.length === 0) || inputValue.length > MAX_INPUT_CHARS || disabled}
              className="cursor-pointer w-8 h-8 rounded-md bg-white text-black hover:bg-white/90 flex items-center justify-center transition-all disabled:opacity-25 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
