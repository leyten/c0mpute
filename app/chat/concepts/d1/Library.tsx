'use client';

// The desk itself: the home screen. Conversations are visible objects laid
// out as editorial cards with subject, model, recency, and a one-line tail.
// Search is instant and prominent, pinned work sits first, archived work
// stays reachable below. An empty desk is a deliberate state, not a gap.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { formatChatDate, type PlanId } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import { searchDesk, type Convo } from './store';
import { IconArchive, IconChevronDown, IconDots, IconPin, IconPlus, IconSearch, IconTrash, IconX } from './Icons';
import { CardWork, NetworkStrip } from './provenance';

const STARTERS = [
  'Explain speculative decoding, with sources',
  'Show me the attention math',
  'Write a Python client for the API',
];

function Wordmark() {
  return (
    <Link href="/" className="pixel-serif-logo text-white text-lg flex items-center">
      c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
    </Link>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-[#80a0c1]">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 mb-3">{children}</h2>;
}

export default function Library({ engine, convos, liveConvoId, onOpen, onCreate, onTogglePin, onToggleArchive, onDelete, onRename }: {
  engine: ChatEngine;
  convos: Convo[];
  liveConvoId: string | null;
  onOpen: (id: string) => void;
  onCreate: (draft?: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, subject: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const byRecency = (a: Convo, b: Convo) => b.updatedAt.localeCompare(a.updatedAt);
  const pinned = useMemo(() => convos.filter(c => !c.archived && c.pinned).sort(byRecency), [convos]);
  const active = useMemo(() => convos.filter(c => !c.archived && !c.pinned).sort(byRecency), [convos]);
  const archived = useMemo(() => convos.filter(c => c.archived).sort(byRecency), [convos]);
  const hits = useMemo(() => searchDesk(convos, q), [convos, q]);

  const planName = (id: PlanId) => engine.models.find(m => m.id === id)?.name ?? id;

  // '/' or ctrl/cmd-k focuses search from anywhere on the desk.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startRename = (c: Convo) => {
    setMenuId(null);
    setEditingId(c.id);
    setEditValue(c.subject);
  };
  const commitRename = (id: string) => {
    const v = editValue.trim();
    setEditingId(null);
    if (v) onRename(id, v);
  };

  const cardMenu = (c: Convo) => (
    <div
      className="absolute top-10 right-3 z-30 w-44 rounded-lg border border-white/10 bg-[#161311] py-1 shadow-2xl shadow-black/60"
      onClick={e => e.stopPropagation()}
    >
      <button onClick={() => { onTogglePin(c.id); setMenuId(null); }} className="cursor-pointer w-full text-left px-3 py-1.5 pixel-sans text-[13px] text-white/70 hover:text-white hover:bg-white/[0.05] flex items-center gap-2">
        <IconPin className="w-3.5 h-3.5" /> {c.pinned ? 'unpin' : 'pin'}
      </button>
      <button onClick={() => startRename(c)} className="cursor-pointer w-full text-left px-3 py-1.5 pixel-sans text-[13px] text-white/70 hover:text-white hover:bg-white/[0.05]">
        rename
      </button>
      <button onClick={() => { onToggleArchive(c.id); setMenuId(null); }} className="cursor-pointer w-full text-left px-3 py-1.5 pixel-sans text-[13px] text-white/70 hover:text-white hover:bg-white/[0.05] flex items-center gap-2">
        <IconArchive className="w-3.5 h-3.5" /> {c.archived ? 'restore' : 'archive'}
      </button>
      <button
        onClick={() => {
          if (confirmId === c.id) { onDelete(c.id); setMenuId(null); setConfirmId(null); }
          else setConfirmId(c.id);
        }}
        className="cursor-pointer w-full text-left px-3 py-1.5 pixel-sans text-[13px] text-red-300/90 hover:text-red-200 hover:bg-white/[0.05] flex items-center gap-2"
      >
        <IconTrash className="w-3.5 h-3.5" /> {confirmId === c.id ? 'click again to delete' : 'delete'}
      </button>
    </div>
  );

  const card = (c: Convo) => (
    <article
      key={c.id}
      onClick={() => { if (editingId !== c.id) onOpen(c.id); }}
      className="group relative cursor-pointer border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/25 transition-colors p-5 flex flex-col gap-3 min-h-[10.5rem]"
    >
      <div className="flex items-center gap-2 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35">
        <span>{planName(c.model)}</span>
        <span className="text-white/15">·</span>
        <span>{formatChatDate(c.updatedAt)}</span>
        {c.pinned && <IconPin className="w-3 h-3 text-[#80a0c1]" filled />}
        <span className="flex-1" />
        <button
          onClick={e => { e.stopPropagation(); setConfirmId(null); setMenuId(menuId === c.id ? null : c.id); }}
          title="conversation actions"
          className="cursor-pointer p-1 -m-1 rounded text-white/30 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <IconDots className="w-4 h-4" />
        </button>
      </div>
      {editingId === c.id ? (
        <input
          autoFocus
          value={editValue}
          onClick={e => e.stopPropagation()}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitRename(c.id)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename(c.id);
            if (e.key === 'Escape') setEditingId(null);
          }}
          className="bg-transparent outline-none border-b border-white/25 pixel-serif text-xl text-white"
        />
      ) : (
        <h3 className="pixel-serif text-xl text-white leading-snug line-clamp-2">{c.subject}</h3>
      )}
      <p className="pixel-sans text-sm text-white/45 leading-relaxed line-clamp-2 flex-1">
        {c.tail || 'nothing written yet'}
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30">
        <CardWork convo={c} />
        {liveConvoId === c.id && (
          <span className="flex items-center gap-1.5 text-[rgba(110,231,183,0.9)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[rgba(52,211,153,0.9)] animate-pulse" />
            writing
          </span>
        )}
      </div>
      {menuId === c.id && cardMenu(c)}
    </article>
  );

  const total = convos.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="border-b border-white/10 shrink-0">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40 mt-0.5">chat</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            {engine.live ? (
              <span className="hidden sm:flex items-center gap-2">
                <StatusBadge state="live" />
                <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40">
                  {engine.stats?.workersOnline ?? 0} workers
                </span>
              </span>
            ) : engine.demo ? (
              <span className="hidden sm:block pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40">demo network</span>
            ) : (
              <span className="hidden sm:block pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40">connecting</span>
            )}
            {engine.isAuthenticated ? (
              <>
                <Link
                  href="/settings#usage"
                  className="pixel-sans text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-3 py-1 transition-colors"
                  title="credits and usage"
                >
                  {engine.credits.balance ?? '…'} cr
                  {engine.credits.freePrompts ? ` · ${engine.credits.freePrompts} free` : ''}
                </Link>
                <span className="hidden md:block pixel-sans text-xs text-white/40">{engine.displayName}</span>
                <button
                  onClick={() => void engine.logout()}
                  className="cursor-pointer pixel-sans text-[11px] text-white/35 hover:text-white transition-colors"
                >
                  sign out
                </button>
              </>
            ) : (
              <>
                {engine.anonRemaining !== null && !engine.anonCapReached && (
                  <span className="hidden sm:block pixel-sans text-xs text-white/40">
                    {engine.anonRemaining} free left
                  </span>
                )}
                <button
                  onClick={() => engine.login()}
                  className="cursor-pointer pixel-sans text-xs font-medium bg-white text-black rounded-full px-3.5 py-1.5 hover:bg-white/90 transition-colors"
                >
                  sign in
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* the desk knows the network: a slim ambient strip under the header */}
      <div className="border-b border-white/[0.06] shrink-0">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-2">
          <NetworkStrip live={engine.live} demo={engine.demo} stats={engine.stats} />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto" onClick={() => { setMenuId(null); setConfirmId(null); }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
          {total === 0 ? (
            <div className="py-16 md:py-28 text-center">
              <p className="pixel-serif text-4xl md:text-5xl text-white">A clear desk.</p>
              <p className="pixel-sans text-sm md:text-base text-white/45 mt-4 max-w-md mx-auto leading-relaxed">
                Conversations you start live here in full view: subject, model, and where you left off.
                Pin the ones that matter. Archive the ones that are done.
              </p>
              <button
                onClick={() => onCreate()}
                className="cursor-pointer mt-7 inline-flex items-center gap-2 pixel-sans text-sm font-medium bg-white text-black rounded-full px-6 py-2.5 hover:bg-white/90 transition-colors"
              >
                <IconPlus className="w-4 h-4" />
                start a conversation
              </button>
              <div className="mt-10">
                <p className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/30 mb-3">or pick up one of these</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => onCreate(s)}
                      className="cursor-pointer pixel-sans text-[13px] text-white/60 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-4 py-1.5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <div>
                  <h1 className="pixel-serif text-4xl md:text-5xl text-white">The desk</h1>
                  <p className="pixel-sans text-[10px] uppercase tracking-[0.16em] text-white/35 mt-2.5">
                    {pinned.length + active.length} on the desk
                    {pinned.length > 0 && ` · ${pinned.length} pinned`}
                    {archived.length > 0 && ` · ${archived.length} archived`}
                  </p>
                </div>
                <button
                  onClick={() => onCreate()}
                  className="cursor-pointer inline-flex items-center gap-2 pixel-sans text-sm font-medium bg-white text-black rounded-full px-5 py-2.5 hover:bg-white/90 transition-colors"
                >
                  <IconPlus className="w-4 h-4" />
                  new conversation
                </button>
              </div>

              <div className="flex items-center gap-3 border-b border-white/15 focus-within:border-white/40 transition-colors pb-3 mb-10">
                <IconSearch className="w-4 h-4 text-white/30 shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
                  placeholder="search the desk"
                  className="flex-1 min-w-0 bg-transparent outline-none pixel-serif text-xl md:text-2xl text-white placeholder:text-white/25"
                />
                {query ? (
                  <button onClick={() => setQuery('')} title="clear" className="cursor-pointer text-white/30 hover:text-white transition-colors">
                    <IconX className="w-4 h-4" />
                  </button>
                ) : (
                  <kbd className="hidden md:block pixel-sans text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5">/</kbd>
                )}
              </div>

              {q ? (
                hits.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="pixel-serif text-2xl text-white/80">Nothing on the desk matches &ldquo;{q}&rdquo;.</p>
                    <button
                      onClick={() => onCreate(q)}
                      className="cursor-pointer mt-5 pixel-sans text-[13px] text-white/60 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-4 py-1.5 transition-colors"
                    >
                      start a conversation about it
                    </button>
                  </div>
                ) : (
                  <div>
                    <SectionLabel>{hits.length} {hits.length === 1 ? 'result' : 'results'}</SectionLabel>
                    <div>
                      {hits.map(({ convo: c, snippet }) => (
                        <div
                          key={c.id}
                          onClick={() => onOpen(c.id)}
                          className="cursor-pointer py-4 px-2 -mx-2 rounded-lg border-b border-white/[0.07] hover:bg-white/[0.03] transition-colors"
                        >
                          <p className="pixel-serif text-lg text-white leading-snug"><Highlight text={c.subject} q={q} /></p>
                          {snippet && (
                            <p className="pixel-sans text-sm text-white/45 mt-1 leading-relaxed line-clamp-2"><Highlight text={snippet} q={q} /></p>
                          )}
                          <p className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30 mt-1.5">
                            {planName(c.model)} · {formatChatDate(c.updatedAt)}{c.archived ? ' · archived' : ''}{c.pinned ? ' · pinned' : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <>
                  {pinned.length > 0 && (
                    <section className="mb-10">
                      <SectionLabel>pinned</SectionLabel>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{pinned.map(card)}</div>
                    </section>
                  )}
                  {active.length > 0 && (
                    <section className="mb-10">
                      {pinned.length > 0 && <SectionLabel>on the desk</SectionLabel>}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{active.map(card)}</div>
                    </section>
                  )}
                  {pinned.length + active.length === 0 && (
                    <p className="pixel-sans text-sm text-white/40 mb-10">
                      Everything is archived. Restore a conversation below or start a new one.
                    </p>
                  )}
                  {archived.length > 0 && (
                    <section>
                      <button
                        onClick={() => setArchiveOpen(o => !o)}
                        className="cursor-pointer flex items-center gap-2 pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 hover:text-white/60 transition-colors"
                      >
                        archive ({archived.length})
                        <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {archiveOpen && (
                        <div className="mt-3">
                          {archived.map(c => (
                            <div
                              key={c.id}
                              onClick={() => onOpen(c.id)}
                              className="cursor-pointer flex items-center gap-4 py-3 px-2 -mx-2 rounded-lg border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                            >
                              <span className="pixel-serif text-base text-white/70 truncate flex-1 min-w-0">{c.subject}</span>
                              <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30 shrink-0 hidden sm:block">
                                {planName(c.model)} · {formatChatDate(c.updatedAt)}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); onToggleArchive(c.id); }}
                                className="cursor-pointer pixel-sans text-[11px] text-white/40 hover:text-white transition-colors shrink-0"
                              >
                                restore
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (confirmId === c.id) { onDelete(c.id); setConfirmId(null); }
                                  else setConfirmId(c.id);
                                }}
                                className="cursor-pointer pixel-sans text-[11px] text-red-300/80 hover:text-red-200 transition-colors shrink-0"
                              >
                                {confirmId === c.id ? 'sure?' : 'delete'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
