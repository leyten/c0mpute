'use client';

// Concept C3 — "The Counter".
//
// Every exchange is a job handed to a real network: you ask, the network
// works, the work comes back with its provenance visible. The conversation
// is a ledger of fulfilled work units; a job in flight shows its lifecycle
// (submitted → queued → serving → done) in the map's square language.
//
// Built entirely on useChatEngine. This component owns all product state:
// the ledger (own localStorage schema), the active flight, model choice,
// and every timing/queue observation that becomes the provenance line.

import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useChatEngine, type EngineMessage, type SendCallbacks } from '../../engine/useChatEngine';
import { parseSourcesFromContent, type Plan, type PlanId } from '../../lib';
import {
  loadLedger, saveLedger, loadPrefs, savePrefs, newId, titleFrom,
  MAX_INPUT_CHARS, type Conversation, type Exchange,
} from './types';
import { Square, Wordmark } from './bits';
import Rail from './Rail';
import Counter from './Counter';
import WorkUnit from './WorkUnit';
import FlightUnit, { type FlightView } from './Flight';

// The mutable in-flight record. Send callbacks write to this object and
// publish immutable snapshots into React state. `done` guards against any
// event landing after withdraw/finalize.
type Flight = FlightView & { done: boolean };

const STARTERS = [
  'Explain speculative decoding and cite sources',
  'Show the math behind attention',
  'Write a Python client for the c0mpute API',
  'Think through how many 24 GB cards a 229B model needs',
];

