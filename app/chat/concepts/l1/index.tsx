'use client';

// Concept L1 "Linen". The familiar shape, made of warm paper: a conversation
// list, a thread, a composer. Nothing to learn. This file owns all product
// state (threads, the one live job, errors, drafts) on top of useChatEngine,
// which is the entire backend surface.

import 'katex/dist/katex.min.css';
import './linen.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatEngine, type EngineMessage, type SendCallbacks } from '../../engine/useChatEngine';
import type { PlanId } from '../../lib';
import {
  imgWire, loadLinen, messageText, newThread, saveLinen, titleFrom, uid,
  type LiveJob, type Msg, type Thread,
} from './store';
import Sidebar from './Sidebar';
import ThreadView from './Thread';

// Submission context: the last 10 messages, the new user turn included.
const CONTEXT_WINDOW = 10;
const STREAM_FLUSH_MS = 100;
const DEFAULT_MODEL: PlanId = 'max';

type RetryPayload = { messages: EngineMessage[]; model: string; think: boolean };

export default function Linen() {
  const engine = useChatEngine();

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Model and thinking choice for the not-yet-created conversation.
  const [newModel, setNewModel] = useState<PlanId>(DEFAULT_MODEL);
  const [newThink, setNewThink] = useState(false);
  const [live, setLive] = useState<LiveJob | null>(null);
  const liveRef = useRef<LiveJob | null>(null);
  useEffect(() => { liveRef.current = live; }, [live]);
  const [errors, setErrors] = useState<Record<string, { message: string; retryable: boolean }>>({});
  const [anonBlocked, setAnonBlocked] = useState(false);
  // A generated image still rendering after the text turn completed.
  const [pendingImage, setPendingImageState] = useState<{ threadId: string; messageId: string } | null>(null);
  const pendingImageRef = useRef<typeof pendingImage>(null);
  const setPendingImage = useCallback((v: { threadId: string; messageId: string } | null) => {
    pendingImageRef.current = v;
    setPendingImageState(v);
  }, []);

  const draftsRef = useRef<Record<string, string>>({});
  const retryRef = useRef<Record<string, RetryPayload>>({});
  // Stream buffer is the authoritative text; state gets throttled flushes so
  // markdown re-parsing stays at ~10/sec instead of per token.
  const bufRef = useRef('');
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage after mount (a microtask keeps the splash for
  // exactly one paint and the store read off the render path). Resume where
  // the reader was, if that conversation still exists.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const { threads: stored, selectedId: sel } = loadLinen();
      setThreads(stored);
      if (sel && stored.some(t => t.id === sel)) setSelectedId(sel);
    });
    return () => { cancelled = true; };
  }, []);

  // Write-through persistence, place included.
  useEffect(() => {
    if (threads !== null) saveLinen(threads, selectedId);
  }, [threads, selectedId]);

  const commit = useCallback((up: (prev: Thread[]) => Thread[]) => {
    setThreads(prev => up(prev ?? []));
  }, []);

  const clearError = useCallback((threadId: string) => {
    setErrors(e => {
      if (!(threadId in e)) return e;
      const next = { ...e };
      delete next[threadId];
      return next;
    });
  }, []);

  // ---- thread mutations ----

  const appendMessage = useCallback((threadId: string, msg: Msg) => {
    commit(prev => prev.map(t => t.id !== threadId ? t : { ...t, messages: [...t.messages, msg], updatedAt: msg.createdAt }));
  }, [commit]);

  const attachImages = useCallback((threadId: string, messageId: string, images: string[]) => {
    commit(prev => prev.map(t => t.id !== threadId ? t : {
      ...t,
      messages: t.messages.map(m => m.id === messageId ? { ...m, images: [...(m.images ?? []), ...images] } : m),
    }));
  }, [commit]);

  const openThread = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(false);
  }, []);

  const startNew = useCallback(() => {
    setSelectedId(null);
    setDrawerOpen(false);
  }, []);

  const renameThread = useCallback((id: string, title: string) => {
    commit(prev => prev.map(t => t.id === id ? { ...t, title, autoTitle: false } : t));
  }, [commit]);

  const deleteThread = useCallback((id: string) => {
    if (liveRef.current?.threadId === id) {
      engine.cancel();
      if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
      bufRef.current = '';
      setLive(null);
    }
    delete draftsRef.current[id];
    delete retryRef.current[id];
    clearError(id);
    if (pendingImageRef.current?.threadId === id) setPendingImage(null);
    commit(prev => prev.filter(t => t.id !== id));
    setSelectedId(s => (s === id ? null : s));
  }, [commit, engine, clearError, setPendingImage]);

  const selectModel = useCallback((m: PlanId) => {
    if (selectedId) commit(prev => prev.map(t => t.id === selectedId ? { ...t, model: m } : t));
    else setNewModel(m);
  }, [selectedId, commit]);

  const toggleThink = useCallback(() => {
    if (selectedId) commit(prev => prev.map(t => t.id === selectedId ? { ...t, think: !t.think } : t));
    else setNewThink(v => !v);
  }, [selectedId, commit]);

  // ---- the live job ----

  const makeCallbacks = useCallback((threadId: string): SendCallbacks => {
    const flush = () => {
      flushRef.current = null;
      setLive(l => (l && l.threadId === threadId ? { ...l, status: 'streaming', text: bufRef.current } : l));
    };
    return {
      onQueue: pos => setLive(l => (l && l.threadId === threadId ? { ...l, queuePos: pos } : l)),
      onSearching: () => setLive(l => (l && l.threadId === threadId ? { ...l, status: 'searching' } : l)),
      onSources: sources => setLive(l => (l && l.threadId === threadId ? { ...l, sources } : l)),
      onGeneratingImage: () => setLive(l => (l && l.threadId === threadId ? { ...l, genImage: true } : l)),
      onDelta: chunk => {
        bufRef.current += chunk;
        if (!flushRef.current) flushRef.current = setTimeout(flush, STREAM_FLUSH_MS);
      },
      onComplete: (finalText, meta) => {
        if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
        const wasGeneratingImage = liveRef.current?.threadId === threadId ? liveRef.current.genImage : false;
        bufRef.current = '';
        let content = finalText || 'The network returned an empty response.';
        if (meta.thinkSeconds !== null && content.includes('</think>')) {
          content = content.replace('</think>', `</think><!--think_time:${meta.thinkSeconds}-->`);
        }
        if (meta.sources.length > 0) content += `\n---SOURCES---${JSON.stringify(meta.sources)}`;
        const msg: Msg = {
          id: uid('m'),
          role: 'assistant',
          content,
          images: meta.images.length > 0 ? meta.images : undefined,
          createdAt: new Date().toISOString(),
        };
        appendMessage(threadId, msg);
        setLive(null);
        // The async image path can land after the text turn; keep a skeleton
        // under the saved message until job:image / job:image_error arrives.
        if (wasGeneratingImage && meta.images.length === 0) {
          setPendingImage({ threadId, messageId: msg.id });
          setTimeout(() => {
            if (pendingImageRef.current?.messageId === msg.id) setPendingImage(null);
          }, 200000);
        }
      },
      onImage: images => {
        // While streaming, the engine folds images into onComplete meta; this
        // path only matters for images that arrive after completion.
        if (liveRef.current && liveRef.current.threadId === threadId) return;
        const p = pendingImageRef.current;
        if (!p || p.threadId !== threadId) return;
        setPendingImage(null);
        if (images.length > 0) attachImages(threadId, p.messageId, images);
        else setErrors(e => ({ ...e, [threadId]: { message: 'The image failed to render. You were refunded.', retryable: false } }));
      },
      onError: message => {
        if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
        bufRef.current = '';
        setLive(null);
        if (/^ANON_/.test(message)) setAnonBlocked(true);
        else setErrors(e => ({ ...e, [threadId]: { message, retryable: true } }));
      },
    };
  }, [appendMessage, attachImages, setPendingImage]);

  const launch = useCallback((threadId: string, payload: RetryPayload) => {
    retryRef.current[threadId] = payload;
    clearError(threadId);
    bufRef.current = '';
    setLive({ threadId, status: 'queued', text: '', queuePos: null, sources: [], genImage: false });
    void engine.send(payload, makeCallbacks(threadId)).then(ok => {
      // A refused submit (engine busy) never fires callbacks; drop the shell.
      if (!ok) setLive(l => (l && l.threadId === threadId && l.status === 'queued' && !l.text ? null : l));
    });
  }, [engine, makeCallbacks, clearError]);

  const sendPrompt = useCallback((text: string, images: string[]): boolean => {
    if (engine.busy || liveRef.current || !engine.connected) return false;
    if (!engine.isAuthenticated &&
        (engine.anonCapReached || (engine.anonRemaining !== null && engine.anonRemaining <= 0))) {
      setAnonBlocked(true);
      return false;
    }
    const existing = selectedId ? (threads ?? []).find(t => t.id === selectedId) ?? null : null;
    const model = existing ? existing.model : newModel;
    const think = existing ? existing.think : newThink;
    const plan = engine.models.find(m => m.id === model) ?? engine.models[0];
    const content = text.trim() || (images.length > 0 ? 'What is in this image?' : '');
    if (!content) return false;

    const userMsg: Msg = {
      id: uid('m'),
      role: 'user',
      content,
      images: plan.vision && images.length > 0 ? images.slice(0, 4) : undefined,
      createdAt: new Date().toISOString(),
    };

    let threadId: string;
    let history: Msg[];
    if (existing) {
      threadId = existing.id;
      history = existing.messages;
      appendMessage(threadId, userMsg);
    } else {
      // The first message creates the conversation and names it.
      const t = newThread(model, think);
      t.title = titleFrom(content);
      t.messages = [userMsg];
      t.updatedAt = userMsg.createdAt;
      threadId = t.id;
      history = [];
      commit(prev => [t, ...prev]);
      setSelectedId(t.id);
      delete draftsRef.current['new'];
    }

    // Context: last N turns. Assistant history is cleaned (think blocks and
    // source tails off); images ride only on user turns and only for vision
    // models, since text-only workers reject multimodal input.
    const context: EngineMessage[] = [...history, userMsg].slice(-CONTEXT_WINDOW).map(m => {
      const em: EngineMessage = {
        role: m.role,
        content: m.role === 'assistant' ? messageText(m) : m.content,
      };
      if (plan.vision && m.role === 'user' && m.images && m.images.length > 0) {
        em.images = m.images.map(imgWire);
      }
      return em;
    });

    launch(threadId, { messages: context, model: plan.modelId, think: plan.thinking && think });
    return true;
  }, [engine, threads, selectedId, newModel, newThink, appendMessage, commit, launch]);

  const retrySend = useCallback(() => {
    if (!selectedId) return;
    const payload = retryRef.current[selectedId];
    if (!payload || engine.busy || liveRef.current) return;
    launch(selectedId, payload);
  }, [selectedId, engine, launch]);

  // Stop keeps whatever streamed in as an honest partial answer.
  const stopLive = useCallback(() => {
    const l = liveRef.current;
    if (!l) return;
    engine.cancel();
    if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
    const partial = bufRef.current.trim();
    bufRef.current = '';
    if (partial) {
      appendMessage(l.threadId, { id: uid('m'), role: 'assistant', content: partial, createdAt: new Date().toISOString() });
    }
    setLive(null);
  }, [engine, appendMessage]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // ---- render ----

  if (threads === null || engine.authLoading || !engine.anonReady) {
    return (
      <div className="ln-root ln-canvas h-dvh w-full flex items-center justify-center ui-readable">
        <span className="ln-breathe pixel-serif-logo text-[19px] ln-mute select-none">
          c<span>0</span>mpute
        </span>
      </div>
    );
  }

  const selected = selectedId ? threads.find(t => t.id === selectedId) ?? null : null;
  const model = selected?.model ?? newModel;
  const think = selected?.think ?? newThink;
  const plan = engine.models.find(m => m.id === model) ?? engine.models[0];
  const draftKey = selected?.id ?? 'new';

  return (
    <div className="ln-root h-dvh w-full flex overflow-hidden ui-readable">
      <Sidebar
        engine={engine}
        threads={threads}
        selectedId={selected?.id ?? null}
        liveThreadId={live?.threadId ?? null}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={openThread}
        onNew={startNew}
        onRename={renameThread}
        onDelete={deleteThread}
      />
      <main className="ln-canvas flex-1 min-w-0 flex flex-col">
        <ThreadView
          key={draftKey}
          engine={engine}
          thread={selected}
          plan={plan}
          think={think}
          live={live}
          error={selected ? errors[selected.id]?.message ?? null : null}
          canRetry={selected ? errors[selected.id]?.retryable ?? false : false}
          pendingImageMsgId={selected && pendingImage && pendingImage.threadId === selected.id ? pendingImage.messageId : null}
          anonBlocked={anonBlocked}
          draftKey={draftKey}
          getDraft={() => draftsRef.current[draftKey] ?? ''}
          onDraftChange={t => { draftsRef.current[draftKey] = t; }}
          onOpenSidebar={() => setDrawerOpen(true)}
          onNew={startNew}
          onRename={t => { if (selected) renameThread(selected.id, t); }}
          onSend={sendPrompt}
          onRetry={retrySend}
          onStop={stopLive}
          onDismissError={() => { if (selected) clearError(selected.id); }}
          onSelectModel={selectModel}
          onToggleThink={toggleThink}
        />
      </main>
    </div>
  );
}
