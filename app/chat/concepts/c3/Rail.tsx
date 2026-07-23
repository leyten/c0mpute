'use client';

// The ledger rail: wordmark, new conversation, the list of past work, and
// the standing account state (network, credits, identity). Static column on
// desktop, overlay drawer on mobile.

import { useState } from 'react';
import Link from 'next/link';
import type { NetworkStats } from '@/lib/orchestrator/types';
import { formatChatDate } from '../../lib';
import { Square, Wordmark } from './bits';
import type { Conversation } from './types';

export type RailProps = {
  convs: Conversation[];
  activeId: string | null;
  flightConvId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  isAuthenticated: boolean;
  displayName: string | null;
  onLogin: () => void;
  onLogout: () => void;
  credits: { balance: number | null; freePrompts: number | null; freeLimit: number | null; stakerAllowance: number };
  anonRemaining: number | null;
  stats: NetworkStats | null;
  live: boolean;
  demo: boolean;
  open: boolean;
  onClose: () => void;
};

function RailContent(props: RailProps) {
  const {
    convs, activeId, flightConvId, onSelect, onNew, onRename, onDelete,
    isAuthenticated, displayName, onLogin, onLogout, credits, anonRemaining,
    stats, live, demo,
  } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const commitRename = (id: string) => {
    if (draft.trim()) onRename(id, draft.trim());
    setEditingId(null);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center px-5 pb-4 pt-5">
        <Link href="/" className="cursor-pointer">
          <Wordmark className="text-lg" />
        </Link>
        <span className="pixel-sans ml-2.5 mt-1 text-[11px] uppercase tracking-[0.18em] text-white/30">chat</span>
      </div>

      <div className="px-4">
        <button
          onClick={onNew}
          className="pixel-sans w-full cursor-pointer rounded-xl bg-white py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
        >
          new conversation
        </button>
      </div>

      <div className="pixel-sans mt-5 px-5 text-[11px] uppercase tracking-[0.16em] text-white/25">ledger</div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {convs.length === 0 && (
          <div className="pixel-sans px-2.5 py-3 text-[13px] leading-relaxed text-white/30">
            Nothing yet. Your fulfilled work collects here.
          </div>
        )}
        {convs.map((c) => {
          const active = c.id === activeId;
          const n = c.exchanges.length;
          return (
            <div key={c.id} className={`group relative rounded-lg ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
              {editingId === c.id ? (
                <div className="px-2.5 py-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(c.id);
                      if (e.key === 'Escape') { setEditingId(null); setDraft(''); }
                    }}
                    onBlur={() => commitRename(c.id)}
                    className="pixel-sans w-full rounded border border-white/20 bg-transparent px-1.5 py-1 text-[13px] text-white outline-none"
                  />
                </div>
              ) : (
                <>
                  <button onClick={() => onSelect(c.id)} className="w-full cursor-pointer px-2.5 py-2 text-left">
                    <span className="flex items-center gap-2">
                      {flightConvId === c.id && <Square tone="live" pulse size={5} />}
                      <span className={`pixel-sans truncate text-[13px] ${active ? 'text-white' : 'text-white/70'}`}>{c.title}</span>
                    </span>
                    <span className="pixel-sans mt-0.5 block text-[11px] text-white/30">
                      {formatChatDate(c.updatedAt)} · {n} job{n === 1 ? '' : 's'}
                    </span>
                  </button>
                  <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                    {confirmDeleteId === c.id ? (
                      <button
                        onClick={() => { onDelete(c.id); setConfirmDeleteId(null); }}
                        onMouseLeave={() => setConfirmDeleteId(null)}
                        className="pixel-sans cursor-pointer rounded bg-[rgba(248,113,113,0.15)] px-1.5 py-0.5 text-[11px] text-[rgba(248,113,113,0.9)]"
                      >
                        sure?
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingId(c.id); setDraft(c.title); }}
                          title="rename"
                          className="cursor-pointer rounded p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(c.id)}
                          title="delete"
                          className="cursor-pointer rounded p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* the network, as it stands */}
      <div className="border-t border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <Square tone={live ? 'live' : 'off'} pulse={live} size={6} />
          <span className="pixel-sans text-[12px] text-white/55">
            {stats ? `${stats.workersOnline} workers online` : 'connecting'}
          </span>
          {demo && <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30">preview demo</span>}
        </div>
        {stats && (
          <div className="pixel-sans mt-1 text-[11px] text-white/30">
            {stats.jobsCompleted.toLocaleString()} jobs served to date
          </div>
        )}
      </div>

      {/* credits / free lane */}
      <div className="border-t border-white/10 px-5 py-3">
        {isAuthenticated ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="pixel-sans text-[11px] uppercase tracking-[0.16em] text-white/25">credits</span>
              <span className="pixel-sans text-[13px] text-white/85">{credits.balance !== null ? `${credits.balance} cr` : '—'}</span>
            </div>
            {credits.freeLimit !== null && credits.freePrompts !== null && (
              <div className="pixel-sans mt-1 text-[11px] text-white/40">
                {credits.freePrompts} of {credits.freeLimit} free prompts left
              </div>
            )}
            {credits.stakerAllowance > 0 && (
              <div className="pixel-sans mt-0.5 text-[11px] text-white/40">
                {credits.stakerAllowance} staker prompts left
              </div>
            )}
            <div className="mt-2 flex gap-3">
              <Link href="/settings#usage" className="pixel-sans cursor-pointer text-[11px] text-[#80a0c1] hover:underline">top up</Link>
              <Link href="/staking" className="pixel-sans cursor-pointer text-[11px] text-[#80a0c1] hover:underline">stake for allowance</Link>
            </div>
          </>
        ) : (
          <>
            <div className="pixel-sans text-[12px] text-white/55">
              {anonRemaining !== null
                ? `${anonRemaining} free prompt${anonRemaining === 1 ? '' : 's'} left today`
                : 'free prompts, then sign in'}
            </div>
            <button
              onClick={onLogin}
              className="pixel-sans mt-2 w-full cursor-pointer rounded-lg border border-white/20 py-1.5 text-[12px] text-white transition-colors hover:bg-white/5"
            >
              sign in
            </button>
          </>
        )}
      </div>

      {/* identity */}
      {isAuthenticated && (
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <span className="pixel-sans truncate text-[12px] text-white/55">{displayName || 'signed in'}</span>
          <button
            onClick={onLogout}
            className="pixel-sans cursor-pointer text-[11px] uppercase tracking-[0.12em] text-white/30 transition-colors hover:text-white/70"
          >
            sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Rail(props: RailProps) {
  return (
    <>
      {/* desktop */}
      <aside className="hidden w-72 shrink-0 border-r border-white/10 md:block">
        <RailContent {...props} />
      </aside>
      {/* mobile drawer */}
      {props.open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="close menu" onClick={props.onClose} className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] border-r border-white/10 bg-[#0c0a09]">
            <RailContent {...props} />
          </div>
        </div>
      )}
    </>
  );
}