export default function ConceptThree() {
  const engine = useChatEngine();

  // ---- the ledger ----
  const [convs, setConvs] = useState<Conversation[]>([]);
  const convsRef = useRef<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    const ledger = loadLedger();
    convsRef.current = ledger;
    setConvs(ledger);
    if (ledger.length > 0) {
      const latest = [...ledger].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      setActiveId(latest.id);
    }
    setLoaded(true);
  }, []);

  const mutateConvs = useCallback((fn: (prev: Conversation[]) => Conversation[]) => {
    const next = fn(convsRef.current);
    convsRef.current = next;
    setConvs(next);
    saveLedger(next);
  }, []);

  // ---- model choice (persisted preference) ----
  const [planId, setPlanId] = useState<PlanId>('max');
  const [deepThinking, setDeepThinking] = useState(false);
  const deepThinkingRef = useRef(false);
  useEffect(() => { deepThinkingRef.current = deepThinking; }, [deepThinking]);
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs.planId && engine.models.some(m => m.id === prefs.planId)) setPlanId(prefs.planId as PlanId);
    if (typeof prefs.deepThinking === 'boolean') setDeepThinking(prefs.deepThinking);
    // engine.models is a static catalog; read prefs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const plan: Plan = engine.models.find(m => m.id === planId) ?? engine.models[0];
  const planRef = useRef(plan);
  useEffect(() => { planRef.current = plan; }, [plan]);
  useEffect(() => {
    if (!plan.thinking && deepThinking) setDeepThinking(false);
  }, [plan, deepThinking]);
  const selectPlan = useCallback((id: PlanId) => {
    setPlanId(id);
    savePrefs({ planId: id, deepThinking: deepThinkingRef.current });
  }, []);
  const toggleThink = useCallback(() => {
    setDeepThinking(v => {
      savePrefs({ planId: planRef.current.id, deepThinking: !v });
      return !v;
    });
  }, []);

  // ---- the flight ----
  const [flight, setFlight] = useState<FlightView | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const [streamText, setStreamText] = useState('');
  const streamBufRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [awaitingImages, setAwaitingImages] = useState<Record<string, true>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());

  const inFlight = flight !== null;
  useEffect(() => {
    if (!inFlight) return;
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(t);
  }, [inFlight]);

  // ---- scrolling ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = pinned;
    setShowJump(!pinned);
  }, []);
  const scrollToEnd = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    pinnedRef.current = true;
    setShowJump(false);
  }, []);
  const autoScrollIfPinned = useCallback(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => { autoScrollIfPinned(); }, [streamText, flight, autoScrollIfPinned]);

  // ---- mobile rail ----
  const [railOpen, setRailOpen] = useState(false);

  // ---- ledger mutations ----
  const appendExchange = useCallback((convId: string, x: Exchange) => {
    mutateConvs(prev => prev.map(c => c.id === convId
      ? { ...c, exchanges: [...c.exchanges, x], updatedAt: new Date().toISOString() }
      : c));
  }, [mutateConvs]);

  const attachImages = useCallback((convId: string, exchangeId: string, images: string[]) => {
    mutateConvs(prev => prev.map(c => c.id !== convId ? c : {
      ...c,
      exchanges: c.exchanges.map(x => x.id === exchangeId && x.reply
        ? { ...x, reply: { ...x.reply, images: [...x.reply.images, ...images] } }
        : x),
    }));
  }, [mutateConvs]);

  const clearAwaiting = useCallback((exchangeId: string) => {
    setAwaitingImages(prev => {
      if (!prev[exchangeId]) return prev;
      const next = { ...prev };
      delete next[exchangeId];
      return next;
    });
  }, []);

  // ---- send: hand a request to the network ----
  const sendRequest = useCallback((rawText: string, images: string[], targetConvId?: string) => {
    const text = rawText.trim();
    if (!text && images.length === 0) return;
    if (text.length > MAX_INPUT_CHARS) return;
    if (flightRef.current || engine.busy) return;

    const p = planRef.current;
    const useImages = p.vision ? images.slice(0, 4) : [];
    const content = text || 'What is in this image?';
    const nowIso = new Date().toISOString();

    // Resolve the conversation, creating one when needed.
    let convId = targetConvId ?? activeIdRef.current;
    let next = convsRef.current;
    if (!convId || !next.some(c => c.id === convId)) {
      const conv: Conversation = { id: newId('c'), title: titleFrom(content), createdAt: nowIso, updatedAt: nowIso, exchanges: [] };
      next = [conv, ...next];
      convId = conv.id;
      setActiveId(conv.id);
      activeIdRef.current = conv.id;
    } else {
      next = next.map(c => c.id === convId
        ? { ...c, title: c.exchanges.length === 0 ? titleFrom(content) : c.title, updatedAt: nowIso }
        : c);
    }
    convsRef.current = next;
    setConvs(next);
    saveLedger(next);

    // Submission context: the last 10 messages, images only for vision models
    // and only on user turns (generated images are display-only output).
    const conv = next.find(c => c.id === convId)!;
    const messages: EngineMessage[] = [];
    for (const x of conv.exchanges) {
      if (x.status !== 'done' || !x.reply) continue;
      const userMsg: EngineMessage = { role: 'user', content: x.request.text };
      if (p.vision && x.request.images && x.request.images.length > 0) userMsg.images = x.request.images;
      messages.push(userMsg);
      messages.push({ role: 'assistant', content: x.reply.text });
    }
    const newMsg: EngineMessage = { role: 'user', content };
    if (useImages.length > 0) newMsg.images = useImages;
    messages.push(newMsg);
    const context = messages.slice(-10);

    // Cost lane as observed at submit time; the provenance line reports this.
    const costLabel = !engine.isAuthenticated
      ? 'free prompt'
      : (engine.credits.freePrompts ?? 0) > 0
        ? 'free prompt'
        : engine.credits.stakerAllowance > 0
          ? 'staker allowance'
          : p.costLabel;

    const f: Flight = {
      convId,
      exchangeId: newId('x'),
      requestText: content,
      requestImages: useImages,
      planId: p.id,
      planName: p.name,
      costLabel,
      submittedAt: Date.now(),
      phase: 'dispatch',
      queuePos: null,
      queuePeak: null,
      searching: false,
      renderingImage: false,
      thinkSeconds: null,
      sources: [],
      done: false,
    };
    flightRef.current = f;
    setFlight({ ...f });
    streamBufRef.current = '';
    setStreamText('');
    pinnedRef.current = true;
    setTimeout(() => scrollToEnd(), 80);

    let thinkStart: number | null = null;
    const sync = () => setFlight({ ...f });
    const flush = () => {
      flushTimerRef.current = null;
      setStreamText(streamBufRef.current);
    };
    const stopFlush = () => {
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    };
    const clearFlight = () => {
      flightRef.current = null;
      setFlight(null);
      streamBufRef.current = '';
      setStreamText('');
    };
    const baseProvenance = () => ({
      model: f.planName,
      planId: f.planId,
      costLabel: f.costLabel,
      elapsedMs: Date.now() - f.submittedAt,
      thinkSeconds: f.thinkSeconds,
      queuePeak: f.queuePeak,
      servedAt: new Date().toISOString(),
    });

    const callbacks: SendCallbacks = {
      onQueue: (pos) => {
        if (f.done) return;
        if (pos !== null) {
          f.phase = 'queued';
          f.queuePos = pos;
          f.queuePeak = Math.max(f.queuePeak ?? 0, pos);
        } else if (f.phase !== 'serving') {
          f.phase = 'serving';
          f.queuePos = null;
        }
        sync();
      },
      onSearching: () => { if (!f.done) { f.searching = true; sync(); } },
      onSources: (sources) => { if (!f.done) { f.sources = sources; sync(); } },
      onGeneratingImage: () => { if (!f.done) { f.renderingImage = true; sync(); } },
      onDelta: (chunk) => {
        if (f.done) return;
        if (chunk.includes('<think>') && thinkStart === null) thinkStart = Date.now();
        if (chunk.includes('</think>') && thinkStart !== null) {
          f.thinkSeconds = Math.max(1, Math.round((Date.now() - thinkStart) / 1000));
          thinkStart = null;
        }
        if (f.phase !== 'serving' || f.searching) {
          f.phase = 'serving';
          f.searching = false;
          sync();
        }
        streamBufRef.current += chunk;
        if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, 120);
      },
      onComplete: (finalText, meta) => {
        if (f.done) return;
        f.done = true;
        stopFlush();
        const parsed = parseSourcesFromContent(finalText);
        const sources = meta.sources.length > 0 ? meta.sources : parsed.sources;
        // A completed job with nothing in it is a failure, not a fulfilment.
        if (!parsed.cleanContent && meta.images.length === 0 && !f.renderingImage) {
          appendExchange(f.convId, {
            id: f.exchangeId,
            request: { text: f.requestText, images: f.requestImages.length > 0 ? f.requestImages : undefined },
            reply: null,
            provenance: { ...baseProvenance(), sourcesCount: sources.length },
            status: 'error',
            error: 'The network returned an empty response.',
          });
          clearFlight();
          return;
        }
        appendExchange(f.convId, {
          id: f.exchangeId,
          request: { text: f.requestText, images: f.requestImages.length > 0 ? f.requestImages : undefined },
          reply: { text: parsed.cleanContent, images: meta.images, sources },
          provenance: {
            ...baseProvenance(),
            thinkSeconds: meta.thinkSeconds ?? f.thinkSeconds,
            sourcesCount: sources.length,
          },
          status: 'done',
        });
        // The image render path is async: the text turn can finish first.
        if (f.renderingImage && meta.images.length === 0) {
          const xid = f.exchangeId;
          setAwaitingImages(prev => ({ ...prev, [xid]: true }));
          setTimeout(() => clearAwaiting(xid), 200000);
        }
        clearFlight();
      },
      onImage: (imgs) => {
        // Pre-complete images are folded into onComplete's meta by the engine;
        // only late arrivals (async render after the text turn) land here.
        if (!f.done) return;
        clearAwaiting(f.exchangeId);
        if (imgs.length > 0) attachImages(f.convId, f.exchangeId, imgs);
      },
      onError: (message) => {
        if (f.done) return;
        f.done = true;
        stopFlush();
        const partial = streamBufRef.current.trim();
        appendExchange(f.convId, {
          id: f.exchangeId,
          request: { text: f.requestText, images: f.requestImages.length > 0 ? f.requestImages : undefined },
          reply: partial ? { text: parseSourcesFromContent(partial).cleanContent, images: [], sources: f.sources } : null,
          provenance: { ...baseProvenance(), sourcesCount: f.sources.length },
          status: 'error',
          error: message,
        });
        clearFlight();
      },
    };

    void engine.send(
      { messages: context, model: p.modelId, think: p.thinking ? deepThinkingRef.current : false },
      callbacks,
    ).then((accepted) => {
      // A rejected submit without an onError call (another job already active)
      // must not leave a phantom flight on screen.
      if (!accepted && !f.done) {
        f.done = true;
        stopFlush();
        clearFlight();
      }
    });
  }, [engine, appendExchange, attachImages, clearAwaiting, scrollToEnd]);

  // ---- withdraw a job in flight ----
  const withdraw = useCallback(() => {
    const f = flightRef.current;
    if (!f || f.done) return;
    f.done = true;
    engine.cancel();
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    const partial = streamBufRef.current.trim();
    appendExchange(f.convId, {
      id: f.exchangeId,
      request: { text: f.requestText, images: f.requestImages.length > 0 ? f.requestImages : undefined },
      reply: partial ? { text: parseSourcesFromContent(partial).cleanContent, images: [], sources: f.sources } : null,
      provenance: {
        model: f.planName,
        planId: f.planId,
        costLabel: f.costLabel,
        elapsedMs: Date.now() - f.submittedAt,
        thinkSeconds: f.thinkSeconds,
        sourcesCount: f.sources.length,
        queuePeak: f.queuePeak,
        servedAt: new Date().toISOString(),
      },
      status: 'error',
      error: 'Withdrawn before completion.',
    });
    flightRef.current = null;
    setFlight(null);
    streamBufRef.current = '';
    setStreamText('');
  }, [engine, appendExchange]);

  // ---- retry an errored exchange ----
  const retryExchange = useCallback((convId: string, x: Exchange) => {
    if (flightRef.current || engine.busy) return;
    mutateConvs(prev => prev.map(c => c.id === convId
      ? { ...c, exchanges: c.exchanges.filter(e => e.id !== x.id) }
      : c));
    sendRequest(x.request.text, x.request.images ?? [], convId);
  }, [engine.busy, mutateConvs, sendRequest]);

  // ---- conversation ops ----
  const createConversation = useCallback(() => {
    setActiveId(null);
    setRailOpen(false);
  }, []);
  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setRailOpen(false);
    pinnedRef.current = true;
    setTimeout(() => scrollToEnd(false), 60);
  }, [scrollToEnd]);
  const renameConversation = useCallback((id: string, title: string) => {
    mutateConvs(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  }, [mutateConvs]);
  const deleteConversation = useCallback((id: string) => {
    mutateConvs(prev => prev.filter(c => c.id !== id));
    if (activeIdRef.current === id) setActiveId(null);
  }, [mutateConvs]);

  // ---- derived view state ----
  const sortedConvs = useMemo(
    () => [...convs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [convs],
  );
  const active = activeId ? convs.find(c => c.id === activeId) ?? null : null;
  const flightVisible = flight !== null && flight.convId === activeId;
  const flightElsewhere = flight !== null && flight.convId !== activeId;
  const showWelcome = !active || (active.exchanges.length === 0 && !flightVisible);

  // ---- gates ----
  if (engine.authLoading || !engine.anonReady || !loaded) {
    return (
      <div className="ui-readable flex h-dvh w-full items-center justify-center bg-[#0c0a09]">
        <div className="flex items-center gap-2.5">
          <Square tone="live" pulse size={7} />
          <span className="pixel-sans text-sm text-white/45">connecting to the network</span>
        </div>
      </div>
    );
  }

  if (!engine.isAuthenticated && engine.anonCapReached) {
    return (
      <div className="ui-readable flex h-dvh w-full items-center justify-center bg-[#0c0a09] px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Wordmark className="text-2xl" />
          <h1 className="pixel-serif mt-5 text-2xl text-white">Sign in to continue</h1>
          <p className="pixel-sans mt-3 text-sm leading-relaxed text-white/55">
            The free budget for anonymous visitors is used for today. Sign in to keep working with free prompts and credits.
          </p>
          <button
            onClick={() => engine.login()}
            className="pixel-sans mt-6 w-full cursor-pointer rounded-xl bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            sign in
          </button>
          <Link href="/" className="pixel-sans mt-4 inline-block cursor-pointer text-xs text-white/40 transition-colors hover:text-white">
            back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-readable flex h-dvh w-full overflow-hidden bg-[#0c0a09] text-white">
      <Rail
        convs={sortedConvs}
        activeId={activeId}
        flightConvId={flight?.convId ?? null}
        onSelect={selectConversation}
        onNew={createConversation}
        onRename={renameConversation}
        onDelete={deleteConversation}
        isAuthenticated={engine.isAuthenticated}
        displayName={engine.displayName}
        onLogin={() => engine.login()}
        onLogout={() => { void engine.logout(); }}
        credits={engine.credits}
        anonRemaining={engine.anonRemaining}
        stats={engine.stats}
        live={engine.live}
        demo={engine.demo}
        open={railOpen}
        onClose={() => setRailOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4 md:px-6">
          <button
            onClick={() => setRailOpen(true)}
            aria-label="open menu"
            className="cursor-pointer rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/5 hover:text-white md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <h1 className="pixel-serif min-w-0 flex-1 truncate text-[17px] text-white/90">
            {active ? active.title : 'the counter'}
          </h1>
          {flightElsewhere && flight && (
            <button
              onClick={() => selectConversation(flight.convId)}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 transition-colors hover:border-white/25"
            >
              <Square tone="live" pulse size={5} />
              <span className="pixel-sans text-[11px] uppercase tracking-[0.14em] text-white/50">job in flight</span>
            </button>
          )}
          <span className="hidden items-center gap-2 md:flex">
            <Square tone={engine.live ? 'live' : 'off'} pulse={engine.live} size={6} />
            <span className="pixel-sans text-[11px] uppercase tracking-[0.16em] text-white/35">
              {engine.live ? 'network live' : engine.demo ? 'preview demo' : 'offline'}
            </span>
          </span>
        </header>

        {/* the ledger */}
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
            {showWelcome ? (
              <div className="flex h-full items-center px-6">
                <div className="mx-auto w-full max-w-xl">
                  <div className="pixel-sans text-[11px] uppercase tracking-[0.18em] text-white/30">
                    verified work, on demand
                  </div>
                  <h2 className="pixel-serif mt-3 text-4xl text-white">Ask the network.</h2>
                  <p className="pixel-sans mt-4 text-[15px] leading-relaxed text-white/55">
                    Every reply here is a job served by real machines on the c0mpute network.
                    Each one comes back with its receipt: which model served it, what it cost,
                    and how long it took.
                  </p>
                  <div className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendRequest(s, [])}
                        disabled={inFlight || engine.busy}
                        className="pixel-sans cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left text-[13px] text-white/65 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-12 px-4 py-8 md:px-6">
                {active?.exchanges.map((x, i) => (
                  <WorkUnit
                    key={x.id}
                    index={i}
                    exchange={x}
                    awaitingImage={!!awaitingImages[x.id]}
                    canRetry={!inFlight && !engine.busy}
                    onRetry={() => retryExchange(active.id, x)}
                  />
                ))}
                {flightVisible && flight && (
                  <FlightUnit
                    flight={flight}
                    index={active?.exchanges.length ?? 0}
                    streamText={streamText}
                    now={nowTick}
                    onWithdraw={withdraw}
                  />
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {showJump && !showWelcome && (
            <button
              onClick={() => scrollToEnd()}
              aria-label="jump to latest"
              className="absolute bottom-4 left-1/2 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-[#0c0a09] text-white/60 shadow-lg transition-colors hover:text-white"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </button>
          )}
        </div>

        <Counter
          plan={plan}
          models={engine.models}
          swarm={engine.swarmModel}
          workerCount={engine.workerCount}
          live={engine.live}
          connected={engine.connected}
          busy={inFlight || engine.busy}
          deepThinking={deepThinking}
          onToggleThink={toggleThink}
          onSelectPlan={selectPlan}
          onSend={(text, images) => sendRequest(text, images)}
          isAuthenticated={engine.isAuthenticated}
          anonRemaining={engine.anonRemaining}
          onLogin={() => engine.login()}
        />
      </main>
    </div>
  );
}
