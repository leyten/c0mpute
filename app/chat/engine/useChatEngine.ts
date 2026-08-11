'use client';

// THE BUILDING BLOCKS, and nothing else. This hook is the entire backend
// surface a chat frontend needs: connection + stats, auth/anon/credits, the
// model catalog, and send() — one streamed job at a time with the safety
// pipeline (stop-token strip, disclaimer filter, output scan) enforced
// inside, plus the preview demo driver when the network is offline.
// Concepts build complete products on this; nothing above it is shared.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { scanOutput, BLOCKED_MESSAGE } from '@/lib/safety';
import type { NetworkStats } from '@/lib/orchestrator/types';
import { PLANS, SWARM_PLAN, planWorkerCount, filterDisclaimers, type FileRef, type Plan, type SourceRef } from '../lib';
import { DEMO_MODE, DEMO_NETWORK_STATS, pickDemo, demoChunks, demoSleep, makeDemoImage } from '../demo';

const ANON_TOKEN_KEY = 'c0mpute_anon_token';
const STOP_TOKENS = ['<|im_end|>', '<|im_end', '<|im_start|>', '<|endoftext|>'];
const JOB_STALL_MS = 60000;

export type EngineMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; images?: string[] };

export interface SendCallbacks {
  /** Cleaned incremental text (stop tokens stripped). Includes raw think tags. */
  onDelta?: (chunk: string) => void;
  onQueue?: (position: number | null) => void;
  onSearching?: () => void;
  onSources?: (sources: SourceRef[]) => void;
  onGeneratingImage?: () => void;
  /** Images may arrive after onComplete (async render path). */
  onImage?: (images: string[]) => void;
  /** A generated document, ready to download. Arrives while the answer is
   *  still being written: the tool renders it before the model's turn ends. */
  onFile?: (file: FileRef) => void;
  /** Final SAFE text (disclaimers filtered, scan applied) + everything gathered. */
  onComplete?: (finalText: string, meta: { thinkSeconds: number | null; sources: SourceRef[]; images: string[] }) => void;
  onError?: (message: string) => void;
}

export interface ChatEngine {
  // auth
  authLoading: boolean;
  isAuthenticated: boolean;
  displayName: string | null;
  login: () => void;
  logout: () => Promise<void>;
  // anon lane
  anonReady: boolean;
  anonRemaining: number | null;
  anonCapReached: boolean;
  // connection + network
  connected: boolean;       // presentation truth (true in demo)
  live: boolean;            // wire truth (false in demo)
  demo: boolean;
  stats: NetworkStats | null;
  queuePosition: number | null;
  // credits
  credits: { balance: number | null; freePrompts: number | null; freeLimit: number | null; stakerAllowance: number };
  refreshCredits: () => void;
  // models
  models: Plan[];
  swarmModel: typeof SWARM_PLAN;
  workerCount: (plan: Plan) => number;
  // job
  busy: boolean;
  send: (args: { messages: EngineMessage[]; model: string; think?: boolean }, cb: SendCallbacks) => Promise<boolean>;
  cancel: () => void;
}

