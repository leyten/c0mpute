'use client';

// The second pane, before a conversation is chosen. Split view opens this to
// pick what sits beside the current room: a slim list of the desk, searchable,
// the already-open conversation held out, plus a way to start a fresh one
// beside. Picking or creating fills this pane with a room.

import { useMemo, useState } from 'react';
import { formatChatDate, type PlanId } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { searchDesk, type Convo } from './store';
import { TagChip } from './Tags';
import { IconPlus, IconSearch, IconX } from './Icons';

export default function Picker({ engine, convos, excludeId, liveConvoId, onPick, onCreate, onClose }: {
  engine: ChatEngine;
  convos: Convo[];
  excludeId: string;
  liveConvoId: string | null;
  onPick: (id: string) => void;
  onCreate: (draft?: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const planName = (id: PlanId) => engine.models.find(m => m.id === id)?.name ?? id;

  const rows = useMemo(() => {
    const base = q
      ? searchDesk(convos, q).map(h => h.convo)
      : [...convos].filter(c => !c.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return base.filter(c => c.id !== excludeId);
  }, [convos, q, excludeId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="border-b border-white/10 shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <span className="pixel-sans text-[11px] uppercase tracking-[0.16em] text-white/50">open beside</span>
          <span className="flex-1" />
          <button
            onClick={() => onCreate()}
            className="cursor-pointer inline-flex items-center gap-1.5 pixel-sans text-[11px] uppercase tracking-[0.12em] text-white/70 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-3 py-1.5 transition-colors"
          >
            <IconPlus className="w-3.5 h-3.5" />
            new
          </button>
          <button onClick={onClose} title="cancel (esc)" className="cursor-pointer text-white/35 hover:text-white transition-colors">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 shrink-0">
        <div className="flex items-center gap-2.5 border-b border-white/15 focus-within:border-white/40 transition-colors pb-2">
          <IconSearch className="w-4 h-4 text-white/30 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); if (query) setQuery(''); else onClose(); }
            }}
            placeholder="find a conversation"
            className="flex-1 min-w-0 bg-transparent outline-none pixel-serif text-lg text-white placeholder:text-white/25"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
        {rows.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <p className="pixel-sans text-sm text-white/45">
              {q ? `nothing matches “${q}”.` : 'no other conversation to open yet.'}
            </p>
            <button
              onClick={() => onCreate(q || undefined)}
              className="cursor-pointer mt-4 pixel-sans text-[12px] text-white/60 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-4 py-1.5 transition-colors"
            >
              start one beside
            </button>
          </div>
        ) : (
          rows.map(c => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              className="cursor-pointer w-full text-left px-3 py-3 rounded-lg hover:bg-white/[0.04] transition-colors flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="pixel-serif text-base text-white leading-snug truncate flex-1 min-w-0">{c.subject}</span>
                {liveConvoId === c.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[rgba(52,211,153,0.9)] animate-pulse shrink-0" />
                )}
              </div>
              {c.tail && <p className="pixel-sans text-[12px] text-white/40 leading-snug line-clamp-1">{c.tail}</p>}
              <div className="flex items-center gap-1.5 flex-wrap pixel-sans text-[9px] uppercase tracking-[0.14em] text-white/30">
                <span>{planName(c.model)}</span>
                <span className="text-white/15">·</span>
                <span>{formatChatDate(c.updatedAt)}</span>
                {c.tags.map(t => <TagChip key={t} label={t} />)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
