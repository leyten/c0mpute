'use client';

// Iteration D2 — "the desk, deeper": the desk taken further as a workspace.
// The library of conversations is still the home screen, but a conversation is
// now something you can open, tag, and set side by side with another. This file
// owns all product state (desk records, the prompt library, the one live job,
// errors, drafts, and the pane layout) on top of useChatEngine, which is the
// entire backend surface. The engine runs one job at a time; the layout above
// it can hold two conversations, so the idle pane simply waits its turn.

import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatEngine, type EngineMessage, type SendCallbacks } from '../../engine/useChatEngine';
import type { PlanId } from '../../lib';
import {
  imgWire, loadDesk, messageText, newConvo, normalizeTag, saveDesk, tailOf, uid, MAX_TAGS,
  type Convo, type DeskMessage, type LiveJob, type Prompt,
} from './store';
import Library from './Library';
import Room from './Room';
import Picker from './Picker';

// Submission context: the last 10 messages, the new user turn included.
const CONTEXT_WINDOW = 10;
const STREAM_FLUSH_MS = 120;
const DEFAULT_MODEL: PlanId = 'max';
const WIDE_QUERY = '(min-width: 1024px)';

type RetryPayload = { messages: EngineMessage[]; model: string; think: boolean };

export default function DeskTwo() {
  const engine = useChatEngine();

  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const convosRef = useRef<Convo[]>([]);
  const promptsRef = useRef<Prompt[]>([]);

  // Pane layout: 0, 1, or 2 open conversations. Empty is the library home.
  // A second pane and the picker only exist on wide screens.
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activePane, setActivePane] = useState(0);
  const [picking, setPicking] = useState(false);
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);
  const openIdsRef = useRef<string[]>([]);
  const activePaneRef = useRef(0);
  const pickingRef = useRef(false);
  const isWideRef = useRef(isWide);
  useEffect(() => { openIdsRef.current = openIds; }, [openIds]);
  useEffect(() => { activePaneRef.current = activePane; }, [activePane]);
  useEffect(() => { pickingRef.current = picking; }, [picking]);
  useEffect(() => { isWideRef.current = isWide; }, [isWide]);

  useEffect(() => { if (convos) convosRef.current = convos; }, [convos]);
  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

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

  const draftsRef = useRef<Record<string, string>>({});
  const retryRef = useRef<Record<string, RetryPayload>>({});
  // Stream buffer is the authoritative text; state gets throttled flushes so
  // markdown re-parsing stays at ~8/sec instead of per token.
  const bufRef = useRef('');
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate the desk from localStorage after mount (a microtask keeps the
  // splash for exactly one paint and the store read off the render path).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const data = loadDesk();
      convosRef.current = data.conversations;
      promptsRef.current = data.prompts;
      setConvos(data.conversations);
      setPrompts(data.prompts);
    });
    return () => { cancelled = true; };
  }, []);

  // Track the wide breakpoint; when it drops below wide, split collapses to the
  // active pane. Both live in the subscription callback so nothing reconciles
  // across a second render.
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => {
      const wide = mq.matches;
      setIsWide(wide);
      if (!wide) {
        setPicking(false);
        setOpenIds(prev => (prev.length > 1 ? [prev[Math.min(activePaneRef.current, prev.length - 1)]] : prev));
        setActivePane(0);
      }
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // conversations and prompts share one persisted file; either mutation saves both.
  const commit = useCallback((up: (prev: Convo[]) => Convo[]) => {
    setConvos(prev => {
      const next = up(prev ?? []);
      convosRef.current = next;
      saveDesk({ conversations: next, prompts: promptsRef.current });
      return next;
    });
  }, []);
  const commitPrompts = useCallback((up: (prev: Prompt[]) => Prompt[]) => {
    setPrompts(prev => {
      const next = up(prev);
      promptsRef.current = next;
      saveDesk({ conversations: convosRef.current, prompts: next });
      return next;
    });
  }, []);

  const clearError = useCallback((convoId: string) => {
    setErrors(e => {
      if (!(convoId in e)) return e;
      const next = { ...e };
      delete next[convoId];
      return next;
    });
  }, []);

  // A conversation is worth keeping if it has real content, was renamed, is
  // still open in a pane, is the live job, or holds an unsent draft.
  const worthKeeping = useCallback((c: Convo, stillOpen: string[]) =>
    c.messages.length > 0 ||
    !c.autoSubject ||
    stillOpen.includes(c.id) ||
    c.id === liveRef.current?.convoId ||
    (draftsRef.current[c.id] ?? '').trim() !== '',
  []);

  // ---- desk mutations ----

  const appendMessage = useCallback((convoId: string, msg: DeskMessage) => {
    commit(prev => prev.map(c => {
      if (c.id !== convoId) return c;
      const subject = c.autoSubject && msg.role === 'user' && c.messages.length === 0
        ? (msg.content.length > 60 ? msg.content.slice(0, 57) + '…' : msg.content)
        : c.subject;
      return { ...c, subject, messages: [...c.messages, msg], tail: tailOf(msg.content) || c.tail, updatedAt: msg.createdAt };
    }));
  }, [commit]);

  const attachImages = useCallback((convoId: string, messageId: string, images: string[]) => {
    commit(prev => prev.map(c => c.id !== convoId ? c : {
      ...c,
      messages: c.messages.map(m => m.id === messageId ? { ...m, images: [...(m.images ?? []), ...images] } : m),
    }));
  }, [commit]);

  // ---- pane layout ----

  const openConvo = useCallback((id: string, beside = false) => {
    const cur = openIdsRef.current;
    if (cur.includes(id)) { setActivePane(cur.indexOf(id)); setPicking(false); return; }
    if (beside && isWideRef.current && cur.length === 1) {
      setOpenIds([cur[0], id]);
      setActivePane(1);
      setPicking(false);
      return;
    }
    setOpenIds([id]);
    setActivePane(0);
    setPicking(false);
  }, []);

  const createConvo = useCallback((draft?: string, beside = false) => {
    const c = newConvo(DEFAULT_MODEL);
    if (draft) draftsRef.current[c.id] = draft;
    commit(prev => [c, ...prev]);
    const cur = openIdsRef.current;
    if (beside && isWideRef.current && cur.length === 1) {
      setOpenIds([cur[0], c.id]);
      setActivePane(1);
    } else {
      setOpenIds([c.id]);
      setActivePane(0);
    }
    setPicking(false);
  }, [commit]);

  // Closing prunes any pane conversation that was only a blank draft.
  const closePane = useCallback((idx: number) => {
    const remaining = openIdsRef.current.filter((_, i) => i !== idx);
    setPicking(false);
    setActivePane(0);
    setOpenIds(remaining);
    commit(prev => prev.filter(c => worthKeeping(c, remaining)));
  }, [commit, worthKeeping]);

  const backToDesk = useCallback(() => {
    setPicking(false);
    setActivePane(0);
    setOpenIds([]);
    commit(prev => prev.filter(c => worthKeeping(c, [])));
  }, [commit, worthKeeping]);

  const openPicker = useCallback(() => {
    if (isWideRef.current && openIdsRef.current.length === 1) setPicking(true);
  }, []);

  const renameConvo = useCallback((id: string, subject: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, subject, autoSubject: false } : c));
  }, [commit]);

  const togglePin = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, [commit]);

  const toggleArchive = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, archived: !c.archived, pinned: false } : c));
  }, [commit]);

  const addTag = useCallback((id: string, raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    commit(prev => prev.map(c => {
      if (c.id !== id || c.tags.includes(t) || c.tags.length >= MAX_TAGS) return c;
      return { ...c, tags: [...c.tags, t] };
    }));
  }, [commit]);

  const removeTag = useCallback((id: string, t: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, tags: c.tags.filter(x => x !== t) } : c));
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
    setOpenIds(prev => prev.filter(x => x !== id));
    setActivePane(0);
    setPicking(false);
  }, [commit, engine, clearError, setPendingImage]);

  const setModel = useCallback((id: string, model: PlanId) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, model } : c));
  }, [commit]);

  const toggleThink = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, think: !c.think } : c));
  }, [commit]);

  // ---- the prompt library ----

  const savePrompt = useCallback((name: string, body: string) => {
    commitPrompts(prev => [{ id: uid('p'), name, body }, ...prev]);
  }, [commitPrompts]);

  const deletePrompt = useCallback((id: string) => {
    commitPrompts(prev => prev.filter(p => p.id !== id));
  }, [commitPrompts]);

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
        const msg: DeskMessage = {
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

  const sendPrompt = useCallback((convoId: string, text: string, images: string[]): boolean => {
    const convo = (convosRef.current).find(c => c.id === convoId);
    if (!convo || engine.busy || liveRef.current || !engine.connected) return false;
    if (!engine.isAuthenticated &&
        (engine.anonCapReached || (engine.anonRemaining !== null && engine.anonRemaining <= 0))) {
      setAnonBlocked(true);
      return false;
    }
    const plan = engine.models.find(m => m.id === convo.model) ?? engine.models[0];
    const content = text.trim() || (images.length > 0 ? 'What is in this image?' : '');
    if (!content) return false;

    const userMsg: DeskMessage = {
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
  }, [engine, appendMessage, launch]);

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

  // Escape steps back one level: cancel the picker, then close the active pane,
  // then leave to the desk. Inputs keep their own Escape (rename, search, tags).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'INPUT') return;
      if (pickingRef.current) { setPicking(false); return; }
      const n = openIdsRef.current.length;
      if (n === 0) return;
      if (n === 2) closePane(activePaneRef.current);
      else backToDesk();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePane, backToDesk]);

  // ---- render ----

  if (convos === null || engine.authLoading || !engine.anonReady) {
    return (
      <div className="h-dvh w-full bg-[#0c0a09] flex items-center justify-center ui-readable">
        <span className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 animate-pulse">setting the desk</span>
      </div>
    );
  }

  const panes = openIds.map(id => convos.find(c => c.id === id)).filter((c): c is Convo => !!c);
  const twoUp = isWide && !picking && panes.length === 2;

  const renderRoom = (paneIdx: number) => {
    const c = panes[paneIdx];
    return (
      <Room
        key={c.id}
        engine={engine}
        convo={c}
        live={live}
        error={errors[c.id]?.message ?? null}
        canRetry={errors[c.id]?.retryable ?? false}
        pendingImageMsgId={pendingImage && pendingImage.convoId === c.id ? pendingImage.messageId : null}
        anonBlocked={anonBlocked}
        prompts={prompts}
        split={twoUp}
        active={paneIdx === activePane}
        canSplit={isWide && panes.length === 1 && !picking}
        getDraft={() => draftsRef.current[c.id] ?? ''}
        onDraftChange={t => { draftsRef.current[c.id] = t; }}
        onFocus={() => setActivePane(paneIdx)}
        onClose={() => closePane(paneIdx)}
        onSplit={openPicker}
        onRename={s => renameConvo(c.id, s)}
        onTogglePin={() => togglePin(c.id)}
        onToggleArchive={() => toggleArchive(c.id)}
        onDelete={() => deleteConvo(c.id)}
        onSend={(text, images) => sendPrompt(c.id, text, images)}
        onRetry={() => retrySend(c.id)}
        onStop={stopLive}
        onDismissError={() => clearError(c.id)}
        onSelectModel={m => setModel(c.id, m)}
        onToggleThink={() => toggleThink(c.id)}
        onAddTag={t => addTag(c.id, t)}
        onRemoveTag={t => removeTag(c.id, t)}
        onSavePrompt={savePrompt}
        onDeletePrompt={deletePrompt}
      />
    );
  };

  let body: React.ReactNode;
  if (panes.length === 0) {
    body = (
      <Library
        engine={engine}
        convos={convos}
        liveConvoId={live?.convoId ?? null}
        onOpen={id => openConvo(id)}
        onCreate={d => createConvo(d)}
        onTogglePin={togglePin}
        onToggleArchive={toggleArchive}
        onDelete={deleteConvo}
        onRename={renameConvo}
        onAddTag={addTag}
        onRemoveTag={removeTag}
      />
    );
  } else if (!isWide) {
    // Single pane only below the wide breakpoint.
    body = renderRoom(Math.min(activePane, panes.length - 1));
  } else {
    body = (
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 h-full">{renderRoom(0)}</div>
        {picking ? (
          <div className="flex-1 min-w-0 h-full border-l border-white/10">
            <Picker
              engine={engine}
              convos={convos}
              excludeId={panes[0].id}
              liveConvoId={live?.convoId ?? null}
              onPick={id => openConvo(id, true)}
              onCreate={d => createConvo(d, true)}
              onClose={() => setPicking(false)}
            />
          </div>
        ) : panes.length === 2 ? (
          <div className="flex-1 min-w-0 h-full border-l border-white/10">{renderRoom(1)}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="h-dvh w-full bg-[#0c0a09] text-white flex flex-col overflow-hidden ui-readable">
      {body}
    </div>
  );
}
