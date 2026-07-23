'use client';

// V2 "Manuscript" menu — the one place everything administrative lives, so
// the page itself can stay bare. Styled as a book's index: small-caps section
// rules over a warm near-black sheet. Sections: conversations (search /
// rename / delete / new), model (including the disabled launching MiniMax
// M2.5 row), account (credits, allowances, sign-in), and a whisper footer
// with the connection and native-worker truth. Esc or the backdrop closes
// it; on mobile it is simply the full screen.

import { useEffect, useState } from 'react';
import { ChatWithMessages } from '@/lib/types';
import { NetworkStats } from '@/lib/orchestrator/types';
import { NativeWorkerStatus } from '../types';
import { PLANS, PlanId, SWARM_PLAN, formatChatDate, planWorkerCount } from '../../lib';

interface MenuOverlayProps {
  // Conversations
  chats: ChatWithMessages[];
  activeChatId: string | null;
  loadingChats: boolean;
  editingChatId: string | null;
  editingTitle: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onStartRename: (chatId: string, currentTitle: string) => void;
  onEditingTitleChange: (title: string) => void;
  onCommitRename: (chatId: string, title: string) => void;
  onCancelRename: () => void;
  // Model
  selectedPlan: PlanId;
  onSelectPlan: (plan: PlanId) => void;
  networkStats: NetworkStats | null;
  // Account
  isAuthenticated: boolean;
  anonRemaining: number | null;
  freePromptsRemaining: number;
  stakeAllowanceLeft: number;
  creditBalance: number;
  onLogin: () => void;
  onOpenUsage: () => void;
  onOpenStaking: () => void;
  // Network truth
  isConnected: boolean;
  nativeStatus: NativeWorkerStatus;
  onClose: () => void;
}

function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 border-b border-white/10 pb-2 mb-3">
      {children}
    </h2>
  );
}

