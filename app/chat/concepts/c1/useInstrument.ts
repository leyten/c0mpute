'use client';

// The instrument's single stateful core. Owns the thread store (persistence,
// selection, rename/delete), the composer draft (text + attached images), and
// the streaming turn pipeline over useChatEngine.send. Every UI surface
// (transcript, composer, status line, palette) reads from this one hook.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useChatEngine, type EngineMessage } from '../../engine/useChatEngine';
import { parseThinking, type Plan, type PlanId } from '../../lib';
import { MAX_INPUT_CHARS, type StoredMessage, type Thread, type Turn, type TurnError } from './types';
import {
  SERVER_SNAPSHOT, getServerStoreSnapshot, getStoreSnapshot, makeId, subscribeStore, titleFrom, updateStore,
} from './store';

const FLUSH_MS = 100; // markdown re-render throttle while streaming

function friendlyError(threadId: string, raw: string): TurnError {
  if (raw === 'ANON_NO_PROMPTS') {
    return { threadId, message: 'Your free prompts are used up. Sign in to keep going.', signIn: true };
  }
  if (raw === 'ANON_CAP_IP' || raw === 'ANON_CAP_GLOBAL' || raw === 'ANON_CAP_HOURLY') {
    return { threadId, message: 'The free lane is at capacity right now. Sign in to continue.', signIn: true };
  }
  if (raw.includes('Insufficient credits')) {
    return { threadId, message: 'Not enough credits for this prompt.', topUp: true };
  }
  return { threadId, message: raw || 'The job failed.' };
}

