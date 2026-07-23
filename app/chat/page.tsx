'use client';

// Chat page orchestrator. All state, effects, socket handlers, and API calls
// live here; presentation is composed from app/chat/components/. Pure text
// helpers and the plan catalog live in app/chat/lib.ts.

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import 'katex/dist/katex.min.css';
import { useSocket } from '@/hooks/useSocket';
import { ChatWithMessages, Message } from '@/lib/types';
import { MAX_INPUT_CHARS } from '@/lib/orchestrator/types';
import { scanOutput, BLOCKED_MESSAGE } from '@/lib/safety';
import OnboardingModal from '@/components/OnboardingModal';
import AnonGateModal from '@/components/AnonGateModal';
import {
  ANON_FREE_LIMIT, ANON_TOKEN_KEY, PENDING_PROMPT_KEY,
  ChatState, PLANS, PlanId, SourceRef,
  filterDisclaimers, loadChatsFromStorage, planWorkerCount, saveChatsToStorage,
} from './lib';
import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import MessageList from './components/MessageList';
import Composer from './components/Composer';

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
    setOnJobToken,
    setOnJobComplete,
    setOnJobError,
    setOnJobAssigned,
    setOnJobSearching,
    setOnJobSources,
    setOnJobGeneratingImage,
    setOnJobImage,
    setOnJobImageError,
  } = useSocket(isAuthenticated ? socketAuthToken : anonToken);

  // Chat state - full chats with messages stored locally
  const [chats, setChats] = useState<ChatWithMessages[]>([]);
  const chatsRef = useRef<ChatWithMessages[]>([]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  const [activeChat, setActiveChat] = useState<ChatWithMessages | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [streamingContent, setStreamingContent] = useState('');
  const [, setCurrentJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thinkingStartRef = useRef<number | null>(null);
  const thinkingElapsedRef = useRef<number | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState<number | null>(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Mobile: start with the sidebar closed (it overlays the chat there).
  // Runs once after mount so SSR/desktop hydration stays untouched.
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);
  const [inputValue, setInputValue] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('max');
  const [deepThinking, setDeepThinking] = useState(false);
  const [tierSwitch, setTierSwitch] = useState<{ to: PlanId; toLabel: string; toCount: number } | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingPromptProcessed, setPendingPromptProcessed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingSources, setPendingSources] = useState<SourceRef[]>([]);
  const pendingSourcesRef = useRef<SourceRef[]>([]);
  useEffect(() => { pendingSourcesRef.current = pendingSources; }, [pendingSources]);
  // Images produced by the generate_image tool during the current response
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  // True between job:generating_image and the image landing. The render is async
  // now, so the model's text turn (job:complete) finishes BEFORE the image — this
  // keeps the "generating image..." skeleton up until job:image / job:image_error.
  const awaitingImageRef = useRef(false);
  const [pendingGenImages, setPendingGenImages] = useState<string[]>([]);
  const pendingGenImagesRef = useRef<string[]>([]);
  useEffect(() => { pendingGenImagesRef.current = pendingGenImages; }, [pendingGenImages]);

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
  const savePlan = (plan: PlanId) => {
    setSelectedPlan(plan);
    const planObj = PLANS.find(p => p.id === plan);
    if (!planObj?.thinking) setDeepThinking(false);
    if (!planObj?.vision) setPendingImages([]);
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

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Explicit jump to bottom (send, switch chat) — also re-pins auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    stickToBottomRef.current = true;
    setShowScrollDown(false);
  }, []);

  // Track whether the user has scrolled up; if so, stop yanking them down.
  // Also drives the floating scroll-to-bottom button.
  const [showScrollDown, setShowScrollDown] = useState(false);
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottomRef.current = pinned;
    setShowScrollDown(!pinned);
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
      // Mobile: the sidebar overlays the chat — close it so the
      // conversation is visible after picking one.
      if (window.innerWidth < 768) setSidebarOpen(false);
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
    if (window.innerWidth < 768) setSidebarOpen(false);
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

  // Image attachments (vision models): read files to base64, max 4 pending
  const handleImageFiles = useCallback((files: FileList) => {
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
  }, [pendingImages.length]);

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

    // If the selected model has no workers but another model does, offer a
    // one-tap switch instead of silently queueing into a model nobody serves.
    // Per-model now: a supergemma job can't run on a qwen worker and vice versa.
    const stats = networkStatsRef.current;
    if (planWorkerCount(selectedPlanObj, stats) === 0) {
      const alt = PLANS
        .filter(p => p.id !== selectedPlan && planWorkerCount(p, stats) > 0)
        // prefer another model in the same tier (same price/quality) over a downgrade
        .sort((a, b) => (b.tier === selectedPlanObj.tier ? 1 : 0) - (a.tier === selectedPlanObj.tier ? 1 : 0)
          || planWorkerCount(b, stats) - planWorkerCount(a, stats))[0];
      if (alt) {
        setTierSwitch({ to: alt.id, toLabel: alt.name, toCount: planWorkerCount(alt, stats) });
        return;
      }
    }
    setTierSwitch(null);

    const content = inputValue.trim() || (pendingImages.length > 0 ? 'What is in this image?' : '');
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setError(null);

    // Save user message to local storage (with images if any)
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
    const userMessage = saveMessage(activeChat.id, 'user', content, undefined, images);
    setPendingImages([]);

    // Build messages for context (last 10 messages) — include images only for
    // vision models. Text-only models (e.g. supergemma) reject any multimodal
    // data, so strip images from history when the selected model has no vision.
    // Only USER-uploaded images are valid model input; generated images live on
    // assistant messages and are display-only output — feeding them back is
    // useless and crashes text-only workers ("image input not supported").
    const contextMessages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; images?: string[] }[] =
      [...(activeChat.messages || []).slice(-10), userMessage].map(m => {
        const msg: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; images?: string[] } = {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
        if (selectedPlanObj.vision && m.role === 'user' && m.images && m.images.length > 0) {
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
    setPendingGenImages([]);
    pendingGenImagesRef.current = [];
    awaitingImageRef.current = false;
    setIsGeneratingImage(false);

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
        think: selectedPlanObj.thinking ? deepThinking : false,
      });

      // Anonymous: track free prompts left and nudge when down to the last one.
      if (!isAuthenticated && typeof freeRemaining === 'number') {
        setAnonRemaining(freeRemaining);
        if (freeRemaining === 1) setAnonModal('nudge');
      }

      currentJobIdRef.current = jobId;
      setCurrentJobId(jobId);
      // prompts_sent is tracked server-side by the orchestrator on job completion

      // Cold-start guard: if no worker picks up the job, surface an honest
      // "no workers online" state instead of spinning forever. Cleared as soon
      // as the job is assigned, streams a token, completes, or errors.
      if (queueTimeoutRef.current) clearTimeout(queueTimeoutRef.current);
      queueTimeoutRef.current = setTimeout(() => {
        // Only fail the job if it's still unassigned AND no worker for this tier
        // is online. If workers exist but are busy, leave it queued.
        const stats = networkStatsRef.current;
        const tierWorkers = planWorkerCount(selectedPlanObj, stats);
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
      } else if (code === 'ANON_CAP_IP' || code === 'ANON_CAP_GLOBAL' || code === 'ANON_CAP_HOURLY') {
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

  // Handle job token (streaming) — accumulate, throttle-flush, safety scan
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

  // Handle job complete — use accumulated streaming content
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
        const genImages = pendingGenImagesRef.current;
        saveMessage(activeChat.id, 'assistant', finalContent, jobId, genImages.length > 0 ? genImages : undefined);
        streamBufferRef.current = '';
        setStreamingContent('');

        if (queueTimeoutRef.current) { clearTimeout(queueTimeoutRef.current); queueTimeoutRef.current = null; }
        setChatState('idle');
        currentJobIdRef.current = null;
        setCurrentJobId(null);
        setPendingSources([]);
        setPendingGenImages([]);
        pendingGenImagesRef.current = [];
        // Keep the "generating image..." skeleton up if the async render is still
        // in flight (model text finishes before the image lands); job:image /
        // job:image_error clears it.
        if (!awaitingImageRef.current) setIsGeneratingImage(false);
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
    setOnJobSources((_jobId: string, sources: SourceRef[]) => {
      pendingSourcesRef.current = sources;
      setPendingSources(sources);
    });
    return () => setOnJobSources(null);
  }, [setOnJobSources]);

  // Handle generate_image tool: progress indicator + the rendered images
  useEffect(() => {
    setOnJobGeneratingImage((_jobId: string) => {
      setIsGeneratingImage(true);
      awaitingImageRef.current = true;
      // Safety net: never leave the skeleton stuck past the orchestrator's 180s
      // render ceiling if the image/error event is somehow missed.
      setTimeout(() => { awaitingImageRef.current = false; setIsGeneratingImage(false); }, 200000);
    });
    return () => setOnJobGeneratingImage(null);
  }, [setOnJobGeneratingImage]);

  useEffect(() => {
    setOnJobImage((jobId: string, images: string[]) => {
      awaitingImageRef.current = false;
      setIsGeneratingImage(false);
      // The render is async now, so the image can arrive AFTER the model's text
      // turn already saved its assistant message. If that message exists, attach
      // the image to it retroactively (and persist); otherwise buffer it for the
      // job:complete handler to attach.
      const exists = (chatsRef.current || []).some(c =>
        c.messages.some(m => m.role === 'assistant' && m.job_id === jobId));
      if (exists) {
        setChats(prevChats => {
          const updatedChats = prevChats.map(chat => {
            const idx = chat.messages.findIndex(m => m.role === 'assistant' && m.job_id === jobId);
            if (idx === -1) return chat;
            const msgs = [...chat.messages];
            msgs[idx] = { ...msgs[idx], images: [...(msgs[idx].images || []), ...images] };
            const updatedChat = { ...chat, messages: msgs };
            setActiveChat(prev => prev?.id === chat.id ? updatedChat : prev);
            return updatedChat;
          });
          saveChatsToStorage(updatedChats);
          return updatedChats;
        });
      } else {
        setPendingGenImages(prev => {
          const next = [...prev, ...images];
          pendingGenImagesRef.current = next;
          return next;
        });
      }
      autoScrollIfPinned();
    });
    return () => setOnJobImage(null);
  }, [setOnJobImage, autoScrollIfPinned]);

  // Async image render failed (after the model's turn already completed). The
  // user was refunded server-side; surface a non-fatal note and clear the
  // generating indicator without nuking the completed text response.
  useEffect(() => {
    setOnJobImageError((_jobId: string, errorMsg: string) => {
      awaitingImageRef.current = false;
      setIsGeneratingImage(false);
      setError(errorMsg || 'Image generation failed. You were refunded.');
    });
    return () => setOnJobImageError(null);
  }, [setOnJobImageError]);

  // Handle job error
  useEffect(() => {
    setOnJobError((jobId, errorMsg) => {
      // Use ref for immediate access
      if (jobId === currentJobIdRef.current) {
        if (queueTimeoutRef.current) { clearTimeout(queueTimeoutRef.current); queueTimeoutRef.current = null; }
        setIsSearching(false);
        awaitingImageRef.current = false;
        setIsGeneratingImage(false);
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
            think: selectedPlanObj.thinking ? deepThinking : false,
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
          } else if (code === 'ANON_CAP_IP' || code === 'ANON_CAP_GLOBAL' || code === 'ANON_CAP_HOURLY') {
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

  // Not logged in: let anonymous visitors through to the chat on their free
  // prompts (anonToken present). Only show the sign-in screen when an anon
  // session couldn't be created (daily free budget reached).
  if (!authLoading && !isAuthenticated && !anonToken) {
    if (anonLoading) {
      return (
        <div className="h-screen bg-black flex items-center justify-center ui-readable">
          <div className="pixel-sans text-white/50 text-sm">Loading...</div>
        </div>
      );
    }
    return (
      <div className="h-screen bg-black flex items-center justify-center ui-readable">
        <div className="text-center border border-white/10 bg-white/[0.02] rounded-2xl p-8 max-w-md mx-4">
          <h1 className="pixel-serif text-white text-3xl mb-3">Sign in to c<span>0</span>mpute</h1>
          <p className="pixel-sans text-white/60 text-sm mb-6">
            Sign in with your X account to start chatting. Your first prompts are free.
          </p>
          <button
            onClick={() => login()}
            className="cursor-pointer pixel-sans font-medium text-sm px-8 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
          >
            Sign in with X
          </button>
          <div className="mt-4">
            <Link href="/" className="cursor-pointer pixel-sans text-white/50 text-xs hover:text-white transition-colors">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black flex ui-readable chat-ui overflow-hidden">
      {showOnboarding && (
        <OnboardingModal
          freePromptLimit={freePromptLimit}
          onClose={dismissOnboarding}
          onUseAI={() => { dismissOnboarding(); createNewChat(); }}
          onChooseWorker={() => { dismissOnboarding(); router.push('/earn'); }}
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

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        chats={chats}
        activeChatId={activeChat?.id ?? null}
        loadingChats={loadingChats}
        editingChatId={editingChatId}
        editingTitle={editingTitle}
        onSelectChat={fetchChat}
        onNewChat={createNewChat}
        onDeleteChat={deleteChat}
        onStartRename={(chatId, currentTitle) => { setEditingChatId(chatId); setEditingTitle(currentTitle); }}
        onEditingTitleChange={setEditingTitle}
        onCommitRename={renameChat}
        onCancelRename={() => { setEditingChatId(null); setEditingTitle(''); }}
        networkStats={networkStats}
        isConnected={isConnected}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          activeChatTitle={activeChat && activeChat.title !== 'New Chat' ? activeChat.title : null}
          isAuthenticated={isAuthenticated}
          freePromptsRemaining={freePromptsRemaining}
          stakeAllowanceLeft={stakeAllowanceLeft}
          creditBalance={creditBalance}
          anonRemaining={anonRemaining}
          onLogin={() => login()}
          onOpenUsage={() => router.push('/settings#usage')}
          onOpenStaking={() => router.push('/staking')}
        />

        <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
          {!activeChat ? (
            // Empty state: nothing selected yet
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center max-w-md">
                <h1 className="pixel-serif text-white text-4xl mb-4">Ask the network</h1>
                <p className="pixel-sans text-white/50 text-sm leading-relaxed mb-7">
                  Your prompts run on GPUs contributed by people around the world.
                  Pick a conversation from the sidebar or open a new one.
                </p>
                <button
                  onClick={createNewChat}
                  className="cursor-pointer pixel-sans font-medium px-7 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
                >
                  New chat
                </button>
              </div>
            </div>
          ) : (
            <>
              <MessageList
                activeChat={activeChat}
                chatState={chatState}
                streamingContent={streamingContent}
                pendingSources={pendingSources}
                pendingGenImages={pendingGenImages}
                isSearching={isSearching}
                isGeneratingImage={isGeneratingImage}
                queuePosition={queuePosition}
                networkStats={networkStats}
                thinkingElapsed={thinkingElapsed}
                error={error}
                tierSwitch={tierSwitch}
                selectedPlanName={selectedPlanObj.name}
                copiedId={copiedId}
                onCopy={copyMessage}
                onEditUserMessage={editUserMessage}
                onDismissError={() => { setError(null); setChatState('idle'); }}
                onAcceptTierSwitch={() => { if (tierSwitch) { savePlan(tierSwitch.to); setTierSwitch(null); } }}
                onDismissTierSwitch={() => setTierSwitch(null)}
                containerRef={messagesContainerRef}
                endRef={messagesEndRef}
                onScroll={handleMessagesScroll}
                onBackgroundClick={() => inputRef.current?.focus()}
              />

              {/* Floating scroll-to-bottom button */}
              {showScrollDown && (
                <button
                  onClick={scrollToBottom}
                  aria-label="Scroll to bottom"
                  className="absolute bottom-36 right-5 z-10 w-9 h-9 rounded-full bg-[#141210] border border-white/15 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                </button>
              )}

              <Composer
                inputRef={inputRef}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSend={sendMessage}
                chatState={chatState}
                isConnected={isConnected}
                selectedPlan={selectedPlan}
                selectedPlanObj={selectedPlanObj}
                onSelectPlan={savePlan}
                deepThinking={deepThinking}
                onToggleDeepThinking={() => setDeepThinking(v => !v)}
                pendingImages={pendingImages}
                onRemoveImage={(idx) => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                onImageFiles={handleImageFiles}
                networkStats={networkStats}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
