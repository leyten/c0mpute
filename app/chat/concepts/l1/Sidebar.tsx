'use client';

// The conversation list. A quiet index: serif titles grouped by recency,
// a single new-conversation action, and the account at the bottom. On mobile
// it slides in as a drawer over the page.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ChatEngine } from '../../engine/useChatEngine';
import { groupThreads, type Thread } from './store';
import { IconPencil, IconPlus, IconTrash, IconX } from './Icons';

export function Wordmark() {
  return (
    <Link href="/" className="pixel-serif-logo text-[17px] ln-ink">
      c<span>0</span>mpute
    </Link>
  );
}

function NetworkLine({ engine }: { engine: ChatEngine }) {
  return (
    <div className="flex items-center gap-2 pixel-sans text-[10px] uppercase tracking-[0.16em] ln-ghost">
      {engine.live ? (
        <>
          <span className="ln-live-dot" />
          <span>{engine.stats?.workersOnline ?? 0} workers online</span>
        </>
      ) : engine.demo ? (
        <span>demo network</span>
      ) : (
        <span>connecting</span>
      )}
    </div>
  );
}

export default function Sidebar({ engine, threads, selectedId, liveThreadId, open, onClose, onSelect, onNew, onRename, onDelete }: {
  engine: ChatEngine;
  threads: Thread[];
  selectedId: string | null;
  liveThreadId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const groups = useMemo(() => groupThreads(threads), [threads]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 2600);
    return () => clearTimeout(t);
  }, [confirmId]);

  const commitRename = (id: string) => {
    const v = editValue.trim();
    setEditingId(null);
    if (v) onRename(id, v);
  };

  const row = (t: Thread) => {
    const active = t.id === selectedId;
    const editing = editingId === t.id;
    return (
      <div key={t.id} className={`group relative rounded-lg ln-t ${active ? 'ln-item-active' : 'ln-item'}`}>
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitRename(t.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename(t.id);
              if (e.key === 'Escape') setEditingId(null);
              e.stopPropagation();
            }}
            className="w-full bg-transparent outline-none px-3 py-[7px] pixel-serif text-[16px] md:text-[14.5px] ln-ink"
          />
        ) : (
          <button onClick={() => onSelect(t.id)} className="cursor-pointer w-full text-left px-3 py-[7px] block">
            <span className={`pixel-serif text-[14.5px] leading-[1.35] block truncate ln-t ${active ? 'ln-ink' : 'ln-faint'}`}>
              {t.title}
            </span>
          </button>
        )}
        {liveThreadId === t.id && !editing && (
          // Wrapper handles the hover fade; the dot's own breathing animation
          // would override a static opacity set directly on it.
          <span className="absolute right-3 top-1/2 -translate-y-1/2 group-hover:opacity-0 transition-opacity duration-200">
            <span className="ln-live-dot block" />
          </span>
        )}
        {!editing && (
          <div className={`absolute inset-y-0 right-0 flex items-center pl-7 pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 ${active ? 'ln-scrim-active' : 'ln-scrim'}`}>
            <button
              onClick={() => { setEditingId(t.id); setEditValue(t.title); }}
              title="rename"
              className="ln-t cursor-pointer p-1.5 rounded ln-ghost ln-hov-ink"
            >
              <IconPencil className="w-[13px] h-[13px]" />
            </button>
            <button
              onClick={() => {
                if (confirmId === t.id) { setConfirmId(null); onDelete(t.id); }
                else setConfirmId(t.id);
              }}
              title={confirmId === t.id ? 'click again to delete' : 'delete conversation'}
              className={`ln-t cursor-pointer p-1.5 rounded ${confirmId === t.id ? 'text-[#dba99b]' : 'ln-ghost ln-hov-ink'}`}
            >
              <IconTrash className="w-[13px] h-[13px]" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className={`md:hidden fixed inset-0 z-40 bg-[rgba(9,7,5,0.62)] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside
        className={`ln-side-bg fixed md:static inset-y-0 left-0 z-50 w-[280px] md:w-[272px] shrink-0 flex flex-col border-r ln-hair transition-transform duration-[360ms] ease-[cubic-bezier(0.32,0.72,0,1)] md:transition-none ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="h-14 shrink-0 px-5 flex items-center justify-between">
          <Wordmark />
          <button onClick={onClose} title="close" className="md:hidden ln-t cursor-pointer p-1.5 -mr-1.5 rounded ln-mute ln-hov-ink">
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={onNew}
            className="ln-t cursor-pointer w-full flex items-center gap-2.5 border ln-hair ln-hov-line ln-hov-tint rounded-xl px-3.5 py-2.5 pixel-sans text-[13px] ln-faint ln-hov-ink"
          >
            <IconPlus className="w-[15px] h-[15px]" />
            new conversation
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
          {threads.length === 0 ? (
            <p className="px-3 pt-4 pixel-sans text-[12px] ln-ghost leading-relaxed">
              Conversations you start will appear here.
            </p>
          ) : (
            groups.map(g => (
              <section key={g.label}>
                <h2 className="px-3 pt-5 pb-1.5 pixel-sans text-[10px] uppercase tracking-[0.16em] ln-ghost">{g.label}</h2>
                <div className="space-y-0.5">{g.items.map(row)}</div>
              </section>
            ))
          )}
        </nav>

        <footer className="shrink-0 border-t ln-hair px-5 py-4">
          <NetworkLine engine={engine} />
          {engine.isAuthenticated ? (
            <div className="mt-3 space-y-1.5">
              {engine.displayName && <p className="pixel-sans text-[13px] ln-ink truncate">{engine.displayName}</p>}
              <Link href="/settings#usage" className="ln-t block pixel-sans text-[12px] ln-faint ln-hov-ink">
                {engine.credits.balance ?? '…'} credits · usage
              </Link>
              {engine.credits.freePrompts !== null && engine.credits.freeLimit !== null && (
                <p className="pixel-sans text-[12px] ln-mute">
                  {engine.credits.freePrompts} of {engine.credits.freeLimit} free prompts today
                </p>
              )}
              <Link href="/staking" className="ln-t block pixel-sans text-[12px] ln-faint ln-hov-ink">
                {engine.credits.stakerAllowance > 0
                  ? `${engine.credits.stakerAllowance} staker prompts · staking`
                  : 'stake for daily prompts'}
              </Link>
              <button onClick={() => void engine.logout()} className="ln-t cursor-pointer pixel-sans text-[11px] ln-ghost ln-hov-ink pt-0.5">
                sign out
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {engine.anonRemaining !== null && !engine.anonCapReached && (
                <p className="pixel-sans text-[12px] ln-mute">
                  {engine.anonRemaining} free {engine.anonRemaining === 1 ? 'prompt' : 'prompts'} left today
                </p>
              )}
              <button
                onClick={() => engine.login()}
                className="ln-btn-paper cursor-pointer w-full rounded-xl py-2 pixel-sans text-[13px] font-medium"
              >
                sign in with X
              </button>
            </div>
          )}
        </footer>
      </aside>
    </>
  );
}
