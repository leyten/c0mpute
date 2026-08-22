'use client';

// The chat. Familiar shape, current materials: no header bar, no region
// borders, one composer slab, 16px answers. On an empty thread the composer
// sits centre-stage under the line, then settles to the bottom once the
// conversation starts.
//
// Everything the user can ask for goes through one job runner. `run()` either
// appends an answer or adds a version to an existing one, so a first send, a
// follow-up chip, an edited message resent, a regeneration, a second model and
// a retry are all the same motion: same streaming, same safety, same
// persistence. An answer is never a dead end, and the version on screen is the
// version later turns are built on.
import { useCallback, useEffect, useRef, useState } from 'react';
import './ui.css';
import { useChatEngine, type EngineMessage } from '../engine/useChatEngine';
import { PENDING_PROMPT_KEY, PLANS, parseThinking, parseSourcesFromContent, type FileRef, type Plan, type SourceRef } from '../lib';
import {
  KEY as STORE_KEY,
  load, save, uid, titleFrom, toWire, truncateAt,
  activeVersion, addImagesTo, addVersion, assistantMsg, extendVersion, makeVersion, selectVersion,
  type Convo, type Cut, type Msg, type Role, type VersionModel,
} from './store';
import { isMac } from './search';
import Sidebar from './Sidebar';
import Composer from './Composer';
import Palette from './Palette';
import UsagePanel from './usage/UsagePanel';
import AskSelection from './Selection';
import { Turn, Live, FollowUps } from './Messages';
import { Panel, Plus, Down } from './Icons';

const FLUSH_MS = 90;

/** Standing instructions ride in front of the window as a user-role preamble,
 *  never as a system message. The orchestrator injects c0mpute's own system
 *  prompt only when the request carries no system message of its own
 *  (lib/orchestrator/orchestrator.ts), so a system message here would silently
 *  drop the identity, no-refusal, language, date and finish-the-answer rules
 *  for every request in the conversation. Sent as a user turn, both survive. */
const PREAMBLE = 'Standing instructions for this conversation:';

/** Context for one job: the standing instructions, then the last 10 turns with
 *  assistant history cleaned of think blocks and source tails. Images ride
 *  along for vision models only. */
function buildPayload(history: Msg[], plan: Plan, instructions: string): EngineMessage[] {
  const turns: EngineMessage[] = history.map(m => {
    if (m.role === 'assistant') {
      const { cleanContent } = parseSourcesFromContent(m.content);
      const { response } = parseThinking(cleanContent);
      return { role: 'assistant', content: response.trim() || cleanContent };
    }
    const msg: EngineMessage = { role: 'user', content: m.content };
    if (plan.vision && m.images?.length) msg.images = m.images.map(toWire);
    return msg;
  });
  const instr = instructions.trim();
  return instr ? [{ role: 'user', content: `${PREAMBLE}\n${instr}` }, ...turns] : turns;
}

/** The last message in a role, or null. */
function lastOf(msgs: Msg[], role: Role): Msg | null {
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === role) return msgs[i];
  return null;
}

interface Job {
  convoId: string;
  /** Assistant message to add a version to, or null to append a new answer. */
  target: string | null;
  payload: EngineMessage[];
  plan: Plan;
  think: boolean;
  /** Continuation: the answer text this job picks up from, and the id of the
   *  version it grows. The stream is appended to `prefix` and written back over
   *  that version, so an answer that was cut in half ends up as one answer and
   *  not as two. */
  prefix?: string;
  extend?: string;
  /** Sources the resumed answer already carried, so continuing it does not drop
   *  its citation strip. */
  sources?: SourceRef[];
  /** How the resumed answer was cut. A continuation that fails leaves the answer
   *  exactly as cut as it found it, chip and all. */
  resumeCut?: Cut;
  /** This job IS the automatic retry of a think-burnout. One per turn: if the
   *  retry burns out too, the reader gets the error. */
  retryOfBurnout?: boolean;
}

/** Where the answer in flight will land. */
interface Landing {
  convoId: string;
  answerId: string;
  versionId: string;
  target: string | null;
  model: VersionModel;
  /** Write over `versionId` instead of adding a version beside it: this job is
   *  finishing an answer, not writing another one. */
  extend?: boolean;
}

