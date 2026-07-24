'use client';

// The conversation rail. A compact list on a 32px row rhythm, grouped by
// recency under small-caps labels. Rename edits in place; delete asks once.
// The account block sits at the foot with the live network line under it.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ChatEngine } from '../../engine/useChatEngine';
import { GROUP_ORDER, groupOf, type Chat, type GroupKey } from './store';
import { IconDots, IconPencil, IconPlus, IconTrash } from './Icons';

function Wordmark() {
  return (
    <Link href="/" className="pixel-serif-logo text-white text-lg flex items-center">
      c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
    </Link>
  );
}

export default function Sidebar({ engine, chats, activeId, liveChatId, onSelect, onNew, onRename, onDelete }: {
  engine: ChatEngine;
  chats: Chat[];
  activeId: string | null;
  liveChatId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  // Confirm state cools off on its own; menus reset it on close.
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  useEffect(() => { if (editingId) editRef.current?.select(); }, [editingId]);

  const groups = useMemo(() => {
    const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const map = new Map<GroupKey, Chat[]>();
    for (const c of sorted) {
      const g = groupOf(c.updatedAt);
      const list = map.get(g);
      if (list) list.push(c);
      else map.set(g, [c]);
    }
    return GROUP_ORDER.filter(g => map.has(g)).map(g => ({ label: g, items: map.get(g)! }));
  }, [chats]);

  const startRename = (c: Chat) => {
    setMenuId(null);
    setEditingId(c.id);
    setEditValue(c.title);
  };
  const commitRename = (id: string) => {
    const v = editValue.trim();
    setEditingId(null);
    if (v) onRename(id, v);
  };

  const stats = engine.stats;

  return (
    <div className="h-full w-full flex flex-col bg-[#08090b] border-r border-white/10">
      <div className="h-12 shrink-0 px-4 flex items-center">
        <Wordmark />
      </div>

      <div className="px-2 pb-2 shrink-0">
        <button
          onClick={onNew}
          className="cursor-pointer w-full h-8 rounded-md border border-white/10 hover:border-white/25 px-2 flex items-center gap-2 pixel-sans text-[13px] text-white/70 hover:text-white transition-colors duration-150 ease-out"
        >
          <IconPlus className="w-3.5 h-3.5" />
          new conversation
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {groups.map(g => (
          <div key={g.label}>
            <h2 className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30 px-2 pt-4 pb-1 select-none">{g.label}</h2>
            {g.items.map(c => {
              const active = c.id === activeId;
              if (c.id === editingId) {
                return (
                  <div key={c.id} className="h-8 px-2 flex items-center">
                    <input
                      ref={editRef}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitRename(c.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(c.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full bg-transparent outline-none border-b border-[#80a0c1]/50 pixel-sans text-[13px] text-white pb-0.5"
                    />
                  </div>
                );
              }
              return (
                <div key={c.id} className="relative group">
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`cursor-pointer w-full h-8 rounded-md px-2 pr-7 flex items-center gap-2 text-left transition-colors duration-150 ease-out ${
                      active ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {liveChatId === c.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[rgba(52,211,153,0.9)] animate-pulse shrink-0" />
                    )}
                    <span className="pixel-sans text-[13px] truncate">{c.title}</span>
                  </button>
                  <button
                    onClick={() => { setConfirmId(null); setMenuId(m => (m === c.id ? null : c.id)); }}
                    title="conversation options"
                    className={`cursor-pointer absolute right-1 top-1 w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white transition-[color,opacity] duration-150 ease-out md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 ${menuId === c.id ? 'md:opacity-100 text-white' : ''}`}
                  >
                    <IconDots className="w-3.5 h-3.5" />
                  </button>

                  {menuId === c.id && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => { setMenuId(null); setConfirmId(null); }} />
                      <div className="l2-pop absolute right-1 top-8 z-40 w-40 rounded-lg border border-white/10 bg-[#14161a] p-1 shadow-[0_2px_8px_rgba(0,0,0,0.5),0_12px_32px_rgba(0,0,0,0.35)]">
                        <button
                          onClick={() => startRename(c)}
                          className="cursor-pointer w-full h-7 rounded-md px-2 flex items-center gap-2 pixel-sans text-[12px] text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors duration-150"
                        >
                          <IconPencil className="w-3.5 h-3.5" /> rename
                        </button>
                        <button
                          onClick={() => {
                            if (confirmId === c.id) { setMenuId(null); setConfirmId(null); onDelete(c.id); }
                            else setConfirmId(c.id);
                          }}
                          className="cursor-pointer w-full h-7 rounded-md px-2 flex items-center gap-2 pixel-sans text-[12px] text-red-300/90 hover:text-red-200 hover:bg-white/[0.05] transition-colors duration-150"
                        >
                          <IconTrash className="w-3.5 h-3.5" /> {confirmId === c.id ? 'confirm delete' : 'delete'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        {engine.isAuthenticated ? (
          <div className="flex items-center justify-between gap-2">
            <span className="pixel-sans text-[13px] text-white/80 truncate">{engine.displayName ?? 'account'}</span>
            <button
              onClick={() => { void engine.logout(); }}
              className="cursor-pointer pixel-sans text-[11px] text-white/35 hover:text-white/70 transition-colors duration-150 shrink-0"
            >
              sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => engine.login()}
            className="cursor-pointer w-full h-8 rounded-md bg-white text-black pixel-sans text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-[background-color,transform] duration-150 ease-out"
          >
            sign in with X
          </button>
        )}
        <div className="mt-2 flex items-center gap-2 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30">
          <span className={`w-1.5 h-1.5 rounded-full ${engine.connected ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/20'}`} />
          {engine.demo ? (
            <span>offline preview</span>
          ) : stats ? (
            <span className="tabular-nums">{stats.workersOnline} workers online</span>
          ) : (
            <span>connecting</span>
          )}
        </div>
      </div>
    </div>
  );
}