export function useChatEngine(): ChatEngine {
  const { isLoading: authLoading, isAuthenticated, login, logout, getAccessToken, displayName } = useAuth();

  // ---- auth token for the socket ----
  const [socketAuthToken, setSocketAuthToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) { setSocketAuthToken(null); return; }
    (async () => {
      try {
        const t = await getAccessToken();
        if (!cancelled) setSocketAuthToken(t);
      } catch { /* engine stays unauthenticated */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, getAccessToken]);

  // ---- anon lane ----
  const [anonToken, setAnonToken] = useState<string | null>(null);
  const [anonRemaining, setAnonRemaining] = useState<number | null>(null);
  const [anonCapReached, setAnonCapReached] = useState(false);
  const [anonReady, setAnonReady] = useState(false);
  useEffect(() => {
    if (authLoading || isAuthenticated) { setAnonReady(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const existing = localStorage.getItem(ANON_TOKEN_KEY);
        const res = await fetch('/api/anon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: existing || undefined }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.capReached || !data.token) {
          setAnonCapReached(true);
        } else {
          localStorage.setItem(ANON_TOKEN_KEY, data.token);
          setAnonToken(data.token);
          setAnonRemaining(typeof data.remaining === 'number' ? data.remaining : null);
        }
      } catch {
        if (!cancelled) setAnonCapReached(true);
      } finally {
        if (!cancelled) setAnonReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated]);

  // Re-read the anon lane's remaining count — the failed-job counterpart to
  // refreshCredits, so a server-side free-prompt restore is visible without a
  // reload. No-op for signed-in users (their lane is /api/credits).
  const refreshAnonRemaining = useCallback(() => {
    if (isAuthenticated) return;
    const existing = localStorage.getItem(ANON_TOKEN_KEY);
    if (!existing) return;
    fetch('/api/anon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: existing }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return;
        if (data.capReached || !data.token) {
          setAnonCapReached(true);
        } else {
          localStorage.setItem(ANON_TOKEN_KEY, data.token);
          setAnonToken(data.token);
          setAnonRemaining(typeof data.remaining === 'number' ? data.remaining : null);
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // ---- socket ----
  // Minted per handshake so a reconnect after the mount-time Privy token
  // expired doesn't get rejected and permanently kill the connection.
  const freshSocketToken = useCallback(async () => {
    if (!isAuthenticated) return anonToken;
    try { return await getAccessToken(); } catch { return null; }
  }, [isAuthenticated, getAccessToken, anonToken]);

  const {
    isConnected,
    networkStats,
    queuePosition,
    submitJob,
    abortJob,
    setOnJobToken,
    setOnJobComplete,
    setOnJobError,
    setOnJobAssigned,
    setOnJobSearching,
    setOnJobSources,
    setOnJobGeneratingImage,
    setOnJobImage,
    setOnJobImageError,
    setOnJobFile,
  } = useSocket(isAuthenticated ? socketAuthToken : anonToken, freshSocketToken);

  // ---- credits ----
  const [credits, setCredits] = useState<ChatEngine['credits']>({ balance: null, freePrompts: null, freeLimit: null, stakerAllowance: 0 });
  const refreshCredits = useCallback(() => {
    if (!isAuthenticated || !socketAuthToken) return;
    fetch('/api/credits', { headers: { Authorization: `Bearer ${socketAuthToken}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setCredits({
            balance: data.balance ?? null,
            freePrompts: typeof data.freePromptsRemaining === 'number' ? data.freePromptsRemaining : null,
            freeLimit: typeof data.freePromptLimit === 'number' ? data.freePromptLimit : null,
            stakerAllowance: data.stakerAllowance?.enabled ? (data.stakerAllowance.remaining ?? 0) : 0,
          });
        }
      })
      .catch(() => {});
  }, [isAuthenticated, socketAuthToken]);
  useEffect(() => { refreshCredits(); }, [refreshCredits]);

  // ---- the single active job ----
  const [busy, setBusy] = useState(false);
  const activeRef = useRef<{
    jobId: string;
    cb: SendCallbacks;
    buffer: string;
    thinkStart: number | null;
    thinkSeconds: number | null;
    sources: SourceRef[];
    images: string[];
    completed: boolean;
    stall: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const clearStall = () => {
    const a = activeRef.current;
    if (a?.stall) { clearTimeout(a.stall); a.stall = null; }
  };
  const armStall = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    if (a.stall) clearTimeout(a.stall);
    a.stall = setTimeout(() => {
      const cur = activeRef.current;
      if (cur && !cur.completed) {
        cur.completed = true;
        setBusy(false);
        cur.cb.onError?.('The network did not respond in time. Your credits were not spent, or will be refunded.');
        activeRef.current = null;
        // Show the refund. The server restores the charge on its own timeout
        // schedule, which can land after this stall fires — fetch now for the
        // fast case and once more shortly after for the slow one.
        refreshCredits();
        refreshAnonRemaining();
        setTimeout(() => { refreshCredits(); refreshAnonRemaining(); }, 5000);
      }
    }, JOB_STALL_MS);
  }, [refreshCredits, refreshAnonRemaining]);

  const finishActive = useCallback(() => {
    const a = activeRef.current;
    if (!a || a.completed) return;
    a.completed = true;
    clearStall();
    let finalText = filterDisclaimers(a.buffer.trim());
    if (finalText && !scanOutput(finalText).safe) finalText = BLOCKED_MESSAGE;
    setBusy(false);
    a.cb.onComplete?.(finalText, { thinkSeconds: a.thinkSeconds, sources: a.sources, images: a.images });
    // keep the record briefly for late image events, then drop it
    setTimeout(() => { if (activeRef.current === a) activeRef.current = null; }, 210000);
    refreshCredits();
  }, [refreshCredits]);

  // wire socket events into the active job
  useEffect(() => {
    setOnJobToken((jobId, token) => {
      const a = activeRef.current;
      if (!a || a.completed || jobId !== a.jobId) return;
      armStall();
      let clean = token;
      // replaceAll: a chunk can carry the same stop token more than once, and
      // replace() would leave every copy after the first in the answer.
      for (const s of STOP_TOKENS) clean = clean.replaceAll(s, '');
      if (!clean) return;
      if (clean.includes('<think>') && !a.thinkStart) a.thinkStart = Date.now();
      if (clean.includes('</think>') && a.thinkStart) {
        a.thinkSeconds = Math.round((Date.now() - a.thinkStart) / 1000);
        a.thinkStart = null;
      }
      a.buffer += clean;
      a.cb.onDelta?.(clean);
    });
    setOnJobAssigned((jobId) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) { armStall(); a.cb.onQueue?.(null); }
    });
    setOnJobComplete((jobId, response) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) {
        // The swarm lane emits the finished answer on job:complete without
        // having streamed job:token for it, so the buffer can be empty while
        // the authoritative text is right here. Falling through with an empty
        // buffer rendered "[No response received]" for a paid, delivered answer.
        if (!a.buffer && typeof response === 'string' && response) a.buffer = response;
        finishActive();
      }
    });
    setOnJobError((jobId, error) => {
      const a = activeRef.current;
      if (a && !a.completed && jobId === a.jobId) {
        a.completed = true;
        clearStall();
        setBusy(false);
        a.cb.onError?.(error || 'The job failed.');
        activeRef.current = null;
        // Same as the stall path: make the refund visible without a reload.
        refreshCredits();
        refreshAnonRemaining();
        setTimeout(() => { refreshCredits(); refreshAnonRemaining(); }, 5000);
      }
    });
    setOnJobSearching((jobId) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) { armStall(); a.cb.onSearching?.(); }
    });
    setOnJobSources((jobId, sources) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) { a.sources = sources; a.cb.onSources?.(sources); }
    });
    setOnJobGeneratingImage((jobId) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) { armStall(); a.cb.onGeneratingImage?.(); }
    });
    setOnJobImage((jobId, images) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) { a.images = [...a.images, ...images]; a.cb.onImage?.(images); }
    });
    setOnJobImageError((jobId) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) a.cb.onImage?.([]);
    });
    setOnJobFile((jobId, file) => {
      const a = activeRef.current;
      if (a && jobId === a.jobId) a.cb.onFile?.(file);
    });
    return () => {
      setOnJobToken(null); setOnJobAssigned(null); setOnJobComplete(null); setOnJobError(null);
      setOnJobSearching(null); setOnJobSources(null); setOnJobGeneratingImage(null); setOnJobImage(null); setOnJobImageError(null);
      setOnJobFile(null);
    };
  }, [setOnJobToken, setOnJobAssigned, setOnJobComplete, setOnJobError, setOnJobSearching, setOnJobSources, setOnJobGeneratingImage, setOnJobImage, setOnJobImageError, setOnJobFile, armStall, finishActive, refreshCredits, refreshAnonRemaining]);

  // queue positions flow to the active job's callback
  useEffect(() => {
    const a = activeRef.current;
    if (a && !a.completed) {
      // A queue update IS the network responding, so it has to re-arm the stall
      // like every other job event. Without this, a job that waits behind others
      // tripped the 60s stall while the server's own queue timeout is 180s: the
      // user was told the network went quiet and their credits were safe (both
      // untrue), and the answer that arrived later was dropped on the floor
      // because the stall had already detached the job record.
      armStall();
      a.cb.onQueue?.(queuePosition);
    }
  }, [queuePosition, armStall]);

  // The stall timer and the late-image retention timer both outlive the page if
  // nothing clears them: navigate off /chat mid-answer and the stall still fires
  // into a dead component, firing four credit/anon refetches for a page nobody
  // is on.
  useEffect(() => () => { clearStall(); }, []);

  // ---- demo driver (preview only, offline only) ----
  const runDemo = useCallback(async (prompt: string, cb: SendCallbacks) => {
    const jobId = `demo-${Date.now()}`;
    const a = { jobId, cb, buffer: '', thinkStart: null as number | null, thinkSeconds: null as number | null, sources: [] as SourceRef[], images: [] as string[], completed: false, stall: null as ReturnType<typeof setTimeout> | null };
    activeRef.current = a;
    setBusy(true);
    const script = pickDemo(prompt);
    await demoSleep(450);
    if (script.sources) {
      cb.onSearching?.();
      await demoSleep(1100);
      a.sources = script.sources;
      cb.onSources?.(script.sources);
    }
    if (script.image) cb.onGeneratingImage?.();
    for (const chunk of demoChunks(script.body)) {
      if (activeRef.current !== a || a.completed) return;
      let clean = chunk;
      if (clean.includes('<think>') && !a.thinkStart) a.thinkStart = Date.now();
      if (clean.includes('</think>') && a.thinkStart) {
        a.thinkSeconds = Math.round((Date.now() - a.thinkStart) / 1000);
        a.thinkStart = null;
      }
      a.buffer += clean;
      cb.onDelta?.(clean);
      await demoSleep(22);
    }
    // The loop's guard is at the top, so a stop during the last sleep fell
    // straight through to onComplete — and since stop() has already committed
    // the partial under the same answer id, that appended a second message with
    // a duplicate React key.
    if (activeRef.current !== a || a.completed) return;
    a.completed = true;
    let finalText = filterDisclaimers(a.buffer.trim());
    if (finalText && !scanOutput(finalText).safe) finalText = BLOCKED_MESSAGE;
    setBusy(false);
    cb.onComplete?.(finalText, { thinkSeconds: a.thinkSeconds, sources: a.sources, images: [] });
    if (script.image) {
      await demoSleep(900);
      cb.onImage?.([makeDemoImage()]);
    }
    activeRef.current = null;
  }, []);

  // ---- send ----
  const send = useCallback<ChatEngine['send']>(async ({ messages, model, think }, cb) => {
    if (activeRef.current && !activeRef.current.completed) return false;
    if (!isConnected) {
      if (DEMO_MODE) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        void runDemo(lastUser?.content ?? '', cb);
        return true;
      }
      cb.onError?.('Not connected to the network.');
      return false;
    }
    try {
      const authToken = isAuthenticated ? await getAccessToken() : anonToken;
      if (!authToken) {
        cb.onError?.('Authentication expired. Please refresh and sign in again.');
        return false;
      }
      const a = { jobId: '', cb, buffer: '', thinkStart: null as number | null, thinkSeconds: null as number | null, sources: [] as SourceRef[], images: [] as string[], completed: false, stall: null as ReturnType<typeof setTimeout> | null };
      activeRef.current = a;
      setBusy(true);
      const { jobId, freeRemaining } = await submitJob({ messages, model, authToken, think: think ?? false });
      a.jobId = jobId;
      if (!isAuthenticated && typeof freeRemaining === 'number') setAnonRemaining(freeRemaining);
      armStall();
      return true;
    } catch (e) {
      setBusy(false);
      activeRef.current = null;
      cb.onError?.(e instanceof Error ? e.message : 'Failed to submit.');
      return false;
    }
  }, [isConnected, isAuthenticated, getAccessToken, anonToken, submitJob, armStall, runDemo]);

  const cancel = useCallback(() => {
    const a = activeRef.current;
    if (a && !a.completed) {
      a.completed = true;
      clearStall();
      setBusy(false);
      // Tell the network too. Dropping the record locally only made the UI stop
      // listening — the worker ran the answer to completion on a GPU the network
      // still saw as busy, and the next prompt queued behind it.
      if (a.jobId) abortJob(a.jobId);
      activeRef.current = null;
    }
  }, [abortJob]);

  return {
    authLoading,
    isAuthenticated,
    displayName,
    login,
    logout,
    anonReady,
    anonRemaining,
    anonCapReached,
    connected: isConnected || DEMO_MODE,
    live: isConnected,
    demo: DEMO_MODE && !isConnected,
    stats: networkStats ?? (DEMO_MODE ? DEMO_NETWORK_STATS : null),
    queuePosition,
    credits,
    refreshCredits,
    models: [...PLANS],
    swarmModel: SWARM_PLAN,
    workerCount: (plan: Plan) => planWorkerCount(plan, networkStats ?? (DEMO_MODE ? DEMO_NETWORK_STATS : null)),
    busy,
    send,
    cancel,
  };
}
