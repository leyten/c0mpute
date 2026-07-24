'use client';

// The conversation list. One column: wordmark, new conversation, the list
// grouped by day, and the account footer with credits and staking paths.
// Rename and delete live on the row, revealed on hover; delete asks twice.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ChatEngine } from '../../engine/useChatEngine';
import { DAY_GROUPS, dayGroup, type Convo, type DayGroup } from './store';
import { IconPencil, IconPlus, IconTrash } from './Icons';

export function Wordmark() {
  return (
    <Link href="/" className="pixel-serif-logo text-white text-lg flex items-center">
      c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
    </Link>
  );
}

export default function Sidebar({ engine, convos, activeId, liveConvoId, onSelect, onNew, onRename, onDelete }: {
  engine: ChatEngine;
  convos: Convo[];
  activeId: string | null;
  liveConvoId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const groups = useMemo(() => {
    const sorted = [...convos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const byDay = new Map<DayGroup, Convo[]>();
    for (const c of sorted) {
      const g = dayGroup(c.updatedAt);
      const list = byDay.get(g);
      if (list) list.push(c);
      else byDay.set(g, [c]);
    }
    return DAY_GROUPS.filter(g => byDay.has(g)).map(g => ({ label: g, items: byDay.get(g)! }));
  }, [convos]);

  const commitRename = (id: string) => {
    const v = editValue.trim();
    setEditingId(null);
    if (v) onRename(id, v);
  };

  const row = (c: Convo) => {
    const active = c.id === activeId;
    if (editingId === c.id) {
      return (
        <div key={c.id} className="px-2.5 py-1.5">
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitRename(c.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename(c.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            className="w-full bg-transparent outline-none border-b border-white/25 pixel-sans text-[13px] text-white py-0.5"
          />
        </div>
      );
    }
    const confirming = confirmId === c.id;
    return (
      <div key={c.id} className="group relative">
        <button
          onClick={() => onSelect(c.id)}
          className={`l3-press cursor-pointer w-full text-left rounded-lg pl-2.5 pr-14 py-2 pixel-sans text-[13px] ${
            active ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
          }`}
        >
          <span className="block truncate">{c.title}</span>
        </button>
        {liveConvoId === c.id && (
          <span className="l3-dot l3-dot-breathe absolute right-3 top-1/2 -translate-y-1/2 group-hover:opacity-0 transition-opacity" />
        )}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            onClick={() => { setEditValue(c.title); setEditingId(c.id); }}
            title="rename"
            aria-label="rename conversation"
            className="l3-press cursor-pointer p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"
          >
            <IconPencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { if (confirming) { setConfirmId(null); onDelete(c.id); } else setConfirmId(c.id); }}
            title={confirming ? 'click again to delete' : 'delete conversation'}
            aria-label={confirming ? 'click again to delete' : 'delete conversation'}
            className={`l3-press cursor-pointer p-1.5 rounded-md hover:bg-white/[0.06] ${confirming ? 'text-red-300' : 'text-white/40 hover:text-white'}`}
          >
            <IconTrash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 pt-4 pb-1 flex items-center">
        <Wordmark />
      </div>

      <div className="shrink-0 px-2.5 pt-2 pb-1">
        <button
          onClick={onNew}
          className="l3-press cursor-pointer w-full flex items-center gap-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 pixel-sans text-[13px] text-white/80 hover:text-white"
        >
          <IconPlus className="w-4 h-4" />
          new conversation
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2">
        {convos.length === 0 ? (
          <p className="pixel-sans text-[12.5px] text-white/35 leading-relaxed px-2.5 py-3">
            Conversations you start appear here. They stay in this browser.
          </p>
        ) : (
          groups.map(g => (
            <section key={g.label} className="mb-4">
              <h2 className="pixel-sans text-[10px] uppercase tracking-[0.16em] text-white/30 px-2.5 pt-1 pb-1.5">{g.label}</h2>
              <div className="space-y-px">{g.items.map(row)}</div>
            </section>
          ))
        )}
      </nav>

      <div className="shrink-0 border-t border-white/[0.07] px-4 py-3.5 space-y-1.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        {engine.isAuthenticated ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="pixel-sans text-[12.5px] text-white/65 truncate">{engine.displayName}</span>
              <button
                onClick={() => void engine.logout()}
                className="cursor-pointer pixel-sans text-[11px] text-white/35 hover:text-white transition-colors shrink-0"
              >
                sign out
              </button>
            </div>
            <Link href="/settings#usage" className="block pixel-sans text-[12px] text-white/45 hover:text-white/80 transition-colors">
              {engine.credits.balance ?? '…'} credits · usage
            </Link>
            {engine.credits.freePrompts !== null && engine.credits.freeLimit !== null && (
              <span className="block pixel-sans text-[11px] text-white/30">
                {engine.credits.freePrompts} of {engine.credits.freeLimit} free prompts
              </span>
            )}
            <Link href="/staking" className="block pixel-sans text-[12px] text-white/45 hover:text-white/80 transition-colors">
              {engine.credits.stakerAllowance > 0
                ? `${engine.credits.stakerAllowance} staker prompts · staking`
                : 'stake for daily prompts'}
            </Link>
          </>
        ) : (
          <>
            <p className="pixel-sans text-[12px] text-white/45">
              {engine.anonCapReached ? 'the free lane is closed for today' : `${engine.anonRemaining ?? 0} free prompts left today`}
            </p>
            <button
              onClick={() => engine.login()}
              className="l3-press cursor-pointer w-full pixel-sans text-[12.5px] font-medium bg-white text-black rounded-full py-2 hover:bg-white/90"
            >
              sign in with X
            </button>
          </>
        )}
      </div>
    </div>
  );
}
