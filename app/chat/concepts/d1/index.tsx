'use client';

// Concept D1 — "The desk, with the receipt woven in". The C2 desk (the library
// of conversations IS the home screen, a conversation is a place you enter) with
// the network's provenance DNA transplanted from C3: every reply the network
// serves is observed as it runs and closes with a quiet receipt, the cards carry
// their work history, the desk shows the live network, and each conversation
// keeps a small work ledger. This file owns all product state on top of
// useChatEngine, which is the entire backend surface, and turns engine callbacks
// into the persisted receipts.

import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatEngine, type EngineMessage, type SendCallbacks } from '../../engine/useChatEngine';
import type { PlanId } from '../../lib';
import {
  costLaneFor, imgWire, loadDesk, messageText, newConvo, saveDesk, tailOf, uid,
  type Convo, type DeskMessage, type LiveJob, type Provenance, type ProvBase,
} from './store';
import Library from './Library';
import Room from './Room';

// Submission context: the last 10 messages, the new user turn included.
const CONTEXT_WINDOW = 10;
const STREAM_FLUSH_MS = 120;
const DEFAULT_MODEL: PlanId = 'max';

type RetryPayload = { messages: EngineMessage[]; model: string; think: boolean };

export default function DeskOne() {
  const engine = useChatEngine();

  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
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
  // The provenance base captured at submit time plus the worst queue position
  // observed while the job runs — the authoritative source for the receipt,
  // kept off React state so batching can't lose a late queue update.
  const jobRef = useRef<{ base: ProvBase; queuePeak: number | null } | null>(null);
  // Stream buffer is the authoritative text; state gets throttled flushes so
  // markdown re-parsing stays at ~8/sec instead of per token.
  const bufRef = useRef('');
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate the desk from localStorage after mount (a microtask keeps the
  // splash for exactly one paint and the store read off the render path).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setConvos(loadDesk());
    });
    return () => { cancelled = true; };
  }, []);

  const commit = useCallback((up: (prev: Convo[]) => Convo[]) => {
    setConvos(prev => {
      const next = up(prev ?? []);
      saveDesk(next);
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

  const createConvo = useCallback((draft?: string) => {
    const c = newConvo(DEFAULT_MODEL);
    if (draft) draftsRef.current[c.id] = draft;
    commit(prev => [c, ...prev]);
    setFocusedId(c.id);
  }, [commit]);

  // Leaving the room prunes never-written drafts so the desk only holds real
  // conversations. A convo with a pending draft or a running job stays.
  const backToDesk = useCallback(() => {
    setFocusedId(null);
    commit(prev => prev.filter(c =>
      c.messages.length > 0 ||
      !c.autoSubject ||
      c.id === liveRef.current?.convoId ||
      (draftsRef.current[c.id] ?? '').trim() !== ''
    ));
  }, [commit]);

  const renameConvo = useCallback((id: string, subject: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, subject, autoSubject: false } : c));
  }, [commit]);

  const togglePin = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, [commit]);

  const toggleArchive = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, archived: !c.archived, pinned: false } : c));
  }, [commit]);

  const deleteConvo = useCallback((id: string) => {
    if (liveRef.current?.convoId === id) {
      engine.cancel();
      if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
      bufRef.current = '';
      jobRef.current = null;
      setLive(null);
    }
    delete draftsRef.current[id];
    delete retryRef.current[id];
    clearError(id);
    if (pendingImageRef.current?.convoId === id) setPendingImage(null);
    commit(prev => prev.filter(c => c.id !== id));
    setFocusedId(f => (f === id ? null : f));
  }, [commit, engine, clearError, setPendingImage]);

  const setModel = useCallback((id: string, model: PlanId) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, model } : c));
  }, [commit]);

  const toggleThink = useCallback((id: string) => {
    commit(prev => prev.map(c => c.id === id ? { ...c, think: !c.think } : c));
  }, [commit]);

  // ---- the live job ----

  const makeCallbacks = useCallback((convoId: string): SendCallbacks => {
    const flush = () => {
      flushRef.current = null;
      setLive(l => (l && l.convoId === convoId ? { ...l, status: 'streaming', text: bufRef.current } : l));
    };
    return {
      onQueue: pos => {
        // Track the worst queue position for the reply's receipt.
        const j = jobRef.current;
        if (j && pos !== null && pos > (j.queuePeak ?? 0)) j.queuePeak = pos;
        setLive(l => {
          if (!l || l.convoId !== convoId) return l;
          const queuePeak = pos !== null && pos > (l.queuePeak ?? 0) ? pos : l.queuePeak;
          return { ...l, queuePos: pos, queuePeak };
        });
      },
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
        // Close the receipt from what we observed while the job ran.
        const job = jobRef.current;
        const provenance: Provenance | undefined = job ? {
          model: job.base.model,
          planId: job.base.planId,
          costLabel: job.base.costLabel,
          costCredits: job.base.costCredits,
          elapsedMs: Math.max(0, Date.now() - job.base.submittedAt),
          thinkSeconds: meta.thinkSeconds,
          sourcesCount: meta.sources.length,
          queuePeak: job.queuePeak,
          servedAt: new Date().toISOString(),
        } : undefined;
        const msg: DeskMessage = {
          id: uid('m'),
          role: 'assistant',
          content,
          images: meta.images.length > 0 ? meta.images : undefined,
          createdAt: new Date().toISOString(),
          provenance,
        };
        appendMessage(convoId, msg);
        jobRef.current = null;
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
        jobRef.current = null;
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
    // Observe the cost lane and model at the moment of submit; these become the
    // reply's receipt regardless of how credits move afterward.
    const plan = engine.models.find(m => m.modelId === payload.model) ?? engine.models[0];
    const lane = costLaneFor(engine.isAuthenticated, engine.credits, plan);
    const base: ProvBase = {
      model: plan.name,
      planId: plan.id,
      costLabel: lane.costLabel,
      costCredits: lane.costCredits,
      submittedAt: Date.now(),
    };
    jobRef.current = { base, queuePeak: null };
    setLive({ convoId, status: 'queued', text: '', queuePos: null, queuePeak: null, sources: [], genImage: false, submittedAt: base.submittedAt, prov: base });
    void engine.send(payload, makeCallbacks(convoId)).then(ok => {
      // A refused submit (engine busy) never fires callbacks; drop the shell.
      if (!ok) {
        jobRef.current = null;
        setLive(l => (l && l.convoId === convoId && l.status === 'queued' && !l.text ? null : l));
      }
    });
  }, [engine, makeCallbacks, clearError]);

  const sendPrompt = useCallback((convoId: string, text: string, images: string[]): boolean => {
    const convo = (convos ?? []).find(c => c.id === convoId);
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
  }, [convos, engine, appendMessage, launch]);

  const retrySend = useCallback((convoId: string) => {
    const payload = retryRef.current[convoId];
    if (!payload || engine.busy || liveRef.current) return;
    launch(convoId, payload);
  }, [engine, launch]);

  // Stop keeps whatever streamed in as an honest partial answer. A stopped reply
  // was never completed, so it carries no receipt (an omitted, not invented, one).
  const stopLive = useCallback(() => {
    const l = liveRef.current;
    if (!l) return;
    engine.cancel();
    if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
    const partial = bufRef.current.trim();
    bufRef.current = '';
    jobRef.current = null;
    if (partial) {
      appendMessage(l.convoId, { id: uid('m'), role: 'assistant', content: partial, createdAt: new Date().toISOString() });
    }
    setLive(null);
  }, [engine, appendMessage]);

  // ---- render ----

  if (convos === null || engine.authLoading || !engine.anonReady) {
    return (
      <div className="h-dvh w-full bg-[#0c0a09] flex items-center justify-center ui-readable">
        <span className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 animate-pulse">setting the desk</span>
      </div>
    );
  }

  const focused = focusedId ? convos.find(c => c.id === focusedId) ?? null : null;

  return (
    <div className="h-dvh w-full bg-[#0c0a09] text-white flex flex-col overflow-hidden ui-readable">
      {focused ? (
        <Room
          engine={engine}
          convo={focused}
          live={live}
          error={errors[focused.id]?.message ?? null}
          canRetry={errors[focused.id]?.retryable ?? false}
          pendingImageMsgId={pendingImage && pendingImage.convoId === focused.id ? pendingImage.messageId : null}
          anonBlocked={anonBlocked}
          getDraft={() => draftsRef.current[focused.id] ?? ''}
          onDraftChange={t => { draftsRef.current[focused.id] = t; }}
          onBack={backToDesk}
          onRename={s => renameConvo(focused.id, s)}
          onTogglePin={() => togglePin(focused.id)}
          onToggleArchive={() => toggleArchive(focused.id)}
          onDelete={() => deleteConvo(focused.id)}
          onSend={(text, images) => sendPrompt(focused.id, text, images)}
          onRetry={() => retrySend(focused.id)}
          onStop={stopLive}
          onDismissError={() => clearError(focused.id)}
          onSelectModel={m => setModel(focused.id, m)}
          onToggleThink={() => toggleThink(focused.id)}
        />
      ) : (
        <Library
          engine={engine}
          convos={convos}
          liveConvoId={live?.convoId ?? null}
          onOpen={setFocusedId}
          onCreate={createConvo}
          onTogglePin={togglePin}
          onToggleArchive={toggleArchive}
          onDelete={deleteConvo}
          onRename={renameConvo}
        />
      )}
    </div>
  );
}
