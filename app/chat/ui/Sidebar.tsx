'use client';

// No border against the thread — the rail is half a step darker and that is
// the whole separation. Items are fills, not rows in a table.
import { useEffect, useRef, useState } from 'react';
import type { ChatEngine } from '../engine/useChatEngine';
import { groupByDay, type Convo } from './store';
import { Plus, Dots, Pencil, Trash, X } from './Icons';

export default function Sidebar({
  convos, activeId, onSelect, onNew, onRename, onDelete, engine, open, onClose,
}: {
  convos: Convo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  engine: ChatEngine;
  open: boolean;
  onClose: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-row-menu]')) { setMenuFor(null); setConfirming(null); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const groups = groupByDay(convos);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col transition-transform duration-200 md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--cu-rail)' }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <a href="/" className="pixel-serif text-[17px]" style={{ color: 'var(--cu-text)' }}>
            c<span className="pixel-serif">0</span>mpute
          </a>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] md:hidden"><X /></button>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={onNew}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--cu-text)' }}
          >
            <Plus /> New chat
          </button>
        </div>

        <div className="cu-scroll flex-1 overflow-y-auto px-3 pb-2">
          {convos.length === 0 && (
            <p className="px-3 py-6 text-[13px]" style={{ color: 'var(--cu-faint)' }}>
              Your conversations will appear here.
            </p>
          )}

          {groups.map(g => (
            <div key={g.label} className="mb-1">
              <div className="px-3 pb-1 pt-3 text-[12px]" style={{ color: 'var(--cu-faint)' }}>{g.label}</div>
              {g.items.map(c => {
                const active = c.id === activeId;
                return (
                  <div key={c.id} className="group relative" data-row-menu>
                    {editing === c.id ? (
                      <input
                        ref={input}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={() => { onRename(c.id, draft.trim() || c.title); setEditing(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { onRename(c.id, draft.trim() || c.title); setEditing(null); }
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        className="w-full rounded-xl bg-white/[0.08] px-3 py-2 text-[14px] outline-none"
                        style={{ color: 'var(--cu-text)' }}
                      />
                    ) : (
                      <button
                        onClick={() => { onSelect(c.id); onClose(); }}
                        className={`block w-full truncate rounded-xl py-2 pl-3 pr-9 text-left text-[14px] transition-colors ${active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
                        style={{ color: active ? 'var(--cu-text)' : 'var(--cu-dim)' }}
                      >
                        {c.title}
                      </button>
                    )}

                    {editing !== c.id && (
                      <button
                        onClick={() => { setMenuFor(menuFor === c.id ? null : c.id); setConfirming(null); }}
                        className={`absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-white/40 transition-opacity hover:bg-white/[0.08] hover:text-white/80 ${menuFor === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        aria-label="Conversation options"
                      ><Dots /></button>
                    )}

                    {menuFor === c.id && (
                      <div
                        className="cu-fade absolute right-1 top-[calc(100%-2px)] z-50 w-44 overflow-hidden rounded-xl p-1 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]"
                        style={{ background: 'var(--cu-pop)' }}
                      >
                        <button
                          onClick={() => { setEditing(c.id); setDraft(c.title); setMenuFor(null); }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-white/[0.06]"
                          style={{ color: 'var(--cu-text)' }}
                        ><Pencil /> Rename</button>
                        <button
                          onClick={() => { if (confirming === c.id) { onDelete(c.id); setMenuFor(null); setConfirming(null); } else setConfirming(c.id); }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-white/[0.06]"
                          style={{ color: confirming === c.id ? '#f87171' : 'var(--cu-text)' }}
                        ><Trash /> {confirming === c.id ? 'Confirm delete' : 'Delete'}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 text-[12.5px]" style={{ color: 'var(--cu-faint)' }}>
          {engine.isAuthenticated ? (
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--cu-dim)' }}>{engine.displayName ?? 'Signed in'}</span>
              <button onClick={() => void engine.logout()} className="transition-colors hover:text-white/70">Sign out</button>
            </div>
          ) : (
            <button onClick={engine.login} className="transition-colors hover:text-white/70">Sign in</button>
          )}
        </div>
      </aside>
    </>
  );
}
