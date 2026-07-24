'use client';

// The chat. Familiar shape, current materials: no header bar, no region
// borders, one composer slab, 16px answers. On an empty thread the composer
// sits centre-stage under the line, then settles to the bottom once the
// conversation starts.
import { useCallback, useEffect, useRef, useState } from 'react';
import './ui.css';
import { useChatEngine, type EngineMessage } from '../engine/useChatEngine';
import { PLANS, parseThinking, parseSourcesFromContent, type Plan, type SourceRef } from '../lib';
import { load, save, uid, titleFrom, toWire, type Convo, type Msg } from './store';
import Sidebar from './Sidebar';
import Composer from './Composer';
import { Turn, Live } from './Messages';
import { Panel, Plus, Down } from './Icons';

const FLUSH_MS = 90;

export default function Chat() {
  const engine = useChatEngine();

  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>(PLANS[0]);
  const [think, setThink] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  // live job
  const [streamText, setStreamText] = useState('');
  const [state, setState] = useState<'idle' | 'queued' | 'streaming'>('idle');
  const [queue, setQueue] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [genImage, setGenImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const lastRetry = useRef<{ text: string; images: string[] } | null>(null);

  // hydrate
  useEffect(() => {
    const list = load();
    setConvos(list);
    if (list.length > 0) setActiveId(list[0].id);
  }, []);

  const active = convos.find(c => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];
  const busy = state !== 'idle';

  const persist = useCallback((next: Convo[]) => {
    setConvos(next);
    save(next);
  }, []);

  // ---- scrolling ----
  const scrollToEnd = useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinned.current = near;
    setShowJump(!near && el.scrollHeight > el.clientHeight + 200);
  }, []);

  useEffect(() => {
    if (pinned.current) scrollToEnd(false);
  }, [messages.length, scrollToEnd]);

  useEffect(() => {
    if (pinned.current && streamText) scrollToEnd(false);
  }, [streamText, scrollToEnd]);

  // ---- send ----
  const send = useCallback(async (retry?: { text: string; images: string[] }) => {
    const text = (retry?.text ?? draft).trim();
    const imgs = retry?.images ?? images;
    if ((!text && imgs.length === 0) || busy) return;
    if (!engine.isAuthenticated && engine.anonCapReached) { engine.login(); return; }

    lastRetry.current = { text, images: imgs };
    setError(null);
    if (!retry) { setDraft(''); setImages([]); }

    const userMsg: Msg = { id: uid(), role: 'user', content: text, images: imgs.length ? imgs : undefined };

    // create the conversation on first send, never on "new chat"
    let convoId = activeId;
    let base = convos;
    if (!convoId || !convos.some(c => c.id === convoId)) {
      convoId = uid();
      const fresh: Convo = { id: convoId, title: titleFrom(text || 'Image'), updatedAt: Date.now(), model: plan.id, messages: [userMsg] };
      base = [fresh, ...convos];
      setActiveId(convoId);
    } else {
      base = convos.map(c => (c.id === convoId
        ? { ...c, updatedAt: Date.now(), model: plan.id, messages: [...c.messages, userMsg] }
        : c));
    }
    persist(base);

    // context: last 10 turns, assistant history cleaned of think blocks and
    // source tails; images only for vision models
    const history = (base.find(c => c.id === convoId)?.messages ?? []).slice(-10);
    const payload: EngineMessage[] = history.map(m => {
      if (m.role === 'assistant') {
        const { cleanContent } = parseSourcesFromContent(m.content);
        const { response } = parseThinking(cleanContent);
        return { role: 'assistant', content: response.trim() || cleanContent };
      }
      const msg: EngineMessage = { role: 'user', content: m.content };
      if (plan.vision && m.images?.length) msg.images = m.images.map(toWire);
      return msg;
    });

    buffer.current = '';
    setStreamText('');
    setQueue(null);
    setSearching(false);
    setGenImage(false);
    setState('queued');
    pinned.current = true;

    const flush = () => {
      flushTimer.current = null;
      setStreamText(buffer.current);
    };

    let gathered: SourceRef[] = [];

    await engine.send(
      { messages: payload, model: plan.modelId, think: plan.thinking ? think : false },
      {
        onDelta: chunk => {
          setState('streaming');
          setSearching(false);
          buffer.current += chunk;
          if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
        },
        onQueue: pos => setQueue(pos),
        onSearching: () => setSearching(true),
        onSources: s => { gathered = s; },
        onGeneratingImage: () => setGenImage(true),
        onImage: imgList => {
          setGenImage(false);
          if (!imgList.length) return;
          setConvos(prev => {
            const next = prev.map(c => {
              if (c.id !== convoId) return c;
              const msgs = [...c.messages];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'assistant') {
                  msgs[i] = { ...msgs[i], images: [...(msgs[i].images ?? []), ...imgList] };
                  break;
                }
              }
              return { ...c, messages: msgs };
            });
            save(next);
            return next;
          });
        },
        onComplete: (finalText, meta) => {
          if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
          let content = finalText || '[No response received]';
          if (meta.thinkSeconds !== null && content.includes('</think>')) {
            content = content.replace('</think>', `</think><!--think_time:${meta.thinkSeconds}-->`);
          }
          const srcs = meta.sources.length ? meta.sources : gathered;
          if (srcs.length) content += `\n---SOURCES---${JSON.stringify(srcs)}`;

          setConvos(prev => {
            const next = prev.map(c => (c.id === convoId
              ? { ...c, updatedAt: Date.now(), messages: [...c.messages, { id: uid(), role: 'assistant' as const, content }] }
              : c));
            save(next);
            return next;
          });
          buffer.current = '';
          setStreamText('');
          setState('idle');
          setQueue(null);
          setSearching(false);
        },
        onError: message => {
          if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
          // keep whatever text did arrive — losing it is worse than an odd stub
          const partial = buffer.current.trim();
          if (partial) {
            setConvos(prev => {
              const next = prev.map(c => (c.id === convoId
                ? { ...c, messages: [...c.messages, { id: uid(), role: 'assistant' as const, content: partial }] }
                : c));
              save(next);
              return next;
            });
          }
          buffer.current = '';
          setStreamText('');
          setState('idle');
          setSearching(false);
          setGenImage(false);
          setError(message);
        },
      },
    );
  }, [draft, images, busy, engine, activeId, convos, persist, plan, think]);

  const stop = useCallback(() => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    const partial = buffer.current.trim();
    const convoId = activeId;
    if (partial && convoId) {
      setConvos(prev => {
        const next = prev.map(c => (c.id === convoId
          ? { ...c, messages: [...c.messages, { id: uid(), role: 'assistant' as const, content: partial }] }
          : c));
        save(next);
        return next;
      });
    }
    buffer.current = '';
    setStreamText('');
    setState('idle');
    setSearching(false);
    setGenImage(false);
    engine.cancel();
  }, [activeId, engine]);

  // ---- gates ----
  if (engine.authLoading) {
    return <div className="cu grid h-dvh place-items-center" style={{ background: 'var(--cu-bg)' }} />;
  }

  const empty = messages.length === 0 && state === 'idle';

  const composer = (
    <Composer
      engine={engine}
      plan={plan}
      onPlan={setPlan}
      think={think}
      onThink={setThink}
      images={images}
      onImages={setImages}
      value={draft}
      onValue={setDraft}
      onSend={() => void send()}
      onStop={stop}
      busy={busy}
      centered={empty}
    />
  );

  return (
    <div className="cu flex h-dvh overflow-hidden" style={{ background: 'var(--cu-bg)', color: 'var(--cu-text)' }}>
      <Sidebar
        convos={convos}
        activeId={activeId}
        onSelect={id => { setActiveId(id); setError(null); }}
        onNew={() => { setActiveId(null); setDraft(''); setImages([]); setError(null); setRailOpen(false); }}
        onRename={(id, title) => persist(convos.map(c => (c.id === id ? { ...c, title } : c)))}
        onDelete={id => {
          const next = convos.filter(c => c.id !== id);
          persist(next);
          if (activeId === id) setActiveId(next[0]?.id ?? null);
        }}
        engine={engine}
        open={railOpen}
        onClose={() => setRailOpen(false)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* floating controls instead of a header bar */}
        <div className="absolute left-3 top-3 z-20 flex items-center gap-1 md:hidden">
          <button onClick={() => setRailOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl text-white/55 hover:bg-white/[0.06]"><Panel /></button>
          <button onClick={() => { setActiveId(null); setDraft(''); }} className="grid h-9 w-9 place-items-center rounded-xl text-white/55 hover:bg-white/[0.06]"><Plus /></button>
        </div>

        {/* Three stable slots: content, composer, balance. The composer keeps
            its DOM position in every state, so it never remounts and never
            drops focus when the first message turns an empty thread into a
            conversation. */}
        <div
          key="content"
          className={empty ? 'flex flex-1 flex-col justify-end' : 'cu-scroll min-h-0 flex-1 overflow-y-auto'}
          ref={empty ? undefined : scroller}
          onScroll={empty ? undefined : onScroll}
        >
          {empty ? (
            <div className="cu-fade mx-auto mb-7 w-full max-w-[46rem] px-4">
              <h1 className="pixel-serif text-[34px] leading-[1.15] tracking-[-0.01em] md:text-[42px]" style={{ color: 'var(--cu-text)' }}>
                Ask the impossible.
              </h1>
              <p className="mt-3 text-[15px]" style={{ color: 'var(--cu-dim)' }}>
                Uncensored models, served by machines people own.
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[46rem] space-y-7 px-4 pb-6 pt-16 md:pt-10">
              {messages.map(m => <Turn key={m.id} msg={m} />)}
              {busy && (
                <Live
                  text={streamText}
                  state={state === 'queued' ? 'queued' : 'streaming'}
                  queue={queue}
                  searching={searching}
                  generatingImage={genImage}
                />
              )}
              {error && (
                <div className="cu-fade rounded-2xl px-4 py-3 text-[14px]" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
                  <p>{error}</p>
                  <div className="mt-2 flex gap-3 text-[13px]">
                    {lastRetry.current && (
                      <button onClick={() => { const r = lastRetry.current!; setError(null); void send(r); }} className="underline underline-offset-2 hover:text-white">Try again</button>
                    )}
                    <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">Dismiss</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showJump && !empty && (
          <button
            onClick={() => { pinned.current = true; setShowJump(false); scrollToEnd(); }}
            className="absolute bottom-[148px] left-1/2 z-20 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full text-white/70 shadow-lg backdrop-blur transition-colors hover:text-white"
            style={{ background: 'rgba(23,20,15,0.9)' }}
            aria-label="Scroll to latest"
          ><Down /></button>
        )}

        {composer}

        {/* balances the empty state so the cluster reads as centred */}
        <div key="balance" className={empty ? 'flex-1' : 'hidden'} />
      </main>
    </div>
  );
}