export default function Chat() {
  const engine = useChatEngine();

  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>(PLANS[0]);
  const [think, setThink] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [instrOpen, setInstrOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);


  // live job
  const [streamText, setStreamText] = useState('');
  const [state, setState] = useState<'idle' | 'queued' | 'streaming'>('idle');
  const [queue, setQueue] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [genImage, setGenImage] = useState(false);
  /** Sources arrive before the text does; show them while it streams rather
   *  than letting the whole strip appear at once on completion. */
  const [liveSources, setLiveSources] = useState<SourceRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** A quiet line in place of the error banner, for a failure the page is
   *  handling itself: today only the think-burnout retry. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Answer being rewritten, so the stream shows in its place. */
  const [regenFor, setRegenFor] = useState<string | null>(null);
  /** The job "Try again" would repeat. State, because the error block reads it. */
  const [retryJob, setRetryJob] = useState<Job | null>(null);
  /** Which conversation the running job belongs to. `busy` and `error` are
   *  global to the page, so without this the live block and the error banner
   *  rendered into whatever thread was on screen — switch conversations
   *  mid-answer and someone else's stream appeared at the bottom of it. */
  const [liveConvo, setLiveConvo] = useState<string | null>(null);

  const buffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const landing = useRef<Landing | null>(null);
  /** Generated images that arrived before their answer had landed. */
  const earlyImages = useRef<string[]>([]);
  /** An image was announced and has not landed yet. */
  const awaitingImage = useRef(false);
  /** Documents this job generated. They are delivered while the answer is
   *  still being written, so commit always finds them here. */
  const liveFiles = useRef<FileRef[]>([]);
  const composerInput = useRef<HTMLTextAreaElement>(null);

  /** A prompt typed into the hero input on the homepage, handed over through
   *  localStorage. Read exactly once — `undefined` until hydrate has looked,
   *  '' when there was nothing, so a StrictMode remount never re-reads the key
   *  it just cleared and loses the prompt. */
  const handoff = useRef<string | undefined>(undefined);
  /** The stored conversations have reached state, not just this effect. The
   *  handoff waits for it: sending off the mount pass would build the new
   *  conversation on an empty list and write the visitor's history away. */
  const [hydrated, setHydrated] = useState(false);

  // hydrate — localStorage can only be read after mount, so this one-shot
  // effect is the only way in; it runs once and settles.
  useEffect(() => {
    const list = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConvos(list);
    setHydrated(true);
    if (handoff.current === undefined) {
      let text = '';
      try {
        text = (localStorage.getItem(PENDING_PROMPT_KEY) ?? '').trim();
        if (text) localStorage.removeItem(PENDING_PROMPT_KEY);
      } catch { /* no storage: nothing was handed over */ }
      handoff.current = text;
      if (text) setDraft(text);
    }
    // A hero prompt opens a conversation of its own: leaving activeId null is
    // what makes the first send create one, instead of appending to whatever
    // the visitor happened to ask last time.
    if (!handoff.current && list.length > 0) setActiveId(list[0].id);
  }, []);

  // Two tabs on /chat each hold their own copy of the list, and `save` writes the
  // whole thing. Whichever tab saved last won, and everything the other tab had
  // created since it loaded was gone from storage for good. Re-read on another
  // tab's write so this one saves on top of current data instead of stale data.
  // Safe mid-answer: the streaming text lives in a ref until `commit`, which
  // maps over the latest list.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORE_KEY) return;
      setConvos(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const active = convos.find(c => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];
  const busy = state !== 'idle';
  /** The free lane is used up: ask for a sign-in instead of a job. */
  const capped = !engine.isAuthenticated && engine.anonCapReached;

  const persist = useCallback((next: Convo[]) => {
    setConvos(next);
    save(next);
  }, []);

  // ---- standing instructions ----
  // A conversation exists only after its first send, so instructions written on
  // an empty thread are held here until that conversation is created.
  const [pendingInstr, setPendingInstr] = useState('');
  const instructions = active ? (active.instructions ?? '') : pendingInstr;
  /** What the open editor is writing to: a conversation id, null while the
   *  thread is unsent, or undefined once the editor has been dismissed by
   *  something other than the user — a new conversation — in which case its
   *  text is dropped instead of landing on whatever is on screen now. */
  const instrFor = useRef<string | null | undefined>(undefined);

  const openInstructions = useCallback(() => {
    instrFor.current = activeId;
    setInstrOpen(true);
  }, [activeId]);

  const commitInstructions = useCallback((next: string) => {
    const target = instrFor.current;
    if (target === undefined) return;
    const text = next.trim();
    if (target === null) { setPendingInstr(text); return; }
    setConvos(prev => {
      const owner = prev.find(c => c.id === target);
      // the conversation may have been deleted while the editor was open
      if (!owner || (owner.instructions ?? '') === text) return prev;
      const list = prev.map(c => (c.id === target ? { ...c, instructions: text || undefined } : c));
      save(list);
      return list;
    });
  }, []);

  const startNew = useCallback(() => {
    setActiveId(null);
    setDraft('');
    setImages([]);
    setError(null);
    setEditingId(null);
    instrFor.current = undefined;
    setPendingInstr('');
    setInstrOpen(false);
    setRailOpen(false);
  }, []);

  // shared by the rail and the palette
  const selectConvo = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
    setEditingId(null);
    setInstrOpen(false);
  }, []);
  const renameConvo = useCallback((id: string, title: string) => {
    persist(convos.map(c => (c.id === id ? { ...c, title } : c)));
  }, [convos, persist]);
  // Defined below clearLive: deleting the conversation a job is writing into
  // has to tear that job down too.

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

  // Opening a conversation lands on its newest message. The effects above key on
  // messages.length and streamText, so switching between two threads of the same
  // length fired neither and left the scroller at the previous thread's offset —
  // and `pinned` carried over, so once you had scrolled up in one conversation
  // every one you opened after it also opened mid-thread.
  useEffect(() => {
    pinned.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowJump(false);
    scrollToEnd(false);
  }, [activeId, scrollToEnd]);

  useEffect(() => {
    if (pinned.current && streamText) scrollToEnd(false);
  }, [streamText, scrollToEnd]);

  // ---- the answer a job produces ----
  const commit = useCallback((to: Landing, content: string, cut?: Cut) => {
    const version = makeVersion(to.versionId, content, to.model, cut, awaitingImage.current);
    if (earlyImages.current.length) {
      version.images = earlyImages.current;
      earlyImages.current = [];
      version.pendingImage = undefined;
    }
    if (liveFiles.current.length) {
      version.files = liveFiles.current;
      liveFiles.current = [];
    }
    setConvos(prev => {
      const next = prev.map(c => {
        if (c.id !== to.convoId) return c;
        // A continuation grows the version it resumed — same answer, more of
        // it — so it writes over that version instead of landing beside it.
        const messages = to.extend
          ? c.messages.map(m => (m.id === to.answerId
            ? extendVersion(m, to.versionId, content, cut, {
              images: version.images,
              files: version.files,
              pendingImage: version.pendingImage,
            })
            : m))
          : to.target
            ? c.messages.map(m => (m.id === to.target ? addVersion(m, version) : m))
            : [...c.messages, assistantMsg(to.answerId, version)];
        return { ...c, updatedAt: Date.now(), messages };
      });
      save(next);
      return next;
    });
  }, []);

  const clearLive = useCallback(() => {
    buffer.current = '';
    landing.current = null;
    setStreamText('');
    // The retry note belongs to the job that raised it: without this it outlived
    // the answer and followed the reader into other conversations.
    setNotice(null);
    setState('idle');
    setQueue(null);
    setSearching(false);
    setGenImage(false);
    setRegenFor(null);
  }, []);

  const deleteConvo = useCallback((id: string) => {
    const next = convos.filter(c => c.id !== id);
    persist(next);
    setInstrOpen(false);
    // A job still writing into this conversation has nowhere to land: its answer
    // would be dropped by commit's map, but `busy` stayed true so the composer
    // was locked out of every other conversation until it finished. Cancel it.
    if (landing.current?.convoId === id) {
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      engine.cancel();
      clearLive();
    }
    // The banner and its "Try again" pointed at a conversation that is gone.
    setError(null);
    setRetryJob(null);
    if (activeId === id) { setActiveId(next[0]?.id ?? null); setEditingId(null); }
  }, [convos, persist, activeId, engine, clearLive]);

  // ---- run one job ----
  /** run() submitting another job from inside itself (the burnout retry). A ref
   *  rather than a direct call, which would make the callback depend on itself. */
  const runRef = useRef<((job: Job) => Promise<void>) | null>(null);

  const run = useCallback(async (job: Job) => {
    if (capped) { engine.login(); return; }

    const to: Landing = {
      convoId: job.convoId,
      answerId: job.target ?? uid(),
      versionId: job.extend ?? uid(),
      target: job.target,
      model: { id: job.plan.id, name: job.plan.name, costLabel: job.plan.costLabel },
      extend: !!job.extend,
    };
    landing.current = to;
    setLiveConvo(job.convoId);
    earlyImages.current = [];
    awaitingImage.current = false;
    // documents belong to the job that made them, exactly like the sources
    liveFiles.current = [];
    setRetryJob(job);
    setError(null);
    // The burnout retry sets the note on its way in; every other job clears it.
    if (!job.retryOfBurnout) setNotice(null);

    // A continuation starts from the text it is finishing, so the answer keeps
    // growing on screen instead of appearing to start over.
    buffer.current = job.prefix ?? '';
    setStreamText(buffer.current);
    setQueue(null);
    setSearching(false);
    // sources belong to the job that found them: the next answer starts with
    // none, or the strip from the last one shows on it while it is thinking
    setLiveSources([]);
    setGenImage(false);
    setRegenFor(job.target);
    setState('queued');
    if (!job.target) pinned.current = true;

    const flush = () => {
      flushTimer.current = null;
      setStreamText(buffer.current);
    };

    let gathered: SourceRef[] = job.sources ?? [];

    await engine.send(
      { messages: job.payload, model: job.plan.modelId, think: job.think },
      {
        onDelta: chunk => {
          setState('streaming');
          setSearching(false);
          buffer.current += chunk;
          if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
        },
        onQueue: pos => setQueue(pos),
        onSearching: () => setSearching(true),
        onSources: s => { gathered = s; setLiveSources(s); },
        onGeneratingImage: () => { awaitingImage.current = true; setGenImage(true); },
        onImage: imgList => {
          awaitingImage.current = false;
          setGenImage(false);
          // An empty list is the render FAILING, and it still has work to do:
          // it has to clear the placeholder off the committed version. Returning
          // early here left a pulsing grey box in the turn forever — saved to
          // storage, so it survived every reload. addImagesTo([]) clears it.
          // this job's answer has not landed yet, so there is no version to
          // hang them on; commit picks them up
          if (landing.current === to) { earlyImages.current.push(...imgList); return; }
          // images can arrive minutes late: they belong to the version this job
          // wrote, whatever the reader has flipped to since
          setConvos(prev => {
            const next = prev.map(c => (c.id === to.convoId
              ? { ...c, messages: c.messages.map(m => (m.id === to.answerId ? addImagesTo(m, to.versionId, imgList) : m)) }
              : c));
            save(next);
            return next;
          });
        },
        onFile: file => { liveFiles.current.push(file); },
        onComplete: (finalText, meta) => {
          if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
          // The engine trims the text it hands back, which on a continuation
          // welds the join shut ("the quick" + "brown"). The raw buffer still
          // has whatever the model actually wrote there, space or paragraph
          // break, so put that back between the two halves.
          const join = job.prefix !== undefined
            ? (buffer.current.slice(job.prefix.length).match(/^\s+/)?.[0] ?? '')
            : '';
          let content = job.prefix !== undefined
            ? job.prefix + join + finalText
            : (finalText || '[No response received]');
          // Only a fresh answer carries a think block worth timing; a
          // continuation runs with thinking off and would stamp its number on
          // the block the first half already wrote.
          if (job.prefix === undefined && meta.thinkSeconds !== null && content.includes('</think>')) {
            content = content.replace('</think>', `</think><!--think_time:${meta.thinkSeconds}-->`);
          }
          const srcs = meta.sources.length ? meta.sources : gathered;
          if (srcs.length) content += `\n---SOURCES---${JSON.stringify(srcs)}`;
          commit(to, content, meta.truncated ? 'limit' : undefined);
          clearLive();
        },
        onError: (message, meta) => {
          if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
          const partial = buffer.current.trim();
          // A burnout's buffer is reasoning and nothing else, and the job was
          // refunded — committing it would put the model's whole response on
          // screen inside a dropdown, for free, which is exactly the shape a
          // prompt can ask for on purpose. It is dropped, not kept: clearLive
          // empties the buffer below and no version is written.
          const burnout = meta?.code === 'THINK_BURNOUT';
          // keep whatever text did arrive — losing it is worse than an odd stub
          if (partial && !burnout) {
            // `resumeCut` is undefined on a fresh answer and the answer's own cut
            // on a continuation, so a failed continuation is saved still cut
            // rather than as a complete answer that stops mid-sentence.
            commit(to, partial, job.resumeCut);
            // the partial is an answer now, so trying again versions it instead
            // of writing over the only copy the reader has. A continuation keeps
            // what it recovered: both the text on screen and the answer the
            // model is asked to resume move up to the saved partial, or Try
            // again would write the recovered words a second time.
            const resumed = job.prefix === undefined ? null : (parseThinking(partial).response.trim() || partial);
            setRetryJob({
              ...job,
              target: to.answerId,
              prefix: resumed === null ? undefined : partial,
              payload: resumed === null
                ? job.payload
                : job.payload.map((m, i) => (i === job.payload.length - 1 ? { ...m, content: resumed } : m)),
            });
          }
          clearLive();
          // A think-burnout is the one failure this page can answer by itself:
          // the model reasoned the whole turn away, so ask the same thing again
          // with thinking off. Once per turn — a retry that burns out too is
          // reported like any other failure. Nothing was committed, so the
          // answer lands as this turn's only answer.
          if (burnout && job.think && !job.retryOfBurnout) {
            setNotice('Thinking produced no answer. Retrying without thinking.');
            void runRef.current?.({ ...job, think: false, retryOfBurnout: true });
            return;
          }
          setError(message);
        },
      },
    );
  }, [capped, engine, commit, clearLive]);

  useEffect(() => { runRef.current = run; }, [run]);

  // ---- ask ----
  // Everything the user says arrives here: the composer, a follow-up chip, and
  // an edited message being resent. `replaceFrom` belongs to editing alone — it
  // drops that message and the branch under it before asking again.
  const ask = useCallback(async (text: string, imgs: string[], replaceFrom?: string) => {
    const clean = text.trim();
    if ((!clean && imgs.length === 0) || busy) return;
    // Checked here, not just in `send` and `run`: follow-up chips and edit-resend
    // call ask() directly, so the question was written into the thread and saved
    // before run() bailed — leaving an orphan turn with no answer and no retry.
    if (capped) { engine.login(); return; }

    const userMsg: Msg = { id: uid(), role: 'user', content: clean, images: imgs.length ? imgs : undefined };

    // create the conversation on first send, never on "new chat"
    let convoId = activeId;
    let base = convos;
    if (!convoId || !convos.some(c => c.id === convoId)) {
      convoId = uid();
      const fresh: Convo = {
        id: convoId,
        title: titleFrom(clean || 'Image'),
        updatedAt: Date.now(),
        model: plan.id,
        instructions: pendingInstr.trim() || undefined,
        messages: [userMsg],
      };
      base = [fresh, ...convos];
      setActiveId(convoId);
      // the held instructions have a home now
      if (instrFor.current === null) instrFor.current = convoId;
      setPendingInstr('');
    } else {
      base = convos.map(c => {
        if (c.id !== convoId) return c;
        const kept = truncateAt(c.messages, replaceFrom);
        // editing the message a title was taken from re-derives it, unless the
        // conversation has been renamed by hand since
        const derived = c.messages[0] && c.title === titleFrom(c.messages[0].content || 'Image');
        return {
          ...c,
          title: kept.length === 0 && derived ? titleFrom(clean || 'Image') : c.title,
          updatedAt: Date.now(),
          model: plan.id,
          messages: [...kept, userMsg],
        };
      });
    }
    persist(base);

    const target = base.find(c => c.id === convoId);
    await run({
      convoId,
      target: null,
      payload: buildPayload((target?.messages ?? []).slice(-10), plan, target?.instructions ?? ''),
      plan,
      think: plan.thinking ? think : false,
    });
  }, [busy, capped, engine, activeId, convos, persist, plan, think, pendingInstr, run]);

  const send = useCallback(() => {
    const text = draft.trim();
    if ((!text && images.length === 0) || busy) return;
    // checked before the composer is cleared, so a sign-in prompt never eats
    // what the user typed
    if (capped) { engine.login(); return; }
    setDraft('');
    setImages([]);
    void ask(text, images);
  }, [draft, images, busy, capped, engine, ask]);

  // ---- the homepage handoff ----
  // The hero prompt sends itself, once, as soon as the engine can carry it.
  // Until then it waits in the composer: if the network never comes up, or the
  // free lane is spent and a sign-in is owed, the visitor still has what they
  // typed rather than an empty box.
  const handoffSent = useRef(false);
  useEffect(() => {
    const text = handoff.current;
    if (!hydrated || !text || handoffSent.current || busy) return;
    if (engine.authLoading || !engine.connected || capped) return;
    // Send what is in the box, not the text the homepage handed over. The
    // visitor can be refining the prompt while the socket is still connecting,
    // and replaying handoff.current wiped those edits the moment it connected.
    // An emptied box means they changed their mind — stand down and leave it.
    const pending = draft.trim();
    handoffSent.current = true;
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft('');
    void ask(pending, []);
  }, [hydrated, busy, engine.authLoading, engine.connected, capped, ask, draft]);

  const followUp = useCallback((text: string) => { void ask(text, []); }, [ask]);

  const resend = useCallback((msgId: string, text: string) => {
    setEditingId(null);
    const previous = (convos.find(c => c.id === activeId)?.messages ?? []).find(m => m.id === msgId);
    void ask(text, previous?.images ?? [], msgId);
  }, [convos, activeId, ask]);

  // ---- answer again ----
  // Same prompt, same context up to it, a fresh answer beside the old one.
  const regenerate = useCallback(async (msgId: string, withPlan?: Plan) => {
    if (busy) return;
    const convo = convos.find(c => c.id === activeId);
    if (!convo) return;
    const at = convo.messages.findIndex(m => m.id === msgId);
    if (at < 0) return;
    // "again" means the model that wrote the answer on screen, unless another
    // one was asked for. Only if that model has left the catalog does it fall
    // back to whatever the composer is set to.
    const wrote = activeVersion(convo.messages[at]).model?.id;
    const chosen = withPlan ?? engine.models.find(p => p.id === wrote) ?? plan;
    await run({
      convoId: convo.id,
      target: msgId,
      payload: buildPayload(convo.messages.slice(0, at).slice(-10), chosen, convo.instructions ?? ''),
      plan: chosen,
      think: chosen.thinking ? think : false,
    });
  }, [busy, convos, activeId, engine.models, plan, think, run]);

  // ---- continue a cut-off answer ----
  // Not a new question. The job's last message is the half-written answer with
  // no user turn after it, so the model resumes that sentence instead of
  // starting the answer again, and what it writes is appended to the version it
  // picked up. Thinking is off: the answer is already under way.
  const continueFrom = useCallback(async (msgId: string) => {
    if (busy) return;
    const convo = convos.find(c => c.id === activeId);
    if (!convo) return;
    const at = convo.messages.findIndex(m => m.id === msgId);
    if (at < 0) return;
    const version = activeVersion(convo.messages[at]);
    const { cleanContent, sources } = parseSourcesFromContent(version.content);
    if (!cleanContent.trim()) return;
    // The model that wrote the first half finishes it, and it has to be a native
    // one. A browser worker runs WebLLM, which refuses a payload whose last
    // message is the assistant's (MessageOrderError) and whose input budget is
    // smaller than its own output cap, so resending a full-length answer comes
    // back as "message too long". The chip is hidden on that lane; this is the
    // guard behind it, and it also covers an answer whose model has left the
    // catalog, where the lane is unknowable.
    const chosen = engine.models.find(p => p.id === version.model?.id);
    if (chosen?.tier !== 'max') return;
    await run({
      convoId: convo.id,
      target: msgId,
      payload: buildPayload(convo.messages.slice(0, at + 1).slice(-10), chosen, convo.instructions ?? ''),
      plan: chosen,
      think: false,
      prefix: cleanContent,
      extend: version.id,
      sources,
      resumeCut: version.cutAtLimit ? 'limit' : version.truncated ? 'stop' : undefined,
    });
  }, [busy, convos, activeId, engine.models, run]);

  const pickVersion = useCallback((msgId: string, index: number) => {
    persist(convos.map(c => (c.id === activeId
      ? { ...c, messages: c.messages.map(m => (m.id === msgId ? selectVersion(m, index) : m)) }
      : c)));
  }, [convos, activeId, persist]);

  const stop = useCallback(() => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    const partial = buffer.current.trim();
    const to = landing.current;
    // Stopping cancels the pending render too: engine.cancel() drops the job
    // record, so no image event can ever arrive to clear this. Committing with
    // it still set baked a permanent placeholder into the saved turn.
    awaitingImage.current = false;
    // flagged, so the turn can offer to pick the answer back up
    if (partial && to) commit(to, partial, 'stop');
    clearLive();
    engine.cancel();
  }, [engine, commit, clearLive]);

  // ---- steering ----
  // A selection inside an answer becomes a quoted line in the composer. It is
  // added to whatever is already there, never on top of it.
  const askAbout = useCallback((quote: string) => {
    setDraft(prev => (prev.trim() ? `${prev.trimEnd()}\n\n> ${quote}\n` : `> ${quote}\n`));
    setTimeout(() => {
      const el = composerInput.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  }, []);

  // ---- shortcuts ----
  // Cmd/Ctrl+K anywhere, "/" only when the caret is not already in a field. On
  // a Mac only Cmd+K is taken: ctrl+K in a text field is the native
  // delete-to-end-of-line and stealing it would be a regression for typists.
  // Closing the palette is the palette's own business, so a rename in progress
  // is never dropped by the panel disappearing underneath it.
  useEffect(() => {
    const mac = isMac();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!e.altKey && e.key.toLowerCase() === 'k' && (mac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The stream flush timer outlives the page otherwise: navigating away between
  // two token batches leaves it to fire setStreamText on a dead component.
  useEffect(() => () => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
  }, []);

  // ---- gates ----
  if (engine.authLoading) {
    return <div className="cu grid h-dvh place-items-center" style={{ background: 'var(--cu-bg)' }} />;
  }

  const empty = messages.length === 0 && state === 'idle';
  const lastAnswer = lastOf(messages, 'assistant');
  /** Continue is native-only (see continueFrom): on the browser lane the chip is
   *  not offered at all, and the cut note under the answer stands on its own. */
  const canContinue = !!lastAnswer
    && engine.models.find(p => p.id === activeVersion(lastAnswer).model?.id)?.tier === 'max';
  const lastAsk = lastOf(messages, 'user');

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
      onSend={send}
      onStop={stop}
      busy={busy}
      centered={empty}
      inputRef={composerInput}
      convoId={activeId}
      instructions={instructions}
      onInstructions={commitInstructions}
      instrOpen={instrOpen}
      onInstrOpen={v => (v ? openInstructions() : setInstrOpen(false))}
    />
  );

  return (
    <div className="cu flex h-dvh overflow-hidden" style={{ background: 'var(--cu-bg)', color: 'var(--cu-text)' }}>
      <Sidebar
        convos={convos}
        activeId={activeId}
        onSelect={selectConvo}
        onNew={startNew}
        onRename={renameConvo}
        onDelete={deleteConvo}
        engine={engine}
        open={railOpen}
        onClose={() => setRailOpen(false)}
        onSearch={() => setPaletteOpen(true)}
        onUsage={() => setUsageOpen(true)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* floating controls instead of a header bar. They belong over the
            thread, not over the composer: at z-20 they painted through the
            instructions panel, which opens upward into this corner on a phone.
            The same layer as the composer puts them behind it, since it comes
            later in the tree. */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 md:hidden">
          <button onClick={() => setRailOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl text-fg-55 hover:bg-[var(--chat-row-on)]"><Panel /></button>
          <button onClick={startNew} className="grid h-9 w-9 place-items-center rounded-xl text-fg-55 hover:bg-[var(--chat-row-on)]"><Plus /></button>
        </div>

        {/* One scroller for the whole column. Everything lives inside it, so
            its bar runs the full height of the page instead of stopping where
            the composer begins.

            Three stable slots: content, composer, balance. The composer keeps
            its DOM position in every state, so it never remounts and never
            drops focus when the first message turns an empty thread into a
            conversation. */}
        <div
          ref={scroller}
          onScroll={onScroll}
          className="cu-scroll flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
        {/* `grow` holds the composer at the bottom of the page while a thread
            is still short; `shrink-0` keeps a long one at its full height so
            the scroller scrolls instead of squeezing it */}
        <div key="content" className={empty ? 'flex flex-1 flex-col justify-end' : 'grow shrink-0'}>
          {empty ? (
            <div className="cu-fade mx-auto mb-7 w-full max-w-[46rem] px-4">
              <h1 className="pixel-serif text-[34px] leading-[1.15] tracking-[-0.01em] md:text-[42px]" style={{ color: 'var(--cu-text)' }}>
                Ask the impossible.
              </h1>
              <p className="mt-3 text-[15px]" style={{ color: 'var(--cu-dim)' }}>
                Models that actually answer, served by machines people own.
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[46rem] space-y-7 px-4 pb-12 pt-16 md:pt-10">
              {messages.map((m, i) => (
                <Turn
                  key={m.id}
                  msg={m}
                  engine={engine}
                  busy={busy}
                  live={busy && liveConvo === activeId && regenFor === m.id ? {
                    text: streamText,
                    state: state === 'queued' ? 'queued' : 'streaming',
                    queue,
                    searching,
                    generatingImage: genImage,
                    sources: liveSources,
                  } : undefined}
                  editable={m.role === 'user' && !busy}
                  editing={editingId === m.id}
                  onEdit={() => setEditingId(m.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onResend={text => resend(m.id, text)}
                  onRegenerate={p => void regenerate(m.id, p)}
                  onPick={index => pickVersion(m.id, index)}
                  // follow-ups belong to the answer you are looking at, so only
                  // the last one carries them
                />
              ))}
              {busy && liveConvo === activeId && regenFor === null && (
                <Live
                  text={streamText}
                  state={state === 'queued' ? 'queued' : 'streaming'}
                  queue={queue}
                  searching={searching}
                  generatingImage={genImage}
                  sources={liveSources}
                />
              )}
              {notice && liveConvo === activeId && (
                <p className="cu-fade text-[13px]" style={{ color: 'var(--cu-faint)' }}>{notice}</p>
              )}
              {error && liveConvo === activeId && (
                <div className="cu-fade rounded-2xl px-4 py-3 text-[14px]" style={{ background: 'color-mix(in oklab, var(--danger) 8%, transparent)', color: 'var(--danger-soft)' }}>
                  <p>{error}</p>
                  <div className="mt-2 flex gap-3 text-[13px]">
                    {retryJob && (
                      <button onClick={() => { setError(null); void run(retryJob); }} className="underline underline-offset-2 hover:text-fg">Try again</button>
                    )}
                    <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">Dismiss</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* The composer is the last thing in the scroller: at rest it sits at
            the very bottom of the page, and it pins there while the thread
            scrolls behind it. */}
        {/* transparent above the composer, and it lets the pointer through:
            everything but the chips and the box itself belongs to the thread
            scrolling behind it */}
        <div key="composer" className="pointer-events-none sticky bottom-0 z-10">
          {/* rides on the composer rather than on a fixed offset, so it clears
              the box whatever height it has grown to */}
          {showJump && !empty && (
            <button
              onClick={() => { pinned.current = true; setShowJump(false); scrollToEnd(); }}
              className="pointer-events-auto absolute -top-11 left-1/2 z-20 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full text-fg-70 shadow-lg backdrop-blur transition-colors hover:text-fg"
              style={{ background: 'color-mix(in oklab, var(--chat-pop) 90%, transparent)' }}
              aria-label="Scroll to latest"
            ><Down /></button>
          )}

          {/* The follow-ups belong to the composer: they are things you are
              about to say. Pinned to the top right of the box, always there,
              and read from the answer above. Nothing sits behind them but the
              thread, so they never cut a band across it. `z-10` puts them over
              the fade below, which would otherwise wash across them. */}
          {!busy && lastAnswer && (
            <div className="relative z-10 mx-auto w-full max-w-[46rem] px-4 [&_.cu-chip]:pointer-events-auto">
              <div className="cu-followups flex flex-wrap items-center justify-end gap-1.5 pb-2">
                <FollowUps
                  content={lastAnswer.content}
                  truncated={lastAnswer.truncated}
                  onPick={followUp}
                  onContinue={canContinue ? () => void continueFrom(lastAnswer.id) : undefined}
                />
              </div>
            </div>
          )}

          {/* only the composer itself is opaque, and the thread fades into it
              rather than meeting a hard edge */}
          <div className="pointer-events-auto relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-8 h-8"
              style={{ background: 'linear-gradient(to bottom, transparent, var(--cu-bg))' }}
            />
            <div style={{ background: 'var(--cu-bg)' }}>{composer}</div>
          </div>
        </div>

        {/* balances the empty state so the cluster reads as centred */}
        <div key="balance" className={empty ? 'flex-1' : 'hidden'} />
        </div>

        {/* out of flow entirely: appears over a selection inside an answer */}
        <AskSelection onAsk={askAbout} />
      </main>

      {/* inside the .cu root: the scope owns the font stack and the tokens,
          and a palette mounted outside it renders in the browser default */}
      {paletteOpen && (
        <Palette
          onClose={() => setPaletteOpen(false)}
          engine={engine}
          convos={convos}
          activeId={activeId}
          plan={plan}
          onPlan={setPlan}
          think={think}
          onThink={setThink}
          hasInstructions={instructions.trim().length > 0}
          onEditInstructions={openInstructions}
          canAskAgain={!!lastAnswer && !busy}
          onAskAgain={p => { if (lastAnswer) void regenerate(lastAnswer.id, p); }}
          canEditLast={!!lastAsk && !busy}
          onEditLast={() => { if (lastAsk) setEditingId(lastAsk.id); }}
          onSelect={selectConvo}
          onNew={startNew}
          onRename={renameConvo}
          onDelete={deleteConvo}
        />
      )}

      {/* mounted only while open, so each opening reads the account fresh */}
      {usageOpen && <UsagePanel engine={engine} onClose={() => setUsageOpen(false)} />}
    </div>
  );
}
