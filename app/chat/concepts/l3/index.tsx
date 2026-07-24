'use client';

// Concept L3 "Glass" — the familiar chat shape, refined: a conversation
// list, a thread, a composer. Nothing to learn. This file owns all product
// state (records, the one live job, errors, drafts) on top of useChatEngine,
// which is the entire backend surface. The motion system lives in glass.css.

import 'katex/dist/katex.min.css';
import './glass.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatEngine, type EngineMessage, type SendCallbacks } from '../../engine/useChatEngine';
import type { PlanId } from '../../lib';
import {
  imgWire, loadGlass, messageText, newConvo, saveGlass, titleFrom, uid,
  type Convo, type GlassMessage, type LiveJob,
} from './store';
import Sidebar from './Sidebar';
import Thread from './Thread';

// Submission context: the last 10 messages, the new user turn included.
const CONTEXT_WINDOW = 10;
const STREAM_FLUSH_MS = 120;
const DEFAULT_MODEL: PlanId = 'max';
const NEW_DRAFT = '__new';

type RetryPayload = { messages: EngineMessage[]; model: string; think: boolean };

export default function Glass() {
  const engine = useChatEngine();

  const [convos, setConvos] = useState<Convo[] | null>(null);
  // null = a fresh, unsaved conversation (the record is created on first send).
  const [activeId, setActiveId] = useState<string | null>(null);
  // Model and thinking preference for the unsaved conversation; sticky across
  // new chats so the last choice carries forward.
  const [pendingPrefs, setPendingPrefs] = useState<{ model: PlanId; think: boolean }>({ model: DEFAULT_MODEL, think: false });
  const [live, setLive] = useState<LiveJob | null>(null);
  const liveRef = useRef<LiveJob | null>(null);
  useEffect(() => { liveRef.current = live; }, [live]);
  const [errors, setErrors] = useState<Record<string, { message: string; retryable: boolean }>>({});
  const [anonBlocked, setAnonBlocked] = useState(false);
  // A generated image still rendering after the text turn completed.
  const [pendingImage, setPendingImageState] = useState<{ convoId: string; messageId: string } | null>(null);
  const pendingImageRef = useRef<typeof pendingImage>(null);
  const setPendingImage = useCallback((v: { convoId: string; messageId: string } | null) => {
    pendingImageRef.current = v;
    setPendingImageState(v);
  }, []);

  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const draftsRef = useRef<Record<string, string>>({});
  const retryRef = useRef<Record<string, RetryPayload>>({});
  // Stream buffer is the authoritative text; state gets throttled flushes so
  // markdown re-parsing stays at ~8/sec instead of per token.
  const bufRef = useRef('');
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage after mount (a microtask keeps the splash for
  // exactly one paint and the store read off the render path).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const { conversations, activeId: storedActive } = loadGlass();
      setConvos(conversations);
      if (storedActive && conversations.some(c => c.id === storedActive)) setActiveId(storedActive);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist records and the selection whenever either changes.
  useEffect(() => {
    if (convos !== null) saveGlass(convos, activeId);
  }, [convos, activeId]);

  const commit = useCallback((up: (prev: Convo[]) => Convo[]) => {
    setConvos(prev => up(prev ?? []));
  }, []);

  const clearError = useCallback((convoId: string) => {
    setErrors(e => {
      if (!(convoId in e)) return e;
      const next = { ...e };
      delete next[convoId];
      return next;
    });
  }, []);

  // ---- record mutations ----

  const appendMessage = useCallback((convoId: string, msg: GlassMessage) => {
    commit(prev => prev.map(c => {
      if (c.id !== convoId) return c;
      const title = c.autoTitle && msg.role === 'user' && c.messages.length === 0 ? titleFrom(msg.content) : c.title;
      return { ...c, title, messages: [...c.messages, msg], updatedAt: msg.createdAt };
    }));
  }, [commit]);

  const attachImages = useCallback((convoId: string, messageId: string, images: string[]) => {
    commit(prev => prev.map(c => c.id !== convoId ? c : {
      ...c,
      messages: c.messages.map(m => m.id === messageId ? { ...m, images: [...(m.images ?? []), ...images] } : m),
    }));
  }, [commit]);

  const openConvo = useCallback((id: string) => {
    setActiveId(id);
    setDrawerOpen(false);
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setDrawerOpen(false);
  }, []);

  const renameConvo = useCallback((id: string, title: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, title, autoTitle: false } : c));
  }, [commit]);

  const deleteConvo = useCallback((id: string) => {
    if (liveRef.current?.convoId === id) {
      engine.cancel();
      if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
      bufRef.current = '';
      setLive(null);
    }
    delete draftsRef.current[id];
    delete retryRef.current[id];
    clearError(id);
    if (pendingImageRef.current?.convoId === id) setPendingImage(null);
    commit(prev => prev.filter(c => c.id !== id));
    setActiveId(a => (a === id ? null : a));
  }, [commit, engine, clearError, setPendingImage]);

  // Model and thinking apply to the open conversation, or to the unsaved one.
  const selectModel = useCallback((model: PlanId) => {
    if (activeId === null) setPendingPrefs(p => ({ ...p, model }));
    else commit(prev => prev.map(c => c.id === activeId ? { ...c, model } : c));
  }, [activeId, commit]);

  const toggleThink = useCallback(() => {
    if (activeId === null) setPendingPrefs(p => ({ ...p, think: !p.think }));
    else commit(prev => prev.map(c => c.id === activeId ? { ...c, think: !c.think } : c));
  }, [activeId, commit]);

  // ---- the live job ----

  const makeCallbacks = useCallback((convoId: string): SendCallbacks => {
    const flush = () => {
      flushRef.current = null;
      setLive(l => (l && l.convoId === convoId ? { ...l, status: 'streaming', text: bufRef.current } : l));
    };
    return {
      onQueue: pos => setLive(l => (l && l.convoId === convoId ? { ...l, queuePos: pos } : l)),
      onSearching: () => setLive(l => (l && l.convoId === convoId ? { ...l, status: 'searching' } : l)),
      onSources: sources => setLive(l => (l && l.convoId === convoId ? { ...l, sources } : l)),
      onGeneratingImage: () => setLive(l => (l && l.convoId === convoId ? { ...l, genImage: true } : l)),
      onDelta: chunk => {
        bufRef.current += chunk;
        if (!flushRef.current) flushRef.current = setTimeout(flush, STREAM_FLUSH_MS);
      },
      onComplete: (finalText, meta) => {
        if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
        const wasGeneratingImage = liveRef.current?.convoId === convoId ? liveRef.current.genImage : false;
        bufRef.current = '';
        let content = finalText || 'The network returned an empty response.';
        if (meta.thinkSeconds !== null && content.includes('</think>')) {
          content = content.replace('</think>', `</think><!--think_time:${meta.thinkSeconds}-->`);
        }
        if (meta.sources.length > 0) content += `\n---SOURCES---${JSON.stringify(meta.sources)}`;
        const msg: GlassMessage = {
          id: uid('m'),
          role: 'assistant',
          content,
          images: meta.images.length > 0 ? meta.images : undefined,
          createdAt: new Date().toISOString(),
        };
        appendMessage(convoId, msg);
        setLive(null);
        // The async image path can land after the text turn; keep a skeleton
        // under the saved message until job:image / job:image_error arrives.
        if (wasGeneratingImage && meta.images.length === 0) {
          setPendingImage({ convoId, messageId: msg.id });
          setTimeout(() => {
            if (pendingImageRef.current?.messageId === msg.id) setPendingImage(null);
          }, 200000);
        }
      },
      onImage: images => {
        // While streaming, the engine folds images into onComplete meta; this
        // path only matters for images that arrive after completion.
        if (liveRef.current && liveRef.current.convoId === convoId) return;
        const p = pendingImageRef.current;
        if (!p || p.convoId !== convoId) return;
        setPendingImage(null);
        if (images.length > 0) attachImages(convoId, p.messageId, images);
        else setErrors(e => ({ ...e, [convoId]: { message: 'The image failed to render. You were refunded.', retryable: false } }));
      },
      onError: message => {
        if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
        bufRef.current = '';
        setLive(null);
        if (/^ANON_/.test(message)) setAnonBlocked(true);
        else setErrors(e => ({ ...e, [convoId]: { message, retryable: true } }));
      },
    };
  }, [appendMessage, attachImages, setPendingImage]);

  const launch = useCallback((convoId: string, payload: RetryPayload) => {
    retryRef.current[convoId] = payload;
    clearError(convoId);
    bufRef.current = '';
    setLive({ convoId, status: 'queued', text: '', queuePos: null, sources: [], genImage: false });
    void engine.send(payload, makeCallbacks(convoId)).then(ok => {
      // A refused submit (engine busy) never fires callbacks; drop the shell.
      if (!ok) setLive(l => (l && l.convoId === convoId && l.status === 'queued' && !l.text ? null : l));
    });
  }, [engine, makeCallbacks, clearError]);

  const sendPrompt = useCallback((text: string, images: string[]): boolean => {
    if (engine.busy || liveRef.current || !engine.connected) return false;
    if (!engine.isAuthenticated &&
        (engine.anonCapReached || (engine.anonRemaining !== null && engine.anonRemaining <= 0))) {
      setAnonBlocked(true);
      return false;
    }
    const content = text.trim() || (images.length > 0 ? 'What is in this image?' : '');
    if (!content) return false;

    // The record is created on first send; before that the conversation only
    // exists as the pending preferences and a draft.
    let convo = activeId ? (convos ?? []).find(c => c.id === activeId) : undefined;
    if (!convo) {
      convo = newConvo(pendingPrefs.model, pendingPrefs.think);
      commit(prev => [convo!, ...prev]);
      setActiveId(convo.id);
    }
    const convoId = convo.id;
    const plan = engine.models.find(m => m.id === convo.model) ?? engine.models[0];

    const userMsg: GlassMessage = {
      id: uid('m'),
      role: 'user',
      content,
      images: plan.vision && images.length > 0 ? images.slice(0, 4) : undefined,
      createdAt: new Date().toISOString(),
    };
    appendMessage(convoId, userMsg);

    // Context: last N turns. Assistant history is cleaned (think blocks and
    // source tails off); images ride only on user turns and only for vision
    // models, since text-only workers reject multimodal input.
    const context: EngineMessage[] = [...convo.messages, userMsg].slice(-CONTEXT_WINDOW).map(m => {
      const em: EngineMessage = {
        role: m.role,
        content: m.role === 'assistant' ? messageText(m) : m.content,
      };
      if (plan.vision && m.role === 'user' && m.images && m.images.length > 0) {
        em.images = m.images.map(imgWire);
      }
      return em;
    });

    launch(convoId, { messages: context, model: plan.modelId, think: plan.thinking && convo.think });
    return true;
  }, [convos, activeId, pendingPrefs, engine, commit, appendMessage, launch]);

  const retrySend = useCallback((convoId: string) => {
    const payload = retryRef.current[convoId];
    if (!payload || engine.busy || liveRef.current) return;
    launch(convoId, payload);
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
      appendMessage(l.convoId, { id: uid('m'), role: 'assistant', content: partial, createdAt: new Date().toISOString() });
    }
    setLive(null);
  }, [engine, appendMessage]);

  // ---- render ----

  if (convos === null || engine.authLoading || !engine.anonReady) {
    return (
      <div className="l3 h-dvh w-full bg-[#0c0a09] flex items-center justify-center ui-readable">
        <span className="l3-dot l3-dot-breathe" aria-label="loading" />
      </div>
    );
  }

  const active = activeId ? convos.find(c => c.id === activeId) ?? null : null;
  const plan = engine.models.find(m => m.id === (active ? active.model : pendingPrefs.model)) ?? engine.models[0];
  const think = active ? active.think : pendingPrefs.think;
  const draftKey = active ? active.id : NEW_DRAFT;

  const sidebar = (
    <Sidebar
      engine={engine}
      convos={convos}
      activeId={activeId}
      liveConvoId={live?.convoId ?? null}
      onSelect={openConvo}
      onNew={newChat}
      onRename={renameConvo}
      onDelete={deleteConvo}
    />
  );

  return (
    <div className="l3 h-dvh w-full bg-[#0c0a09] text-white flex overflow-hidden ui-readable">
      {/* desktop: the list sits a hair below the thread plane */}
      <aside className="l3-side hidden md:block h-full shrink-0" style={{ width: sideOpen ? 272 : 0 }} inert={!sideOpen}>
        <div className="w-[272px] h-full bg-[#0a0908] border-r border-white/[0.07]">
          {sidebar}
        </div>
      </aside>

      {/* mobile: the list is a drawer over everything */}
      <div className={`md:hidden fixed inset-0 z-40 ${drawerOpen ? '' : 'pointer-events-none'}`} inert={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={`l3-scrim absolute inset-0 bg-black/60 backdrop-blur-[2px] ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          className={`l3-drawer absolute inset-y-0 left-0 w-[18.5rem] max-w-[85vw] bg-[#0d0b0a] border-r border-white/10 shadow-[24px_0_64px_-24px_rgba(0,0,0,0.8)] ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebar}
        </div>
      </div>

      <main className="flex-1 min-w-0 h-full">
        <Thread
          engine={engine}
          convo={active}
          plan={plan}
          think={think}
          live={live}
          error={active ? errors[active.id]?.message ?? null : null}
          canRetry={active ? errors[active.id]?.retryable ?? false : false}
          pendingImageMsgId={pendingImage && active && pendingImage.convoId === active.id ? pendingImage.messageId : null}
          anonBlocked={anonBlocked}
          sideOpen={sideOpen}
          draftKey={draftKey}
          draftsRef={draftsRef}
          onToggleSide={() => setSideOpen(o => !o)}
          onOpenDrawer={() => setDrawerOpen(true)}
          onNew={newChat}
          onSend={sendPrompt}
          onRetry={() => { if (active) retrySend(active.id); }}
          onStop={stopLive}
          onDismissError={() => { if (active) clearError(active.id); }}
          onSelectModel={selectModel}
          onToggleThink={toggleThink}
        />
      </main>
    </div>
  );
}
