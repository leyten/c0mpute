'use client';

// Steel — a plain chat, machined. The shape is the one everyone knows: a
// conversation rail, a thread, a composer. All of the effort is in the
// finish: an 8px grid, true hairlines, tight type, 120-160ms ease-out motion,
// and a stream that lands exactly where it should. This file owns all product
// state (chats, the one live job, errors, drafts) on top of useChatEngine,
// which is the entire backend surface.

import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatEngine, type EngineMessage, type SendCallbacks } from '../../engine/useChatEngine';
import type { PlanId } from '../../lib';
import {
  imgWire, isBlank, loadStore, messageText, newChat, saveStore, titleFrom, uid,
  type Chat, type ChatMessage, type LiveJob,
} from './store';
import Sidebar from './Sidebar';
import Thread from './Thread';

// Submission context: the last 10 messages, the new user turn included.
const CONTEXT_WINDOW = 10;
const STREAM_FLUSH_MS = 120;
const DEFAULT_MODEL: PlanId = 'max';

type RetryPayload = { messages: EngineMessage[]; model: string; think: boolean };

// Scoped refinements the utility classes cannot express: the mechanical
// caret, stepped blink, arrival motion, the answer type scale, scrollbars.
const CSS = `
.l2{background:#0b0c0e;color-scheme:dark}
.l2 ::selection{background:rgba(128,160,193,0.3);color:#fff}
.l2 *::-webkit-scrollbar{width:10px;height:10px}
.l2 *::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border:3px solid transparent;background-clip:padding-box;border-radius:5px}
.l2 *::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,0.22)}
.l2 *::-webkit-scrollbar-track{background:transparent}
.l2 :is(button,a,input,textarea,label):focus-visible{outline:1px solid rgba(128,160,193,0.55);outline-offset:2px}
.l2 .chat-answer{font-size:15px;line-height:1.7;-webkit-text-stroke:0}
.l2 .chat-answer h1{font-size:1.2em}
.l2 .chat-answer h2{font-size:1.1em}
.l2 .chat-answer h3,.l2 .chat-answer h4{font-size:1em}
.l2 .chat-answer pre{border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:rgba(255,255,255,0.03)}
.l2 .chat-answer pre code{font-size:12.5px;line-height:1.6}
.l2 .chat-answer th,.l2 .chat-answer td{padding:6px 12px !important;font-size:13px}
.l2 .chat-answer th{background:rgba(255,255,255,0.04)}
.l2-caret{display:inline-block;width:7px;height:15px;background:#80a0c1;animation:l2-blink 1.06s steps(2,jump-none) infinite}
@keyframes l2-blink{0%,49.9%{opacity:1}50%,100%{opacity:0}}
.l2-rise{animation:l2-rise 160ms cubic-bezier(0,0,0.2,1) both}
@keyframes l2-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.l2-pop{animation:l2-pop 120ms cubic-bezier(0,0,0.2,1) both}
@keyframes l2-pop{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.l2-slide{animation:l2-slide 160ms cubic-bezier(0,0,0.2,1) both}
@keyframes l2-slide{from{opacity:0.4;transform:translateX(-16px)}to{opacity:1;transform:none}}
.l2-scrim{animation:l2-fade 120ms ease-out both}
@keyframes l2-fade{from{opacity:0}to{opacity:1}}
.l2-ta{transition:height 130ms cubic-bezier(0,0,0.2,1)}
`;