export function useInstrument() {
  const engine = useChatEngine();

  // ---- persisted state (external store; SSR gets the empty snapshot) ----
  const store = useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerStoreSnapshot);
  const hydrated = store !== SERVER_SNAPSHOT;
  const { threads, activeId, defaultModel } = store;
  const [defaultThink, setDefaultThink] = useState(false);

  // ---- composer draft ----
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // ---- turn state ----
  const [turn, setTurn] = useState<Turn | null>(null);
  const [turnError, setTurnError] = useState<TurnError | null>(null);
  const [awaitingImage, setAwaitingImage] = useState<{ threadId: string; messageId: string } | null>(null);
  const turnRef = useRef<Turn | null>(null);
  useEffect(() => { turnRef.current = turn; }, [turn]);
  const bufferRef = useRef('');
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagingRef = useRef(false);

  // ---- derived ----
  const activeThread = threads.find(t => t.id === activeId) ?? null;
  const currentPlan: Plan = engine.models.find(p => p.id === (activeThread ? activeThread.model : defaultModel)) ?? engine.models[0];
  const currentThink = currentPlan.thinking ? (activeThread ? activeThread.think : defaultThink) : false;

  const patchThread = useCallback((id: string, fn: (t: Thread) => Thread) => {
    updateStore(s => ({ ...s, threads: s.threads.map(t => (t.id === id ? fn(t) : t)) }));
  }, []);

  // ---- thread operations ----
  const newConversation = useCallback(() => {
    updateStore(s => ({ ...s, activeId: null }));
    setTurnError(null);
    setNotice(null);
  }, []);

  const selectThread = useCallback((id: string) => {
    updateStore(s => ({ ...s, activeId: id }));
    setTurnError(null);
    setNotice(null);
  }, []);

  const renameThread = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    patchThread(id, t => ({ ...t, title: clean, updatedAt: new Date().toISOString() }));
  }, [patchThread]);

  const deleteThread = useCallback((id: string) => {
    updateStore(s => ({
      ...s,
      activeId: s.activeId === id ? null : s.activeId,
      threads: s.threads.filter(t => t.id !== id),
    }));
    setTurnError(prev => (prev && prev.threadId === id ? null : prev));
  }, []);

  // ---- model + thinking ----
  const setModel = useCallback((id: PlanId) => {
    const plan = engine.models.find(p => p.id === id);
    if (!plan) return;
    if (!plan.vision) setPendingImages([]);
    if (!plan.thinking) setDefaultThink(false);
    updateStore(s => ({
      ...s,
      defaultModel: id,
      threads: s.activeId
        ? s.threads.map(t => (t.id === s.activeId ? { ...t, model: id, think: plan.thinking ? t.think : false } : t))
        : s.threads,
    }));
  }, [engine.models]);

  const toggleThink = useCallback(() => {
    if (!currentPlan.thinking) return;
    if (activeThread) {
      patchThread(activeThread.id, t => ({ ...t, think: !t.think }));
    } else {
      setDefaultThink(v => !v);
    }
  }, [currentPlan.thinking, activeThread, patchThread]);

  // ---- image attachments (vision models only, max 4, stored as data URIs) ----
  const addImageFiles = useCallback((files: ArrayLike<File>) => {
    if (!currentPlan.vision) return;
    Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 4)
      .forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUri = typeof reader.result === 'string' ? reader.result : null;
          if (dataUri) setPendingImages(prev => (prev.length < 4 ? [...prev, dataUri] : prev));
        };
        reader.readAsDataURL(file);
      });
  }, [currentPlan.vision]);

  const removeImage = useCallback((idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ---- the streaming turn ----
  const flushStream = useCallback(() => {
    flushRef.current = null;
    const text = bufferRef.current;
    setTurn(t => (t ? { ...t, text, searching: false, queuePos: null } : t));
  }, []);

  const runTurn = useCallback(async (thread: Thread) => {
    const plan = engine.models.find(p => p.id === thread.model) ?? engine.models[0];
    // Submission context: the last 10 messages. Assistant history goes back
    // without <think> blocks; images ride only on user messages and only for
    // vision models (text-only workers reject multimodal input).
    const context: EngineMessage[] = thread.messages.slice(-10).map(m => {
      const msg: EngineMessage = {
        role: m.role,
        content: m.role === 'assistant' ? parseThinking(m.content).response : m.content,
      };
      if (plan.vision && m.role === 'user' && m.images && m.images.length > 0) {
        msg.images = m.images;
      }
      return msg;
    });

    bufferRef.current = '';
    if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
    imagingRef.current = false;
    setTurnError(null);
    setTurn({ threadId: thread.id, started: false, queuePos: null, searching: false, imaging: false, text: '', sources: [], images: [] });

    let settled = false; // completed or errored inside the callbacks
    let committedMsgId: string | null = null; // the assistant message this turn wrote

    const ok = await engine.send(
      { messages: context, model: plan.modelId, think: plan.thinking ? thread.think : false },
      {
        onQueue: pos => setTurn(t => (t && t.threadId === thread.id && !t.started ? { ...t, queuePos: pos } : t)),
        onSearching: () => setTurn(t => (t && t.threadId === thread.id ? { ...t, searching: true } : t)),
        onSources: sources => setTurn(t => (t && t.threadId === thread.id ? { ...t, sources } : t)),
        onGeneratingImage: () => {
          imagingRef.current = true;
          setTurn(t => (t && t.threadId === thread.id ? { ...t, imaging: true } : t));
        },
        onDelta: chunk => {
          bufferRef.current += chunk;
          // Only re-render immediately for the first token; afterwards the
          // FLUSH_MS timer batches markdown re-renders.
          setTurn(t => (t && t.threadId === thread.id && (!t.started || t.searching) ? { ...t, started: true, searching: false, queuePos: null } : t));
          if (!flushRef.current) flushRef.current = setTimeout(flushStream, FLUSH_MS);
        },
        onComplete: (finalText, meta) => {
          settled = true;
          if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
          const imaging = imagingRef.current;
          const images = meta.images;
          const content = finalText || (imaging || images.length > 0 ? '' : '[No response received]');
          const message: StoredMessage = {
            id: makeId('m'),
            role: 'assistant',
            content,
            sources: meta.sources.length > 0 ? meta.sources : undefined,
            thinkSeconds: meta.thinkSeconds ?? undefined,
            images: images.length > 0 ? images : undefined,
            createdAt: new Date().toISOString(),
          };
          patchThread(thread.id, t => ({ ...t, messages: [...t.messages, message], updatedAt: message.createdAt }));
          committedMsgId = message.id;
          setTurn(null);
          // The image render path is async: the text turn can finish before the
          // picture lands. Keep a skeleton on the committed message until
          // onImage delivers (or the orchestrator's render ceiling passes).
          if (imaging && images.length === 0) {
            setAwaitingImage({ threadId: thread.id, messageId: message.id });
            setTimeout(() => {
              setAwaitingImage(prev => (prev && prev.messageId === message.id ? null : prev));
            }, 200000);
          }
          imagingRef.current = false;
        },
        onImage: images => {
          const msgId = committedMsgId;
          if (images.length === 0) {
            // image render failed server-side; user was refunded there
            imagingRef.current = false;
            setAwaitingImage(prev => (prev && (msgId === null || prev.messageId === msgId) ? null : prev));
            setTurn(t => (t && t.threadId === thread.id ? { ...t, imaging: false } : t));
            return;
          }
          if (!settled) {
            setTurn(t => (t && t.threadId === thread.id ? { ...t, images: [...t.images, ...images] } : t));
            return;
          }
          if (msgId !== null) {
            patchThread(thread.id, t => ({
              ...t,
              messages: t.messages.map(m => (m.id === msgId ? { ...m, images: [...(m.images ?? []), ...images] } : m)),
            }));
            setAwaitingImage(prev => (prev && prev.messageId === msgId ? null : prev));
          }
        },
        onError: message => {
          settled = true;
          if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
          imagingRef.current = false;
          setTurn(null);
          setTurnError(friendlyError(thread.id, message));
        },
      },
    );

    if (!ok && !settled) {
      setTurn(null);
      setTurnError({ threadId: thread.id, message: 'Could not submit: another response is still running.' });
    }
  }, [engine, patchThread, flushStream]);

  // ---- submit / retry / cancel ----
  const submit = useCallback(() => {
    if (turn || engine.busy) return;
    const text = input.trim();
    const images = currentPlan.vision ? pendingImages.slice(0, 4) : [];
    if (!text && images.length === 0) {
      // Enter on an empty composer retries a failed turn.
      if (turnError && activeThread && turnError.threadId === activeThread.id) {
        const last = activeThread.messages[activeThread.messages.length - 1];
        if (last?.role === 'user') void runTurn(activeThread);
      }
      return;
    }
    if (text.length > MAX_INPUT_CHARS) {
      setNotice(`Prompts are capped at ${MAX_INPUT_CHARS} characters. This one is ${text.length}.`);
      return;
    }
    if (!engine.isAuthenticated && engine.anonRemaining !== null && engine.anonRemaining <= 0) {
      setTurnError({ threadId: activeThread?.id ?? '', message: 'Your free prompts are used up. Sign in to keep going.', signIn: true });
      return;
    }
    setNotice(null);
    const content = text || 'What is in this image?';
    const userMsg: StoredMessage = {
      id: makeId('m'),
      role: 'user',
      content,
      images: images.length > 0 ? images : undefined,
      createdAt: new Date().toISOString(),
    };
    let thread: Thread;
    if (activeThread) {
      thread = {
        ...activeThread,
        messages: [...activeThread.messages, userMsg],
        updatedAt: userMsg.createdAt,
        title: activeThread.messages.length === 0 ? titleFrom(content) : activeThread.title,
      };
      updateStore(s => ({ ...s, threads: s.threads.map(t => (t.id === thread.id ? thread : t)) }));
    } else {
      thread = {
        id: makeId('t'),
        title: titleFrom(content),
        model: currentPlan.id,
        think: currentPlan.thinking ? currentThink : false,
        createdAt: userMsg.createdAt,
        updatedAt: userMsg.createdAt,
        messages: [userMsg],
      };
      updateStore(s => ({ ...s, activeId: thread.id, threads: [thread, ...s.threads] }));
    }
    setInput('');
    setPendingImages([]);
    void runTurn(thread);
  }, [turn, engine.busy, engine.isAuthenticated, engine.anonRemaining, input, pendingImages, currentPlan, currentThink, activeThread, turnError, runTurn]);

  const retry = useCallback(() => {
    if (!activeThread || turn) return;
    const last = activeThread.messages[activeThread.messages.length - 1];
    if (last?.role !== 'user') return;
    void runTurn(activeThread);
  }, [activeThread, turn, runTurn]);

  const cancel = useCallback(() => {
    const t = turnRef.current;
    if (!t) return;
    engine.cancel();
    if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
    const text = bufferRef.current.trim();
    if (text) {
      const message: StoredMessage = {
        id: makeId('m'),
        role: 'assistant',
        content: text,
        sources: t.sources.length > 0 ? t.sources : undefined,
        stopped: true,
        createdAt: new Date().toISOString(),
      };
      patchThread(t.threadId, th => ({ ...th, messages: [...th.messages, message], updatedAt: message.createdAt }));
    }
    imagingRef.current = false;
    setTurn(null);
  }, [engine, patchThread]);

  const dismissError = useCallback(() => setTurnError(null), []);

  return {
    engine,
    hydrated,
    threads,
    activeThread,
    currentPlan,
    currentThink,
    input,
    setInput,
    pendingImages,
    addImageFiles,
    removeImage,
    notice,
    setNotice,
    turn,
    turnError,
    awaitingImage,
    submit,
    retry,
    cancel,
    dismissError,
    newConversation,
    selectThread,
    renameThread,
    deleteThread,
    setModel,
    toggleThink,
  };
}

export type Instrument = ReturnType<typeof useInstrument>;