export default function MenuOverlay({
  chats, activeChatId, loadingChats, editingChatId, editingTitle,
  onSelectChat, onNewChat, onDeleteChat,
  onStartRename, onEditingTitleChange, onCommitRename, onCancelRename,
  selectedPlan, onSelectPlan, networkStats,
  isAuthenticated, anonRemaining, freePromptsRemaining, stakeAllowanceLeft, creditBalance,
  onLogin, onOpenUsage, onOpenStaking,
  isConnected, nativeStatus,
  onClose,
}: MenuOverlayProps) {
  const [filter, setFilter] = useState('');

  // Esc closes the overlay. The rename input stops propagation on its own
  // Escape so cancelling a rename never also closes the sheet.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const shown = filter.trim()
    ? chats.filter(c => c.title.toLowerCase().includes(filter.trim().toLowerCase()))
    : chats;

  return (
    <div
      className="fixed inset-0 z-40 bg-[#0c0a09]/95 backdrop-blur-md overflow-y-auto overscroll-contain"
      onClick={onClose}
    >
      <div className="min-h-full flex justify-center">
        <div
          className="w-full max-w-xl px-6 md:px-8 py-14 md:py-20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sheet heading */}
          <div className="flex items-baseline justify-between mb-10 md:mb-12">
            <p className="pixel-serif italic text-white/90 text-2xl md:text-3xl">Index</p>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="cursor-pointer pixel-sans text-xs uppercase tracking-[0.18em] text-white/40 hover:text-white transition-colors"
            >
              close
            </button>
          </div>

          {/* ---- Conversations ---- */}
          <section className="mb-10 md:mb-12">
            <SectionRule>conversations</SectionRule>
            <div className="flex items-center gap-4 mb-2">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="search..."
                className="flex-1 min-w-0 bg-transparent border-b border-white/10 focus:border-white/30 pixel-sans text-sm text-white placeholder:text-white/30 placeholder:italic py-1.5 focus:outline-none transition-colors"
              />
              <button
                onClick={() => { onNewChat(); onClose(); }}
                className="cursor-pointer pixel-sans text-xs text-[#80a0c1] hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                new conversation
              </button>
            </div>
            {loadingChats ? (
              <p className="pixel-serif italic text-white/35 text-sm py-6 text-center">loading...</p>
            ) : shown.length === 0 ? (
              <p className="pixel-serif italic text-white/35 text-sm py-6 text-center">
                {chats.length === 0 ? 'no conversations yet' : 'no matches'}
              </p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {shown.map((chat) => {
                  const isActive = activeChatId === chat.id;
                  return (
                    <div
                      key={chat.id}
                      className="group flex items-baseline gap-3 py-2.5 cursor-pointer"
                      onClick={() => {
                        if (editingChatId === chat.id) return;
                        onSelectChat(chat.id);
                        onClose();
                      }}
                    >
                      {editingChatId === chat.id ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => onEditingTitleChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onCommitRename(chat.id, editingTitle);
                            if (e.key === 'Escape') { e.stopPropagation(); onCancelRename(); }
                          }}
                          onBlur={() => onCommitRename(chat.id, editingTitle)}
                          autoFocus
                          className="flex-1 min-w-0 bg-transparent border-b border-white/30 pixel-sans text-white text-sm py-0.5 focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <p className={`pixel-sans text-sm truncate flex-1 min-w-0 transition-colors ${isActive ? 'text-white' : 'text-white/65 group-hover:text-white/90'}`}>
                            {chat.title}
                          </p>
                          <span className="pixel-sans text-[10px] text-white/25 shrink-0 group-hover:hidden">
                            {formatChatDate(chat.updated_at)}
                          </span>
                          <span className="hidden group-hover:flex items-baseline gap-3 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); onStartRename(chat.id, chat.title); }}
                              className="cursor-pointer pixel-sans text-[11px] text-white/35 hover:text-[#80a0c1] transition-colors"
                            >
                              rename
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                              className="cursor-pointer pixel-sans text-[11px] text-white/35 hover:text-red-400 transition-colors"
                            >
                              delete
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Model ---- */}
          <section className="mb-10 md:mb-12">
            <SectionRule>model</SectionRule>
            <div className="divide-y divide-white/[0.05]">
              {/* Swarm tier — visible, honest, never selectable while unavailable */}
              <button
                disabled={!SWARM_PLAN.available}
                className="w-full text-left flex items-baseline justify-between gap-4 py-2.5 disabled:cursor-not-allowed"
              >
                <span className="min-w-0">
                  <span className="pixel-sans text-sm text-white/50">{SWARM_PLAN.name}</span>
                  <span className="block pixel-sans text-[11px] text-white/30 mt-0.5">{SWARM_PLAN.description}</span>
                </span>
                <span className="pixel-sans text-[10px] uppercase tracking-[0.16em] text-white/35 shrink-0">launching</span>
              </button>
              {PLANS.map((plan) => {
                const isSel = plan.id === selectedPlan;
                const count = planWorkerCount(plan, networkStats);
                return (
                  <button
                    key={plan.id}
                    onClick={() => { onSelectPlan(plan.id); onClose(); }}
                    className="cursor-pointer w-full text-left flex items-baseline justify-between gap-4 py-2.5 group"
                  >
                    <span className="min-w-0">
                      <span className={`pixel-sans text-sm transition-colors ${isSel ? 'text-[#80a0c1]' : 'text-white/80 group-hover:text-white'}`}>
                        {plan.name}
                      </span>
                      <span className="block pixel-sans text-[11px] text-white/35 mt-0.5">{plan.description}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block pixel-sans text-[11px] text-white/40">{plan.cost > 0 ? `${plan.cost} cr/msg` : 'Free'}</span>
                      <span className="flex items-center justify-end gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-emerald-400/90' : 'bg-white/20'}`} />
                        <span className={`pixel-sans text-[10px] ${count > 0 ? 'text-emerald-300/70' : 'text-white/35'}`}>
                          {count} {count === 1 ? 'worker' : 'workers'} online
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---- Account ---- */}
          <section>
            <SectionRule>account</SectionRule>
            {isAuthenticated ? (
              <div className="divide-y divide-white/[0.05]">
                <button
                  onClick={onOpenUsage}
                  className="cursor-pointer w-full flex items-baseline justify-between gap-4 py-2.5 group"
                >
                  <span className="pixel-sans text-sm text-white/65 group-hover:text-white transition-colors">credits</span>
                  <span className={`pixel-sans text-sm tabular-nums ${creditBalance === 0 ? 'text-red-400' : 'text-white/85'}`}>
                    {creditBalance.toFixed(0)}
                  </span>
                </button>
                {freePromptsRemaining > 0 && (
                  <button
                    onClick={onOpenUsage}
                    className="cursor-pointer w-full flex items-baseline justify-between gap-4 py-2.5 group"
                  >
                    <span className="pixel-sans text-sm text-white/65 group-hover:text-white transition-colors">
                      free {freePromptsRemaining === 1 ? 'prompt' : 'prompts'} left
                    </span>
                    <span className="pixel-sans text-sm tabular-nums text-white/85">{freePromptsRemaining}</span>
                  </button>
                )}
                {stakeAllowanceLeft > 0 && (
                  <button
                    onClick={onOpenStaking}
                    title="Free daily inference from your staked $ZERO, used before your paid credits. Refreshes 00:00 UTC."
                    className="cursor-pointer w-full flex items-baseline justify-between gap-4 py-2.5 group"
                  >
                    <span className="pixel-sans text-sm text-white/65 group-hover:text-white transition-colors">free credits today</span>
                    <span className="pixel-sans text-sm tabular-nums text-white/85">{stakeAllowanceLeft.toFixed(0)}</span>
                  </button>
                )}
              </div>
            ) : (
              <div>
                {anonRemaining !== null && (
                  <p className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="pixel-sans text-sm text-white/65">
                      free {anonRemaining === 1 ? 'prompt' : 'prompts'} left
                    </span>
                    <span className="pixel-sans text-sm tabular-nums text-white/85">{anonRemaining}</span>
                  </p>
                )}
                <button
                  onClick={onLogin}
                  className="cursor-pointer w-full mt-3 pixel-sans text-sm font-medium text-black bg-white hover:bg-white/90 rounded-xl py-2.5 transition-colors"
                >
                  Sign in
                </button>
              </div>
            )}
          </section>

          {/* ---- Whisper footer: the network truth ---- */}
          <div className="mt-12 pt-4 border-t border-white/10 space-y-1.5">
            {nativeStatus?.online && (
              <p className="flex items-center gap-2 pixel-sans text-[11px] text-white/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90" />
                your worker is serving · {nativeStatus.jobsCompleted} {nativeStatus.jobsCompleted === 1 ? 'job' : 'jobs'}
                {nativeStatus.tokPerSec > 0 && <> · {nativeStatus.tokPerSec.toFixed(1)} tok/s</>}
              </p>
            )}
            <p className="flex items-center gap-2 pixel-sans text-[11px] text-white/30">
              {isConnected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90" />
                  connected · {networkStats?.workersOnline ?? 0} {networkStats?.workersOnline === 1 ? 'worker' : 'workers'} online
                </>
              ) : (
                <span className="italic">connecting to the network...</span>
              )}
            </p>
            <p className="pixel-sans text-[10px] text-white/20 pt-2">esc closes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
