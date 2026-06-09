'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Markdown from 'markdown-to-jsx';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useSocket } from '@/hooks/useSocket';
import { Chat, Message, ChatWithMessages } from '@/lib/types';
import { MAX_INPUT_CHARS } from '@/lib/orchestrator/types';
// E2E encryption removed for now — keeping it simple
import { scanOutput, BLOCKED_MESSAGE } from '@/lib/safety';
import OnboardingModal from '@/components/OnboardingModal';
import AnonGateModal from '@/components/AnonGateModal';
// search utilities no longer needed — tool calling handles search via the model

// Parse sources from response content (appended by worker as ---SOURCES---)
function parseSourcesFromContent(content: string): { cleanContent: string; sources: { title: string; url: string; description: string }[] } {
  const marker = '---SOURCES---';
  const idx = content.indexOf(marker);
  if (idx === -1) return { cleanContent: content, sources: [] };
  const cleanContent = content.substring(0, idx).trimEnd();
  try {
    const sources = JSON.parse(content.substring(idx + marker.length).trim());
    return { cleanContent, sources };
  } catch {
    return { cleanContent: content, sources: [] };
  }
}

// Render inline citations [1], [2] etc. as superscript links
function CitationText({ text, sources }: { text: string; sources: { title: string; url: string; description: string }[] }) {
  if (sources.length === 0) return <>{text}</>;
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const idx = parseInt(match[1], 10) - 1;
          const source = sources[idx];
          if (source) {
            const domain = (() => { try { return new URL(source.url).hostname.replace('www.', ''); } catch { return ''; } })();
            return (
              <a key={i} href={source.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-white/10 hover:bg-white/20 text-white/60 hover:text-white rounded-full no-underline align-super ml-0.5 mr-0.5 transition-colors cursor-pointer"
                title={`${source.title} — ${domain}`}>{match[1]}</a>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Filter sources to only those cited in the content
function getUsedSources(content: string, sources: { title: string; url: string; description: string }[]): { source: { title: string; url: string; description: string }; originalIndex: number }[] {
  if (sources.length === 0) return [];
  const used: { source: typeof sources[0]; originalIndex: number }[] = [];
  sources.forEach((s, i) => {
    if (content.includes(`[${i + 1}]`)) {
      used.push({ source: s, originalIndex: i });
    }
  });
  // If no inline citations found, show all (fallback for old messages)
  if (used.length === 0) return sources.map((s, i) => ({ source: s, originalIndex: i }));
  return used;
}

// Source strip shown above the response
function SourceStrip({ sources, content }: { sources: { title: string; url: string; description: string }[]; content?: string }) {
  if (sources.length === 0) return null;
  const displayed = content ? getUsedSources(content, sources) : sources.map((s, i) => ({ source: s, originalIndex: i }));
  if (displayed.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {displayed.map(({ source: s, originalIndex: i }) => {
        const domain = (() => { try { return new URL(s.url).hostname.replace('www.', ''); } catch { return ''; } })();
        return (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
            className="cursor-pointer flex items-center gap-1.5 px-2 py-1 bg-white/[0.04] border border-white/[0.08] hover:border-white/15 hover:bg-white/[0.06] transition-all rounded-md group">
            <span className="flex items-center justify-center w-3.5 h-3.5 text-[9px] font-medium bg-white/10 text-white/70 rounded-full flex-shrink-0">{i + 1}</span>
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="flex-shrink-0 opacity-50 group-hover:opacity-80" />
            <span className="pixel-sans text-white/70 text-[11px] truncate max-w-[100px] group-hover:text-white/70">{s.title || domain}</span>
          </a>
        );
      })}
    </div>
  );
}

// LaTeX is base64-encoded into a tag attribute so markdown-to-jsx passes it
// through untouched — otherwise `_`, `^`, `{}` in formulas get parsed as markdown.
function encodeTex(tex: string): string {
  try { return btoa(encodeURIComponent(tex)); } catch { return ''; }
}
function decodeTex(enc: string): string {
  try { return decodeURIComponent(atob(enc)); } catch { return ''; }
}

// Convert $...$ and $$...$$ into custom tags carrying the encoded LaTeX. Code
// spans/fences are skipped so a literal $ inside code stays untouched.
function mathToTags(text: string): string {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((seg, i) => {
    if (i % 2 === 1) return seg; // code segment
    seg = seg.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => `<mathblock data-tex="${encodeTex(tex.trim())}"></mathblock>`);
    seg = seg.replace(/\$(?![\s$])([^\n$]*?)(?<!\s)\$/g, (_m, tex) => `<mathinline data-tex="${encodeTex(tex)}"></mathinline>`);
    return seg;
  }).join('');
}

function MathInline({ 'data-tex': enc }: any) {
  const tex = decodeTex(enc || '');
  try {
    const html = katex.renderToString(tex, { throwOnError: false, displayMode: false });
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <span>{tex}</span>;
  }
}

function MathBlock({ 'data-tex': enc }: any) {
  const tex = decodeTex(enc || '');
  try {
    const html = katex.renderToString(tex, { throwOnError: false, displayMode: true });
    return <div className="my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <div>{tex}</div>;
  }
}

// Build markdown components that inject KaTeX math and citation rendering
function buildMarkdownOverrides(sources: { title: string; url: string; description: string }[]) {
  const mathOverrides = {
    mathinline: { component: MathInline },
    mathblock: { component: MathBlock },
  };
  if (sources.length === 0) return { overrides: mathOverrides };
  const proc = (child: React.ReactNode): React.ReactNode => typeof child === 'string' ? <CitationText text={child} sources={sources} /> : child;
  return {
    overrides: {
      ...mathOverrides,
      p: { component: ({ children, ...props }: any) => <p {...props}>{Array.isArray(children) ? children.map((c: any, i: number) => <span key={i}>{proc(c)}</span>) : proc(children)}</p> },
      li: { component: ({ children, ...props }: any) => <li {...props}>{Array.isArray(children) ? children.map((c: any, i: number) => <span key={i}>{proc(c)}</span>) : proc(children)}</li> },
    },
  };
}

type ChatState = 'idle' | 'queued' | 'streaming' | 'error';

// Plan definitions — maps user-facing plans to internal model IDs
const PLANS = [
  { id: 'pro' as const, name: 'Pro', cost: 10, costLabel: '10 cr', modelId: 'Qwen3-8B-c0mpute-q4f16_1-MLC', description: 'Higher quality, uncensored', features: ['Qwen3 8B model', 'Browser-powered', 'Uncensored'] },
  { id: 'max' as const, name: 'Max', cost: 15, costLabel: '15 cr', modelId: 'native-max', description: 'Best quality + tools + vision', features: ['Qwen3.5 27B model', 'Native inference', 'Uncensored', 'Web search (tool calling)', 'Vision (image input)', 'Thinking mode'] },
] as const;
type PlanId = typeof PLANS[number]['id'];

// Local storage keys
const CHATS_STORAGE_KEY = 'c0mpute_chats';
const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';
// Signed anonymous-visitor token (free prompts without login)
const ANON_TOKEN_KEY = 'c0mpute_anon_token';
const ANON_FREE_LIMIT = 5;

// Helper to load chats from localStorage
function loadChatsFromStorage(): ChatWithMessages[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CHATS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to save chats to localStorage
function saveChatsToStorage(chats: ChatWithMessages[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch (err) {
    console.error('Error saving chats to localStorage:', err);
  }
}

// Filter out common AI disclaimers from responses
/** Normalize markdown for proper rendering */
function normalizeMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';
    const isHeading = /^#{1,6} /.test(line);
    const isList = /^\s*(\d+\.|[*+-]) /.test(line);
    const prevIsList = /^\s*(\d+\.|[*+-]) /.test(prev);
    const prevIsHeading = /^#{1,6} /.test(prev);
    const prevIsBlank = prev.trim() === '';
    
    // Blank line before headings
    if (isHeading && !prevIsBlank && i > 0) {
      result.push('');
    }
    // Blank line after headings (before non-list content)
    if (prevIsHeading && !isList && !prevIsBlank && line.trim() !== '') {
      result.push('');
    }
    // Blank line before first list item of a group
    if (isList && !prevIsList && !prevIsBlank && !prevIsHeading && i > 0) {
      result.push('');
    }
    // Blank line between non-list paragraphs (but NOT between list items)
    if (!isList && !prevIsList && !isHeading && !prevIsHeading && !prevIsBlank && line.trim() !== '' && prev.trim() !== '' && i > 0) {
      result.push('');
    }
    
    result.push(line);
  }
  
  return result.join('\n');
}

// Parse <think>...</think> tags from Qwen3 model output. Tool-calling produces
// multiple thinking rounds (think → tool call → think → answer), so collect
// every block into the dropdown and leave only the real answer in the response.
function parseThinking(content: string): { thinking: string | null; response: string; thinkSeconds: number | null } {
  const timeMatch = content.match(/<!--think_time:(\d+)-->/);
  const thinkSeconds = timeMatch ? parseInt(timeMatch[1], 10) : null;
  let response = content.replace(/<!--think_time:\d+-->/g, '');

  const thoughts: string[] = [];
  response = response.replace(/<think>([\s\S]*?)<\/think>/g, (_m, inner) => {
    thoughts.push(inner.trim());
    return '';
  });

  // An unclosed <think> at the tail means thinking is still streaming
  const open = response.indexOf('<think>');
  if (open !== -1) {
    thoughts.push(response.slice(open + '<think>'.length).trim());
    response = response.slice(0, open);
  }

  const thinking = thoughts.filter(Boolean).join('\n\n').trim();
  return { thinking: thinking || null, response: response.trim(), thinkSeconds };
}

// Collapsible thinking dropdown component
function ThinkingDropdown({ thinking, isStreaming, elapsedSeconds, defaultOpen }: { thinking: string; isStreaming?: boolean; elapsedSeconds?: number; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
  const seconds = elapsedSeconds ?? Math.max(1, Math.round(thinking.split(/\s+/).length / 5));
  
  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm pixel-sans"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {isStreaming ? (
          <span className="inline-flex">
            Thinking
            <span className="thinking-dots">
              <span className="dot">.</span>
              <span className="dot">.</span>
              <span className="dot">.</span>
            </span>
          </span>
        ) : (
          <span>Thought for {seconds}s</span>
        )}
      </button>
      {isOpen && (
        <div className="mt-2 ml-5 pl-3 border-l border-white/10 text-white/70 text-base leading-relaxed whitespace-pre-wrap pixel-sans">
          {thinking}
        </div>
      )}
    </div>
  );
}

function filterDisclaimers(text: string): string {
  const disclaimerPatterns = [
    /\n\n(?:Please note|Note:|Important:|Keep in mind|Be aware|However,|That said,|I should mention|It'?s important to|Remember that|Disclaimer:)[\s\S]*/i,
    /\n(?:Please note|Note:|Important:|Keep in mind|Be aware|However,|That said,|I should mention|It'?s important to|Remember that|Disclaimer:)[\s\S]*/i,
  ];
  
  const strip = (s: string) => {
    let out = s;
    for (const pattern of disclaimerPatterns) {
      out = out.replace(pattern, '');
    }
    return out;
  };

  // Never filter inside the reasoning block — a "However,"/"Note:" in the
  // model's thoughts would otherwise truncate the closing </think> and the
  // whole answer with it, leaving only the thinking dropdown. Only strip
  // disclaimers from the answer that follows </think>.
  const close = text.lastIndexOf('</think>');
  if (close !== -1) {
    const head = text.slice(0, close + '</think>'.length);
    const tail = strip(text.slice(close + '</think>'.length));
    return (head + tail).trim();
  }
  // Still mid-thought (open <think>, no close yet) — leave it untouched.
  if (text.indexOf('<think>') !== -1) {
    return text;
  }

  return strip(text).trim();
}

export default function UserPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated, user, login, getAccessToken } = useAuth();
  
  // Fetch auth token for socket connection
  const [socketAuthToken, setSocketAuthToken] = useState<string | null>(null);
  useEffect(() => {
    if (isAuthenticated) {
      getAccessToken().then(t => {
        if (t) setSocketAuthToken(t);
      });
    }
  }, [isAuthenticated, getAccessToken]);

  // Anonymous mode: a not-logged-in visitor gets a signed anon token so they can
  // run their free prompts without signing in. The token drives the socket, the
  // remaining count drives the sign-in nudges.
  const [anonToken, setAnonToken] = useState<string | null>(null);
  const [anonRemaining, setAnonRemaining] = useState<number | null>(null);
  const [anonLoading, setAnonLoading] = useState(true);
  const [anonModal, setAnonModal] = useState<null | 'nudge' | 'empty' | 'softlogin'>(null);
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) { setAnonLoading(false); return; }
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
          setAnonModal('softlogin');
        } else {
          localStorage.setItem(ANON_TOKEN_KEY, data.token);
          setAnonToken(data.token);
          setAnonRemaining(typeof data.remaining === 'number' ? data.remaining : null);
        }
      } catch {
        if (!cancelled) setAnonModal('softlogin');
      } finally {
        if (!cancelled) setAnonLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated]);

  // Socket (waits for an auth token — Privy when logged in, anon token otherwise)
  const {
    isConnected,
    networkStats,
    queuePosition,
    submitJob,
    // sendEncryptedPayload removed
    setOnJobToken,
    setOnJobComplete,
    setOnJobError,
    setOnJobAssigned,
    setOnJobSearching,
    setOnJobSources,
  } = useSocket(isAuthenticated ? socketAuthToken : anonToken);
  
  // Chat state - now storing full chats with messages locally
  const [chats, setChats] = useState<ChatWithMessages[]>([]);
  const [activeChat, setActiveChat] = useState<ChatWithMessages | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [streamingContent, setStreamingContent] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thinkingStartRef = useRef<number | null>(null);
  const thinkingElapsedRef = useRef<number | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState<number | null>(null);
  
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('max');
  const [deepThinking, setDeepThinking] = useState(false);
  const [tierSwitch, setTierSwitch] = useState<{ to: PlanId; toLabel: string; toCount: number } | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingPromptProcessed, setPendingPromptProcessed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingSources, setPendingSources] = useState<{ title: string; url: string; description: string }[]>([]);
  const pendingSourcesRef = useRef<{ title: string; url: string; description: string }[]>([]);
  useEffect(() => { pendingSourcesRef.current = pendingSources; }, [pendingSources]);
  
  // Credit system state
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [freePromptsRemaining, setFreePromptsRemaining] = useState<number>(0);
  const [freePromptLimit, setFreePromptLimit] = useState<number>(0);
  const [stakeAllowanceLeft, setStakeAllowanceLeft] = useState<number>(0);

  // Fetch credits (balance + free-prompt allowance + staker inference allowance);
  // reused after each prompt.
  const refreshCredits = useCallback(() => {
    if (!isAuthenticated || !socketAuthToken) return;
    fetch('/api/credits', { headers: { Authorization: `Bearer ${socketAuthToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCreditBalance(data.balance);
          if (typeof data.freePromptsRemaining === 'number') setFreePromptsRemaining(data.freePromptsRemaining);
          if (typeof data.freePromptLimit === 'number') setFreePromptLimit(data.freePromptLimit);
          setStakeAllowanceLeft(data.stakerAllowance?.enabled ? (data.stakerAllowance.remaining ?? 0) : 0);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, socketAuthToken]);

  useEffect(() => { refreshCredits(); }, [refreshCredits]);

  // First-visit onboarding wizard. Fires as soon as auth settles (Privy modal
  // closed), so it doesn't wait on the token/credits fetch chain.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (localStorage.getItem('c0mpute_onboarded')) return;
    setShowOnboarding(true);
  }, [authLoading, isAuthenticated]);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem('c0mpute_onboarded', '1');
    setShowOnboarding(false);
  }, []);

  // After an out-of-free-prompts user signs in, send them to the top-up page.
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (sessionStorage.getItem('c0mpute_post_login_topup')) {
      sessionStorage.removeItem('c0mpute_post_login_topup');
      localStorage.removeItem(ANON_TOKEN_KEY);
      router.push('/settings#usage');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load plan from DB
  useEffect(() => {
    if (!isAuthenticated || !socketAuthToken) return;
    fetch('/api/plan', { headers: { Authorization: `Bearer ${socketAuthToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.plan) setSelectedPlan(data.plan); })
      .catch(() => {});
  }, [isAuthenticated, socketAuthToken]);

  // Save plan to DB
  const savePlan = async (plan: PlanId) => {
    setSelectedPlan(plan);
    if (plan !== 'max') setDeepThinking(false);
    setModelMenuOpen(false);
    setTierSwitch(null);
    if (!socketAuthToken) return;
    fetch('/api/plan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${socketAuthToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    }).catch(() => {});
  };

  // Derive model ID from plan
  const selectedModel = PLANS.find(p => p.id === selectedPlan)?.modelId ?? PLANS[0].modelId;
  const selectedPlanObj = PLANS.find(p => p.id === selectedPlan) ?? PLANS[0];

  // Close the composer model menu on outside click
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelMenuOpen]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const queueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Streaming render throttle. Tokens accumulate in a ref (the authoritative full
  // text); we flush to React state at most ~8x/sec. Without this, every token
  // re-parsed the entire growing message through markdown-to-jsx + synchronous
  // KaTeX, which is quadratic and pins the main thread — long answers froze the
  // whole machine. The ref is the source of truth; streamingContent is the view.
  const streamBufferRef = useRef('');
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkStatsRef = useRef<typeof networkStats>(networkStats);
  useEffect(() => { networkStatsRef.current = networkStats; }, [networkStats]);
  // Whether the view is pinned to the bottom — drives auto-scroll during streaming
  const stickToBottomRef = useRef(true);
  // No E2E refs needed

  // Explicit jump to bottom (send, switch chat) — also re-pins auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    stickToBottomRef.current = true;
  }, []);

  // Track whether the user has scrolled up; if so, stop yanking them down
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Auto-scroll during streaming, but only while pinned to the bottom
  const autoScrollIfPinned = useCallback(() => {
    if (!stickToBottomRef.current) return;
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Push the buffered stream text into React state (throttled). Safety-scans the
  // accumulated text here rather than per-token (the per-token scan was itself
  // quadratic over the growing string).
  const STREAM_FLUSH_MS = 120;
  const flushStream = useCallback(() => {
    streamFlushRef.current = null;
    const text = streamBufferRef.current;
    setStreamingContent(scanOutput(text).safe ? text : BLOCKED_MESSAGE);
    autoScrollIfPinned();
  }, [autoScrollIfPinned]);

  // Load chats from localStorage on mount
  const fetchChats = useCallback(() => {
    const storedChats = loadChatsFromStorage();
    setChats(storedChats);
      setLoadingChats(false);
  }, []);

  // Select a chat
  const fetchChat = useCallback((chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChat(chat);
        setTimeout(scrollToBottom, 100);
      }
  }, [chats, scrollToBottom]);

  // Create new chat (locally)
  const createNewChat = useCallback(() => {
    const now = new Date().toISOString();
    const newChat: ChatWithMessages = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      privy_id: user?.id || 'local',
      title: 'New Chat',
      created_at: now,
      updated_at: now,
      messages: [],
    };
    
    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    saveChatsToStorage(updatedChats);
    setActiveChat(newChat);
        setInputValue('');
        setChatState('idle');
        setError(null);
  }, [user?.id, chats]);

  // Delete chat (locally)
  const deleteChat = useCallback((chatId: string) => {
    const updatedChats = chats.filter(c => c.id !== chatId);
    setChats(updatedChats);
    saveChatsToStorage(updatedChats);
        if (activeChat?.id === chatId) {
          setActiveChat(null);
        }
  }, [chats, activeChat?.id]);

  // Rename chat (locally)
  const renameChat = useCallback((chatId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    const updatedChats = chats.map(chat => 
      chat.id === chatId 
        ? { ...chat, title: newTitle.trim(), updated_at: new Date().toISOString() }
        : chat
    );
    setChats(updatedChats);
    saveChatsToStorage(updatedChats);
    if (activeChat?.id === chatId) {
      setActiveChat(prev => prev ? { ...prev, title: newTitle.trim() } : null);
    }
    setEditingChatId(null);
    setEditingTitle('');
  }, [chats, activeChat?.id]);

  // Save message to local chat
  const saveMessage = useCallback((chatId: string, role: 'user' | 'assistant', content: string, jobId?: string, images?: string[]): Message => {
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      chat_id: chatId,
      role,
      content,
      images: images && images.length > 0 ? images : undefined,
      job_id: jobId || null,
      created_at: new Date().toISOString(),
    };
    
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.id === chatId) {
          const updatedChat = {
            ...chat,
            messages: [...chat.messages, message],
            updated_at: new Date().toISOString(),
            // Auto-generate title from first user message
            title: chat.messages.length === 0 && role === 'user' 
              ? (content.length > 50 ? content.substring(0, 47) + '...' : content)
              : chat.title,
          };
          // Update activeChat if it's the same chat
          setActiveChat(prev => prev?.id === chatId ? updatedChat : prev);
          return updatedChat;
      }
        return chat;
      });
      saveChatsToStorage(updatedChats);
      return updatedChats;
    });
    
    return message;
  }, []);

  // Send message — with E2E encryption and auth
  // Copy message content
  const copyMessage = useCallback((messageId: string, content: string) => {
    const clean = content.replace(/---SOURCES---[\s\S]*$/, '').trim();
    navigator.clipboard.writeText(clean);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Edit user message — delete everything after it and set input to its content
  const editUserMessage = useCallback((messageId: string) => {
    if (!activeChat || chatState !== 'idle') return;
    const msgIndex = activeChat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const msg = activeChat.messages[msgIndex];
    if (msg.role !== 'user') return;

    // Set input to the message content
    setInputValue(msg.content);

    // Remove this message and everything after it
    const trimmedMessages = activeChat.messages.slice(0, msgIndex);
    const updatedChat = { ...activeChat, messages: trimmedMessages, updated_at: new Date().toISOString() };
    setActiveChat(updatedChat);
    setChats(prev => {
      const updated = prev.map(c => c.id === updatedChat.id ? updatedChat : c);
      saveChatsToStorage(updated);
      return updated;
    });

    inputRef.current?.focus();
  }, [activeChat, chatState]);

  const sendMessage = useCallback(async () => {
    if ((!inputValue.trim() && pendingImages.length === 0) || !activeChat || chatState !== 'idle' || !isConnected) return;
    if (inputValue.length > MAX_INPUT_CHARS) {
      setError(`Message too long. Maximum ${MAX_INPUT_CHARS} characters.`);
      return;
    }
    // Anonymous visitor out of free prompts — prompt them to sign in + top up.
    if (!isAuthenticated && anonRemaining !== null && anonRemaining <= 0) {
      setAnonModal('empty');
      return;
    }

    // If the selected tier has no workers but another tier does, offer a
    // one-tap switch instead of silently queueing into a tier nobody serves.
    const nativeCount = (networkStatsRef.current as any)?.nativeWorkers || 0;
    const browserCount = (networkStatsRef.current as any)?.browserWorkers || 0;
    const isMaxTier = selectedModel === 'native-max';
    const selectedTierHasWorkers = isMaxTier ? nativeCount > 0 : browserCount > 0;
    const otherTierCount = isMaxTier ? browserCount : nativeCount;
    if (!selectedTierHasWorkers && otherTierCount > 0) {
      setTierSwitch({ to: isMaxTier ? 'pro' : 'max', toLabel: isMaxTier ? 'Pro' : 'Max', toCount: otherTierCount });
      return;
    }
    setTierSwitch(null);

    const content = inputValue.trim() || (pendingImages.length > 0 ? 'What is in this image?' : '');
    setInputValue('');
    setError(null);
    
    // Save user message to local storage (with images if any)
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
    const userMessage = saveMessage(activeChat.id, 'user', content, undefined, images);
    setPendingImages([]);
    
    // Build messages for context (last 10 messages) — include images for vision
    const contextMessages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; images?: string[] }[] = 
      [...(activeChat.messages || []).slice(-10), userMessage].map(m => {
        const msg: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; images?: string[] } = {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
        if (m.images && m.images.length > 0) {
          msg.images = m.images;
        }
        return msg;
      });
    
    setChatState('queued');
    setStreamingContent('');
    streamBufferRef.current = '';
    if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
    thinkingStartRef.current = null;
    thinkingElapsedRef.current = null;
    setThinkingElapsed(null);
    
    try {
      // Get auth token — Privy when logged in, the anon token otherwise.
      const authToken = isAuthenticated ? await getAccessToken() : anonToken;
      if (!authToken) {
        setChatState('error');
        setError('Authentication expired. Please refresh and log in again.');
        return;
      }

      const { jobId, freeRemaining } = await submitJob({
        messages: contextMessages,
        model: selectedModel,
        authToken,
        think: selectedModel === 'native-max' ? deepThinking : false,
      });

      // Anonymous: track free prompts left and nudge when down to the last one.
      if (!isAuthenticated && typeof freeRemaining === 'number') {
        setAnonRemaining(freeRemaining);
        if (freeRemaining === 1) setAnonModal('nudge');
      }

      currentJobIdRef.current = jobId;
      setCurrentJobId(jobId);
      // prompts_sent is now tracked server-side by the orchestrator on job completion

      // Cold-start guard: if no worker picks up the job, surface an honest
      // "no workers online" state instead of spinning forever. Cleared as soon
      // as the job is assigned, streams a token, completes, or errors.
      if (queueTimeoutRef.current) clearTimeout(queueTimeoutRef.current);
      queueTimeoutRef.current = setTimeout(() => {
        // Only fail the job if it's still unassigned AND no worker for this tier
        // is online. If workers exist but are busy, leave it queued.
        const stats = networkStatsRef.current as any;
        const tierWorkers = selectedModel === 'native-max'
          ? (stats?.nativeWorkers || 0)
          : (stats?.browserWorkers || 0);
        if (currentJobIdRef.current === jobId && tierWorkers === 0) {
          currentJobIdRef.current = null;
          setCurrentJobId(null);
          setStreamingContent('');
          setChatState('error');
          setError('No workers are online to handle this request right now. Please try again in a moment.');
        }
      }, 60000);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      // Anonymous free-prompt boundaries come back as machine codes — show the
      // right sign-in popup instead of a generic error.
      if (code === 'ANON_NO_PROMPTS') {
        setChatState('idle');
        setAnonRemaining(0);
        setAnonModal('empty');
      } else if (code === 'ANON_CAP_IP' || code === 'ANON_CAP_GLOBAL') {
        setChatState('idle');
        setAnonModal('softlogin');
      } else {
        console.error('Error submitting job:', err);
        setChatState('error');
        setError('Failed to submit job. Please try again.');
      }
    }

    setTimeout(scrollToBottom, 100);
  }, [inputValue, activeChat, chatState, isConnected, submitJob, saveMessage, scrollToBottom, getAccessToken, selectedModel, deepThinking, isAuthenticated, anonToken]);

  // Handle job token (streaming) — decrypt E2E + safety scan
  useEffect(() => {
    const STOP_TOKENS = ['<|im_end|>', '<|im_end', '<|im_start|>', '<|endoftext|>'];
    
    setOnJobToken(async (jobId, token) => {
      if (jobId === currentJobIdRef.current) {
        if (queueTimeoutRef.current) { clearTimeout(queueTimeoutRef.current); queueTimeoutRef.current = null; }
        setChatState('streaming');
        setIsSearching(false);
        
        let cleanToken = token;
        // Filter stop tokens
        for (const stopToken of STOP_TOKENS) {
          cleanToken = cleanToken.replace(stopToken, '');
        }
        if (cleanToken) {
          // Track thinking time outside state updater
          if (cleanToken.includes('<think>') && !thinkingStartRef.current) {
            thinkingStartRef.current = Date.now();
            setThinkingElapsed(null);
          }
          if (cleanToken.includes('</think>') && thinkingStartRef.current) {
            const elapsed = Math.round((Date.now() - thinkingStartRef.current) / 1000);
            thinkingElapsedRef.current = elapsed;
            setThinkingElapsed(elapsed);
            thinkingStartRef.current = null;
          }
          // Accumulate into the buffer and flush to state at most every
          // STREAM_FLUSH_MS — caps the expensive markdown/KaTeX re-render rate.
          streamBufferRef.current += cleanToken;
          if (!streamFlushRef.current) {
            streamFlushRef.current = setTimeout(flushStream, STREAM_FLUSH_MS);
          }
        }
      }
    });

    return () => {
      setOnJobToken(null);
      if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
    };
  }, [setOnJobToken, flushStream]);

  // Handle job assigned
  useEffect(() => {
    setOnJobAssigned(async (jobId, _workerId) => {
      if (jobId === currentJobIdRef.current) {
        if (queueTimeoutRef.current) { clearTimeout(queueTimeoutRef.current); queueTimeoutRef.current = null; }
        setChatState('streaming');
      }
    });
    return () => setOnJobAssigned(null);
  }, [setOnJobAssigned]);

  // Handle job complete — use accumulated streaming content (already decrypted)
  useEffect(() => {
    setOnJobComplete((jobId, _response) => {
      if (jobId === currentJobIdRef.current && activeChat) {
        
        // Finalize from the stream buffer (the authoritative full text), in case
        // the last throttled flush hasn't landed yet.
        if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
        let finalContent = streamBufferRef.current.trim();
        if (!finalContent) {
          // Fallback: if no streaming content, we might not have received tokens
          finalContent = '[No response received]';
        }
        finalContent = filterDisclaimers(finalContent);

        // Final safety check
        if (!scanOutput(finalContent).safe) {
          finalContent = BLOCKED_MESSAGE;
        }

        // Embed thinking time so it persists
        if (thinkingElapsedRef.current !== null && finalContent.includes('</think>')) {
          finalContent = finalContent.replace('</think>', `</think><!--think_time:${thinkingElapsedRef.current}-->`);
        }
        // Append sources to content so they persist in storage
        const sources = pendingSourcesRef.current;
        if (sources.length > 0) {
          finalContent += `\n---SOURCES---${JSON.stringify(sources)}`;
        }
        saveMessage(activeChat.id, 'assistant', finalContent, jobId);
        streamBufferRef.current = '';
        setStreamingContent('');

        if (queueTimeoutRef.current) { clearTimeout(queueTimeoutRef.current); queueTimeoutRef.current = null; }
        setChatState('idle');
        currentJobIdRef.current = null;
        setCurrentJobId(null);
        setPendingSources([]);
        refreshCredits();

        autoScrollIfPinned();
      }
    });

    return () => setOnJobComplete(null);
  }, [activeChat, setOnJobComplete, saveMessage, autoScrollIfPinned, refreshCredits]);

  // Handle job:searching — show search indicator
  useEffect(() => {
    setOnJobSearching((_jobId: string) => {
      setIsSearching(true);
      // Auto-hide after 10s as safety net
      setTimeout(() => setIsSearching(false), 10000);
    });
    return () => setOnJobSearching(null);
  }, [setOnJobSearching]);

  // Handle job:sources — store sources for the current response
  useEffect(() => {
    setOnJobSources((_jobId: string, sources: { title: string; url: string; description: string }[]) => {
      pendingSourcesRef.current = sources;
      setPendingSources(sources);
    });
    return () => setOnJobSources(null);
  }, [setOnJobSources]);

  // Handle job error
  useEffect(() => {
    setOnJobError((jobId, errorMsg) => {
      // Use ref for immediate access
      if (jobId === currentJobIdRef.current) {
        if (queueTimeoutRef.current) { clearTimeout(queueTimeoutRef.current); queueTimeoutRef.current = null; }
        setIsSearching(false);
        setChatState('error');
        setError(errorMsg);
        setStreamingContent('');
        streamBufferRef.current = '';
        if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
        // Clear ref immediately
        currentJobIdRef.current = null;
        setCurrentJobId(null);
        // Show inline error with link for insufficient credits
        if (errorMsg && errorMsg.includes('Insufficient credits')) {
          setError('Not enough credits. Top up in Settings.');
        }
      }
    });
    
    return () => setOnJobError(null);
  }, [setOnJobError]);

  // Load chats from localStorage on mount
  useEffect(() => {
      fetchChats();
  }, [fetchChats]);

  // Handle pending prompt from homepage
  useEffect(() => {
    // Only process once, when everything is ready
    if (
      pendingPromptProcessed ||
      !isConnected ||
      loadingChats ||
      (!isAuthenticated && !anonToken) ||
      authLoading
    ) {
      return;
    }
    
    const pendingPrompt = localStorage.getItem(PENDING_PROMPT_KEY);
    if (!pendingPrompt) {
      setPendingPromptProcessed(true);
      return;
    }
    
    // Clear the pending prompt immediately to prevent re-processing
    localStorage.removeItem(PENDING_PROMPT_KEY);
    setPendingPromptProcessed(true);
    
    // Create a new chat with the pending prompt
    const now = new Date().toISOString();
    const newChat: ChatWithMessages = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      privy_id: user?.id || 'local',
      title: pendingPrompt.length > 50 ? pendingPrompt.substring(0, 47) + '...' : pendingPrompt,
      created_at: now,
      updated_at: now,
      messages: [],
    };
    
    // Add the new chat to storage and state
    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    saveChatsToStorage(updatedChats);
    setActiveChat(newChat);
    
    // Set the input value and trigger send after a short delay
    setInputValue(pendingPrompt);
    
    // Use a timeout to ensure state has settled before sending
    setTimeout(() => {
      // We need to manually trigger the send since inputValue won't be updated yet in sendMessage's closure
      // Instead, we'll directly call the send logic here
      if (pendingPrompt.length > MAX_INPUT_CHARS) {
        setError(`Message too long. Maximum ${MAX_INPUT_CHARS} characters.`);
        return;
      }
      
      // Save user message
      const message: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        chat_id: newChat.id,
        role: 'user',
        content: pendingPrompt,
        job_id: null,
        created_at: new Date().toISOString(),
      };
      
      // Update chat with the message
      const chatWithMessage: ChatWithMessages = {
        ...newChat,
        messages: [message],
        updated_at: new Date().toISOString(),
      };
      
      const chatsWithMessage = [chatWithMessage, ...chats];
      setChats(chatsWithMessage);
      saveChatsToStorage(chatsWithMessage);
      setActiveChat(chatWithMessage);
      
      // Clear input and submit job
      setInputValue('');
      setChatState('queued');
      setStreamingContent('');
      streamBufferRef.current = '';
      if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }

      // Get auth token for submission — Privy when logged in, anon token otherwise
      (async () => {
        const authToken = isAuthenticated ? await getAccessToken() : anonToken;
        if (!authToken) {
          setChatState('error');
          setError('Authentication required. Please log in.');
          return;
        }
        try {
          const { jobId, freeRemaining } = await submitJob({
            messages: [{ role: 'user', content: pendingPrompt }],
            model: selectedModel,
            authToken,
            think: selectedModel === 'native-max' ? deepThinking : false,
          });
          if (!isAuthenticated && typeof freeRemaining === 'number') {
            setAnonRemaining(freeRemaining);
            if (freeRemaining === 1) setAnonModal('nudge');
          }
          currentJobIdRef.current = jobId;
          setCurrentJobId(jobId);
        } catch (err) {
          const code = err instanceof Error ? err.message : '';
          if (code === 'ANON_NO_PROMPTS') {
            setChatState('idle'); setAnonRemaining(0); setAnonModal('empty');
          } else if (code === 'ANON_CAP_IP' || code === 'ANON_CAP_GLOBAL') {
            setChatState('idle'); setAnonModal('softlogin');
          } else {
            console.error('Error submitting pending prompt job:', err);
            setChatState('error');
            setError('Failed to submit job. Please try again.');
          }
        }
      })();
    }, 100);
  }, [
    pendingPromptProcessed,
    isConnected,
    loadingChats,
    isAuthenticated,
    authLoading,
    anonToken,
    user?.id,
    chats,
    submitJob,
    getAccessToken,
    selectedModel,
    deepThinking,
  ]);

  // Auto-focus input when chat is selected or created
  useEffect(() => {
    if (activeChat) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [activeChat]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement === inputRef.current) {
        e.preventDefault();
        sendMessage();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sendMessage]);

  // Not logged in: let anonymous visitors through to the chat on their free
  // prompts (anonToken present). Only show the sign-in screen when an anon
  // session couldn't be created (daily free budget reached).
  if (!authLoading && !isAuthenticated && !anonToken) {
    if (anonLoading) {
      return (
        <div className="h-screen bg-black flex items-center justify-center">
          <div className="pixel-sans text-white/50 text-sm">Loading…</div>
        </div>
      );
    }
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center border border-white/10 bg-white/[0.02] rounded-2xl p-8 max-w-md mx-4">
          <div className="pixel-serif text-white text-4xl mb-4">🔒</div>
          <h1 className="pixel-serif text-white text-2xl mb-3">Sign in to c0mpute</h1>
          <p className="pixel-sans text-white/70 text-sm mb-6">
            Sign in with your X account to start chatting. Free prompts included — no card or crypto needed.
          </p>
          <button
            onClick={() => login()}
            className="cursor-pointer pixel-serif text-sm px-8 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
          >
            Sign in with X
          </button>
          <div className="mt-4">
            <a href="/" className="cursor-pointer pixel-sans text-white/60 text-xs hover:text-white/50 transition-colors">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Format date for chat list
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-screen bg-black flex flex-col">
      {showOnboarding && (
        <OnboardingModal
          freePromptLimit={freePromptLimit}
          onClose={dismissOnboarding}
          onUseAI={() => { dismissOnboarding(); createNewChat(); }}
          onChooseWorker={() => { dismissOnboarding(); router.push('/worker'); }}
        />
      )}
      {anonModal && (
        <AnonGateModal
          mode={anonModal}
          freePromptLimit={ANON_FREE_LIMIT}
          onClose={() => setAnonModal(null)}
          onSignIn={() => {
            // 0-left flow lands the user on the top-up page after signing in.
            if (anonModal === 'empty') sessionStorage.setItem('c0mpute_post_login_topup', '1');
            setAnonModal(null);
            login();
          }}
        />
      )}
      {/* Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-sm z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/5 transition-colors md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg font-bold flex items-center">
              C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
            </a>
          </div>
          
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                {/* Free prompts left — shown while the onboarding allowance lasts */}
                {freePromptsRemaining > 0 && (
                  <button
                    onClick={() => router.push('/settings#usage')}
                    className="pixel-sans text-xs px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-400/80 hover:bg-green-500/[0.08] transition-colors cursor-pointer"
                  >
                    {freePromptsRemaining} free {freePromptsRemaining === 1 ? 'prompt' : 'prompts'} left
                  </button>
                )}
                {/* Staker inference allowance — free credits from staked $ZERO, drawn before paid credits */}
                {stakeAllowanceLeft > 0 && (
                  <button
                    onClick={() => router.push('/staking')}
                    title="Free daily inference from your staked $ZERO — used before your paid credits. Refreshes 00:00 UTC."
                    className="pixel-sans text-xs px-3 py-2 rounded-lg border border-[#80a0c1]/30 bg-[#80a0c1]/[0.06] text-[#80a0c1] hover:bg-[#80a0c1]/[0.1] transition-colors cursor-pointer"
                  >
                    {stakeAllowanceLeft.toFixed(0)} free credits today
                  </button>
                )}
                {/* Credit balance — always visible */}
                <button
                  onClick={() => router.push('/settings#usage')}
                  className={`cursor-pointer pixel-sans text-xs px-3 py-2 rounded-lg border transition-colors ${
                    creditBalance === 0
                      ? 'border-red-500/20 bg-red-500/[0.04] text-red-400/70'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
                  }`}
                >
                  {creditBalance.toFixed(0)} credits
                </button>
              </>
            ) : (
              <>
                {/* Anonymous visitor: free prompts left + a sign-in CTA */}
                {anonRemaining !== null && (
                  <span className="pixel-sans text-xs px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-400/80">
                    {anonRemaining} free {anonRemaining === 1 ? 'prompt' : 'prompts'} left
                  </span>
                )}
                <button
                  onClick={() => login()}
                  className="cursor-pointer pixel-serif text-xs px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
                >
                  Sign in
                </button>
              </>
            )}

            <button
              onClick={() => router.push('/')}
              className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} border-r border-white/10 bg-black/50 flex flex-col transition-all duration-300 overflow-hidden`}>
          {/* New Chat Button */}
          <div className="py-2">
            <button
              onClick={createNewChat}
              className="w-full pixel-serif py-3 mx-2 px-3 border border-white/20 rounded-xl text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              style={{ width: 'calc(100% - 16px)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Chat
            </button>
          </div>
          
          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <div className="p-4 text-center">
                <span className="pixel-sans text-white/60 text-sm">Loading...</span>
              </div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center">
                <span className="pixel-sans text-white/60 text-sm">No chats yet</span>
              </div>
            ) : (
              <div className="py-2">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group px-3 py-3 mx-2 mb-1 cursor-pointer transition-colors rounded-lg ${
                      activeChat?.id === chat.id 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white/[0.02] hover:bg-white/10 border border-transparent'
                    }`}
                    onClick={() => editingChatId !== chat.id && fetchChat(chat.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {editingChatId === chat.id ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameChat(chat.id, editingTitle);
                              if (e.key === 'Escape') { setEditingChatId(null); setEditingTitle(''); }
                            }}
                            onBlur={() => renameChat(chat.id, editingTitle)}
                            autoFocus
                            className="w-full bg-black/50 border border-white/20 rounded-md px-2 py-1 pixel-sans text-white text-sm focus:outline-none focus:border-white/40"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <p className="pixel-sans text-white text-sm truncate">{chat.title}</p>
                        )}
                        <p className="pixel-sans text-white/70 text-xs mt-1">{formatDate(chat.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Edit button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChatId(chat.id);
                            setEditingTitle(chat.title);
                          }}
                          className="p-1.5 cursor-pointer transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50 hover:text-[#80a0c1]">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteChat(chat.id);
                          }}
                          className="p-1.5 cursor-pointer transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50 hover:text-red-400">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Network Stats */}
          <div className="p-4 border-t border-white/5 bg-white/[0.02]">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="pixel-serif text-white text-xl">{networkStats?.workersOnline || 0}</div>
                <div className="pixel-sans text-white/70 text-xs">Workers</div>
              </div>
              <div>
                <div className="pixel-serif text-white text-xl">{networkStats?.jobsInQueue || 0}</div>
                <div className="pixel-sans text-white/70 text-xs">In Queue</div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-white/5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-white/30'}`} />
              <span className={`pixel-sans text-xs ${isConnected ? 'text-green-400/70' : 'text-white/60'}`}>
                {isConnected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {!activeChat ? (
            // Empty state
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="pixel-serif text-white/60 text-7xl mb-6">?</div>
                <p className="pixel-sans text-white/60 text-base mb-6">Select a chat or start a new one</p>
                <button
                  onClick={createNewChat}
                  className="cursor-pointer pixel-serif px-8 py-3 bg-white/[0.08] border border-white/15 text-white rounded-xl hover:bg-white/[0.12] transition-colors"
                >
                  New Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto py-4"
                onClick={() => inputRef.current?.focus()}
              >
              <div className="max-w-3xl mx-auto px-4 space-y-5">
                {activeChat.messages.length === 0 && chatState === 'idle' && (
                  <div className="flex items-center justify-center h-full">
                    <p className="pixel-sans text-white/60 text-base">Send a message to start the conversation</p>
                  </div>
                )}
                
                {activeChat.messages.map((message) => {
                  const { cleanContent: rawContent, sources } = message.role === 'assistant' 
                    ? parseSourcesFromContent(message.content) 
                    : { cleanContent: message.content, sources: [] };
                  const { thinking, response: cleanContent, thinkSeconds } = message.role === 'assistant'
                    ? parseThinking(rawContent)
                    : { thinking: null, response: rawContent, thinkSeconds: null };
                  return (
                    <div
                      key={message.id}
                      className={`group/msg flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`${
                          message.role === 'user'
                            ? 'max-w-[85%] px-4 py-2.5 bg-white/[0.11] rounded-2xl border border-white/[0.10]'
                            : 'w-full px-4 py-3 bg-white/[0.05] rounded-2xl border border-white/[0.12]'
                        }`}
                      >
                        {/* Display images if present */}
                        {message.images && message.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {message.images.map((img, imgIdx) => (
                              <img key={imgIdx} src={`data:image/jpeg;base64,${img}`} alt="Uploaded" className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
                            ))}
                          </div>
                        )}
                        <SourceStrip sources={sources} content={cleanContent} />
                        <div className="chat-answer pixel-sans text-white/90 text-base leading-[1.75] prose prose-invert prose-base max-w-none prose-p:my-3 prose-li:my-1 prose-ol:my-3 prose-ul:my-3 prose-headings:mt-5 prose-headings:mb-2 prose-headings:text-white prose-headings:font-semibold prose-strong:text-white prose-strong:font-extrabold prose-code:text-white/80 prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-hr:my-5 prose-hr:border-white/10 [&_br]:block [&_br]:content-[''] [&_br]:mt-2.5">
                          <Markdown options={buildMarkdownOverrides(sources)}>{mathToTags(cleanContent)}</Markdown>
                        </div>
                        {thinking && <ThinkingDropdown thinking={thinking} elapsedSeconds={thinkSeconds ?? undefined} />}
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyMessage(message.id, message.role === 'assistant' ? cleanContent : message.content)}
                          className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                          title="Copy"
                        >
                          {copiedId === message.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><path d="M20 6L9 17l-5-5"/></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60 hover:text-white/60"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          )}
                        </button>
                        {message.role === 'user' && chatState === 'idle' && (
                          <button
                            onClick={() => editUserMessage(message.id)}
                            className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                            title="Edit"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60 hover:text-white/60"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {/* Streaming message */}
                {streamingContent && (() => {
                  const { thinking: streamThinking, response: streamResponse } = parseThinking(filterDisclaimers(streamingContent));
                  const isStillThinking = streamThinking !== null && !streamResponse;
                  return (
                    <div className="flex justify-start">
                      <div className="w-full px-4 py-3 bg-white/[0.05] rounded-2xl border border-white/[0.12]">
                        <SourceStrip sources={pendingSources} />
                        {streamResponse && (
                          <div className="chat-answer pixel-sans text-white/90 text-base leading-[1.75] prose prose-invert prose-base max-w-none prose-p:my-3 prose-li:my-1 prose-ol:my-3 prose-ul:my-3 prose-headings:mt-5 prose-headings:mb-2 prose-headings:text-white prose-headings:font-semibold prose-strong:text-white prose-strong:font-extrabold prose-code:text-white/80 prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-hr:my-5 prose-hr:border-white/10 [&_br]:block [&_br]:content-[''] [&_br]:mt-2.5">
                            <Markdown options={buildMarkdownOverrides(pendingSources)}>{mathToTags(streamResponse)}</Markdown>
                            <span className="inline-block w-2 h-5 bg-white/50 ml-1 animate-pulse" />
                          </div>
                        )}
                        {streamThinking && <ThinkingDropdown thinking={streamThinking} isStreaming={isStillThinking} elapsedSeconds={thinkingElapsed ?? undefined} />}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Search indicator */}
                {isSearching && (
                  <div className="flex justify-center">
                    <div className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg">
                      <p className="pixel-sans text-white/70 text-sm">
                        Searching the web...
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Queue position indicator with estimated wait time */}
                {chatState === 'queued' && queuePosition !== null && queuePosition > 0 && (
                  <div className="flex justify-center">
                    <div className="px-5 py-3 bg-[#80a0c1]/10 border border-[#80a0c1]/20 rounded-lg">
                      <p className="pixel-sans text-[#80a0c1] text-sm">
                        You are #{queuePosition} in queue
                        {(() => {
                          const waitSec = networkStats?.avgJobDurationMs ? Math.ceil((queuePosition * networkStats.avgJobDurationMs) / 1000) : 0;
                          return waitSec > 0 ? (
                            <span className="text-[#80a0c1]/70 ml-2">· ~{waitSec}s wait</span>
                          ) : null;
                        })()}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Processing indicator */}
                {chatState === 'streaming' && !streamingContent && (
                  <div className="flex justify-start">
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Error message */}
                {error && (
                  <div className="flex justify-center">
                    <div className="px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="pixel-sans text-red-400 text-sm">
                        {error.includes('Top up in Settings') ? (
                          <>Not enough credits. Top up in <a href="/settings#usage" className="cursor-pointer underline hover:text-red-300">Settings</a>.</>
                        ) : error}
                      </p>
                      <button
                        onClick={() => {
                          setError(null);
                          setChatState('idle');
                        }}
                        className="pixel-sans text-red-400/70 text-sm underline mt-1"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* No workers for this tier, but another tier is online → offer switch */}
                {tierSwitch && (
                  <div className="flex justify-center">
                    <div className="px-5 py-3 bg-[#80a0c1]/10 border border-[#80a0c1]/20 rounded-lg text-center">
                      <p className="pixel-sans text-[#80a0c1] text-sm mb-2">
                        No workers online for {selectedPlan === 'max' ? 'Max' : 'Pro'} right now. {tierSwitch.toCount} {tierSwitch.toCount === 1 ? 'worker' : 'workers'} online for {tierSwitch.toLabel}.
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => { savePlan(tierSwitch.to); setTierSwitch(null); }}
                          className="cursor-pointer pixel-serif text-black bg-[#80a0c1] hover:bg-[#80a0c1]/90 text-sm px-4 py-1.5 rounded-lg"
                        >
                          Switch to {tierSwitch.toLabel}
                        </button>
                        <button
                          onClick={() => setTierSwitch(null)}
                          className="cursor-pointer pixel-sans text-[#80a0c1]/70 text-sm underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-white/10 p-4">
                <div className="max-w-4xl mx-auto">
                  {(() => {
                    const nativeCount = (networkStats as any)?.nativeWorkers || 0;
                    const browserCount = (networkStats as any)?.browserWorkers || 0;
                    const hasWorkers = selectedModel === 'native-max' ? nativeCount > 0 : browserCount > 0;
                    const otherCount = selectedModel === 'native-max' ? browserCount : nativeCount;
                    // Only promise queueing when NO tier can serve. If another tier is
                    // online, sending shows a one-tap switch prompt instead of queueing.
                    if (!hasWorkers && otherCount === 0 && isConnected) {
                      return (
                        <div className="pixel-sans text-white/70 text-xs text-center mb-2">
                          No {selectedModel === 'native-max' ? 'native' : 'browser'} workers are online — your message will queue until one connects
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* Image preview */}
                  {pendingImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {pendingImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={`data:image/jpeg;base64,${img}`} alt="Upload preview" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                          <button
                            onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Model picker + options — composer bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative" ref={modelMenuRef}>
                      <button
                        onClick={() => setModelMenuOpen(o => !o)}
                        className="cursor-pointer flex items-center gap-2 pixel-sans text-xs px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] transition-colors"
                      >
                        <span className="text-white/90">{selectedPlanObj.name}</span>
                        <span className="text-white/60">{selectedPlanObj.cost > 0 ? `${selectedPlanObj.cost} cr/msg` : 'Free'}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                      {modelMenuOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-60 bg-[#0a0a0a] border border-white/10 rounded-xl p-1 z-50 shadow-xl">
                          {PLANS.map((plan) => {
                            const isSel = plan.id === selectedPlan;
                            return (
                              <button
                                key={plan.id}
                                onClick={() => savePlan(plan.id)}
                                className={`cursor-pointer w-full text-left px-3 py-2.5 rounded-lg transition-colors ${isSel ? 'bg-[#80a0c1]/15' : 'hover:bg-white/5'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`pixel-sans text-sm ${isSel ? 'text-[#80a0c1]' : 'text-white/80'}`}>{plan.name}</span>
                                  <span className={`pixel-sans text-xs ${isSel ? 'text-[#80a0c1]/60' : 'text-white/60'}`}>{plan.cost > 0 ? `${plan.cost} cr/msg` : 'Free'}</span>
                                </div>
                                <div className="pixel-sans text-white/60 text-xs mt-0.5">{plan.description}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {selectedPlan === 'max' && (
                      <button
                        onClick={() => setDeepThinking(v => !v)}
                        className={`cursor-pointer flex items-center gap-2 pixel-sans text-xs px-3 py-2 rounded-lg border transition-colors ${deepThinking ? 'border-[#80a0c1]/40 bg-[#80a0c1]/15 text-[#80a0c1]' : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'}`}
                        title="Deep thinking: the model reasons step-by-step before answering. Slower, costs 20 cr/msg."
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" /><path d="M9 21h6" /></svg>
                        Deep thinking
                        <span className="text-[10px]">{deepThinking ? 'ON · 20 cr' : 'OFF'}</span>
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {/* Hidden file input for image uploads — only mounted on Max tier */}
                    {selectedPlan === 'max' && (
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (!files) return;
                          Array.from(files).slice(0, 4 - pendingImages.length).forEach(file => {
                            const reader = new FileReader();
                            reader.onload = () => {
                              const base64 = (reader.result as string).split(',')[1];
                              if (base64) {
                                setPendingImages(prev => prev.length < 4 ? [...prev, base64] : prev);
                              }
                            };
                            reader.readAsDataURL(file);
                          });
                          e.target.value = '';
                        }}
                      />
                    )}
                    <div className="flex-1 relative">
                      {/* Image upload icon — inline left, only on Max tier */}
                      {selectedPlan === 'max' && (
                        <button
                          onClick={() => imageInputRef.current?.click()}
                          disabled={chatState !== 'idle' || !isConnected || pendingImages.length >= 4}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white/80 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Upload image (Max tier)"
                          aria-label="Upload image"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        </button>
                      )}
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                          if (e.target.value.length <= MAX_INPUT_CHARS) {
                            setInputValue(e.target.value);
                          }
                        }}
                        placeholder={isConnected ? (pendingImages.length > 0 ? "Describe the image..." : "Type your message...") : "Connecting to network..."}
                        disabled={chatState !== 'idle' || !isConnected}
                        className={`w-full bg-white/[0.02] border border-white/10 rounded-xl ${selectedPlan === 'max' ? 'pl-12' : 'pl-5'} pr-5 py-4 pixel-sans text-white text-base placeholder:text-white/45 focus:outline-none focus:border-white/30 disabled:opacity-50`}
                      />
                      {/* Character counter */}
                      <span className={`absolute top-1/2 -translate-y-1/2 right-4 pixel-sans text-xs ${
                        inputValue.length > MAX_INPUT_CHARS * 0.9 
                          ? 'text-red-400' 
                          : inputValue.length > MAX_INPUT_CHARS * 0.75 
                            ? 'text-[#80a0c1]' 
                            : 'text-white/60'
                      }`}>
                        {inputValue.length}/{MAX_INPUT_CHARS}
                      </span>
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={(!inputValue.trim() && pendingImages.length === 0) || inputValue.length > MAX_INPUT_CHARS || chatState !== 'idle' || !isConnected}
                      className="bg-black border border-white/10 rounded-xl px-5 flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Send"
                    >
                      <img src="/PixelSendIcon.png" alt="Send" width={24} height={24} />
                    </button>
                  </div>
                  <p className="pixel-sans text-white/55 text-sm mt-2 text-center">
                    Press Enter to send
                  </p>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