export default function Steel() {
  const engine = useChatEngine();

  const [chats, setChats] = useState<Chat[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveJob | null>(null);
  const [errors, setErrors] = useState<Record<string, { message: string; retryable: boolean }>>({});
  const [anonBlocked, setAnonBlocked] = useState(false);
  const [drawer, setDrawer] = useState(false);
  // A generated image still rendering after the text turn completed.
  const [pendingImage, setPendingImageState] = useState<{ chatId: string; messageId: string } | null>(null);

  const chatsRef = useRef<Chat[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const liveRef = useRef<LiveJob | null>(null);
  useEffect(() => { liveRef.current = live; }, [live]);
  const pendingImageRef = useRef<typeof pendingImage>(null);
  const setPendingImage = useCallback((v: { chatId: string; messageId: string } | null) => {
    pendingImageRef.current = v;
    setPendingImageState(v);
  }, []);

  const draftsRef = useRef<Record<string, string>>({});
  const retryRef = useRef<Record<string, RetryPayload>>({});
  // Stream buffer is the authoritative text; state gets throttled flushes so
  // markdown re-parsing stays at ~8/sec instead of per token.
  const bufRef = useRef('');
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage after mount and resume the conversation that
  // was open last time; a fresh visit starts on a fresh thread.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const stored = loadStore();
      let list = stored.chats;
      let active = stored.activeId && list.some(c => c.id === stored.activeId) ? stored.activeId : null;
      if (!active) {
        const fresh = newChat(DEFAULT_MODEL);
        list = [fresh, ...list];
        active = fresh.id;
      }
      chatsRef.current = list;
      activeIdRef.current = active;
      setChats(list);
      setActiveId(active);
    });
    return () => { cancelled = true; };
  }, []);

  const commit = useCallback((up: (prev: Chat[]) => Chat[]) => {
    setChats(prev => {
      const next = up(prev ?? []);
      chatsRef.current = next;
      saveStore(next, activeIdRef.current);
      return next;
    });
  }, []);

  // Blank never-touched threads are pruned when focus moves on, so the rail
  // only holds real conversations. A blank with a draft or a live job stays.
  const prune = useCallback((list: Chat[], keepId: string | null) => {
    return list.filter(c =>
      !isBlank(c) ||
      c.id === keepId ||
      c.id === liveRef.current?.chatId ||
      (draftsRef.current[c.id] ?? '').trim() !== ''
    );
  }, []);

  const clearError = useCallback((chatId: string) => {
    setErrors(e => {
      if (!(chatId in e)) return e;
      const next = { ...e };
      delete next[chatId];
      return next;
    });
  }, []);

  // ---- chat mutations ----

  const appendMessage = useCallback((chatId: string, msg: ChatMessage) => {
    commit(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const title = c.autoTitle && msg.role === 'user' && c.messages.length === 0 ? titleFrom(msg.content) : c.title;
      return { ...c, title, messages: [...c.messages, msg], updatedAt: msg.createdAt };
    }));
  }, [commit]);

  const attachImages = useCallback((chatId: string, messageId: string, images: string[]) => {
    commit(prev => prev.map(c => c.id !== chatId ? c : {
      ...c,
      messages: c.messages.map(m => m.id === messageId ? { ...m, images: [...(m.images ?? []), ...images] } : m),
    }));
  }, [commit]);

  const select = useCallback((id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
    commit(prev => prune(prev, id));
    setDrawer(false);
  }, [commit, prune]);

  const createNew = useCallback(() => {
    const cur = chatsRef.current.find(c => c.id === activeIdRef.current);
    // Already sitting on an untouched thread: that is the new conversation.
    if (cur && isBlank(cur) && !(draftsRef.current[cur.id] ?? '').trim() && liveRef.current?.chatId !== cur.id) {
      setDrawer(false);
      return;
    }
    const fresh = newChat(cur?.model ?? DEFAULT_MODEL);
    activeIdRef.current = fresh.id;
    setActiveId(fresh.id);
    commit(prev => [fresh, ...prune(prev, fresh.id)]);
    setDrawer(false);
  }, [commit, prune]);

  const renameChat = useCallback((id: string, title: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, title, autoTitle: false } : c));
  }, [commit]);

  const deleteChat = useCallback((id: string) => {
    if (liveRef.current?.chatId === id) {
      engine.cancel();
      if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
      bufRef.current = '';
      setLive(null);
    }
    delete draftsRef.current[id];
    delete retryRef.current[id];
    clearError(id);
    if (pendingImageRef.current?.chatId === id) setPendingImage(null);
    if (activeIdRef.current === id) {
      const rest = chatsRef.current.filter(c => c.id !== id);
      const next = [...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (next) {
        activeIdRef.current = next.id;
        setActiveId(next.id);
        commit(prev => prev.filter(c => c.id !== id));
      } else {
        const fresh = newChat(DEFAULT_MODEL);
        activeIdRef.current = fresh.id;
        setActiveId(fresh.id);
        commit(() => [fresh]);
      }
    } else {
      commit(prev => prev.filter(c => c.id !== id));
    }
  }, [commit, engine, clearError, setPendingImage]);

  const setModel = useCallback((id: string, model: PlanId) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, model } : c));
  }, [commit]);

  const toggleThink = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, think: !c.think } : c));
  }, [commit]);

  // ---- the live job ----

  const makeCallbacks = useCallback((chatId: string): SendCallbacks => {
    const flush = () => {
      flushRef.current = null;
      setLive(l => (l && l.chatId === chatId ? { ...l, status: 'streaming', text: bufRef.current } : l));
    };
    return {
      onQueue: pos => setLive(l => (l && l.chatId === chatId ? { ...l, queuePos: pos } : l)),
      onSearching: () => setLive(l => (l && l.chatId === chatId ? { ...l, status: 'searching' } : l)),
      onSources: sources => setLive(l => (l && l.chatId === chatId ? { ...l, sources } : l)),
      onGeneratingImage: () => setLive(l => (l && l.chatId === chatId ? { ...l, genImage: true } : l)),
      onDelta: chunk => {
        bufRef.current += chunk;
        if (!flushRef.current) flushRef.current = setTimeout(flush, STREAM_FLUSH_MS);
      },
      onComplete: (finalText, meta) => {
        if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
        const wasGeneratingImage = liveRef.current?.chatId === chatId ? liveRef.current.genImage : false;
        bufRef.current = '';
        let content = finalText || 'The network returned an empty response.';
        if (meta.thinkSeconds !== null && content.includes('</think>')) {
          content = content.replace('</think>', `</think><!--think_time:${meta.thinkSeconds}-->`);
        }
        if (meta.sources.length > 0) content += `\n---SOURCES---${JSON.stringify(meta.sources)}`;
        const msg: ChatMessage = {
          id: uid('m'),
          role: 'assistant',
          content,
          images: meta.images.length > 0 ? meta.images : undefined,
          createdAt: new Date().toISOString(),
        };
        appendMessage(chatId, msg);
        setLive(null);
        // The async image path can land after the text turn; keep a skeleton
        // under the saved message until job:image / job:image_error arrives.
        if (wasGeneratingImage && meta.images.length === 0) {
          setPendingImage({ chatId, messageId: msg.id });
          setTimeout(() => {
            if (pendingImageRef.current?.messageId === msg.id) setPendingImage(null);
          }, 200000);
        }
      },
      onImage: images => {
        // While streaming, the engine folds images into onComplete meta; this
        // path only matters for images that arrive after completion.
        if (liveRef.current && liveRef.current.chatId === chatId) return;
        const p = pendingImageRef.current;
        if (!p || p.chatId !== chatId) return;
        setPendingImage(null);
        if (images.length > 0) attachImages(chatId, p.messageId, images);
        else setErrors(e => ({ ...e, [chatId]: { message: 'The image failed to render. You were refunded.', retryable: false } }));
      },
      onError: message => {
        if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
        bufRef.current = '';
        setLive(null);
        if (/^ANON_/.test(message)) setAnonBlocked(true);
        else setErrors(e => ({ ...e, [chatId]: { message, retryable: true } }));
      },
    };
  }, [appendMessage, attachImages, setPendingImage]);

  const launch = useCallback((chatId: string, payload: RetryPayload) => {
    retryRef.current[chatId] = payload;
    clearError(chatId);
    bufRef.current = '';
    setLive({ chatId, status: 'queued', text: '', queuePos: null, sources: [], genImage: false });
    void engine.send(payload, makeCallbacks(chatId)).then(ok => {
      // A refused submit (engine busy) never fires callbacks; drop the shell.
      if (!ok) setLive(l => (l && l.chatId === chatId && l.status === 'queued' && !l.text ? null : l));
    });
  }, [engine, makeCallbacks, clearError]);

  const sendPrompt = useCallback((chatId: string, text: string, images: string[]): boolean => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat || engine.busy || liveRef.current || !engine.connected) return false;
    if (!engine.isAuthenticated &&
        (engine.anonCapReached || (engine.anonRemaining !== null && engine.anonRemaining <= 0))) {
      setAnonBlocked(true);
      return false;
    }
    const plan = engine.models.find(m => m.id === chat.model) ?? engine.models[0];
    const content = text.trim() || (images.length > 0 ? 'What is in this image?' : '');
    if (!content) return false;

    const userMsg: ChatMessage = {
      id: uid('m'),
      role: 'user',
      content,
      images: plan.vision && images.length > 0 ? images.slice(0, 4) : undefined,
      createdAt: new Date().toISOString(),
    };
    appendMessage(chatId, userMsg);

    // Context: last N turns. Assistant history is cleaned (think blocks and
    // source tails off); images ride only on user turns and only for vision
    // models, since text-only workers reject multimodal input.
    const context: EngineMessage[] = [...chat.messages, userMsg].slice(-CONTEXT_WINDOW).map(m => {
      const em: EngineMessage = {
        role: m.role,
        content: m.role === 'assistant' ? messageText(m) : m.content,
      };
      if (plan.vision && m.role === 'user' && m.images && m.images.length > 0) {
        em.images = m.images.map(imgWire);
      }
      return em;
    });

    launch(chatId, { messages: context, model: plan.modelId, think: plan.thinking && chat.think });
    return true;
  }, [engine, appendMessage, launch]);

  const retrySend = useCallback((chatId: string) => {
    const payload = retryRef.current[chatId];
    if (!payload || engine.busy || liveRef.current) return;
    launch(chatId, payload);
  }, [engine, launch]);

  // Stop keeps whatever streamed in as an honest partial answer.
  const stopLive = useCallback(() => {
    const l = liveRef.current;
    if (!l) return;
    engine.cancel();
    if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
    const partial = bufRef.current.trim();
    bufRef.current = '';
    if (partial) {
      appendMessage(l.chatId, { id: uid('m'), role: 'assistant', content: partial, createdAt: new Date().toISOString() });
    }
    setLive(null);
  }, [engine, appendMessage]);

  // Escape closes the mobile rail.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // ---- render ----

  if (chats === null || activeId === null || engine.authLoading || !engine.anonReady) {
    return (
      <div className="l2 h-dvh w-full flex items-center justify-center ui-readable">
        <style>{CSS}</style>
        <span className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 animate-pulse">connecting</span>
      </div>
    );
  }

  const active = chats.find(c => c.id === activeId) ?? chats[0];
  if (!active) return null;

  const sidebar = (
    <Sidebar
      engine={engine}
      chats={chats}
      activeId={active.id}
      liveChatId={live?.chatId ?? null}
      onSelect={select}
      onNew={createNew}
      onRename={renameChat}
      onDelete={deleteChat}
    />
  );

  return (
    <div className="l2 h-dvh w-full flex text-white overflow-hidden ui-readable">
      <style>{CSS}</style>

      <div className="hidden md:block w-[264px] shrink-0 h-full">
        {sidebar}
      </div>

      <main className="flex-1 min-w-0 h-full">
        <Thread
          engine={engine}
          chat={active}
          live={live}
          error={errors[active.id]?.message ?? null}
          canRetry={errors[active.id]?.retryable ?? false}
          pendingImageMsgId={pendingImage && pendingImage.chatId === active.id ? pendingImage.messageId : null}
          anonBlocked={anonBlocked}
          getDraft={() => draftsRef.current[active.id] ?? ''}
          onDraftChange={t => { draftsRef.current[active.id] = t; }}
          onOpenSidebar={() => setDrawer(true)}
          onSend={(text, images) => sendPrompt(active.id, text, images)}
          onRetry={() => retrySend(active.id)}
          onStop={stopLive}
          onDismissError={() => clearError(active.id)}
          onSelectModel={m => setModel(active.id, m)}
          onToggleThink={() => toggleThink(active.id)}
        />
      </main>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="l2-scrim absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="l2-slide absolute inset-y-0 left-0 w-72">
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
