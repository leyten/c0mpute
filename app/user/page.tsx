'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { useSocket } from '@/hooks/useSocket';
import { Chat, Message, ChatWithMessages } from '@/lib/types';
import { MAX_INPUT_CHARS } from '@/lib/orchestrator/types';
// E2E encryption removed for now — keeping it simple
import { scanOutput, BLOCKED_MESSAGE } from '@/lib/safety';
import { shouldSearch, extractQuery } from '@/lib/search';

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
            className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.04] border border-white/[0.08] hover:border-white/15 hover:bg-white/[0.06] transition-all rounded-md group">
            <span className="flex items-center justify-center w-3.5 h-3.5 text-[9px] font-medium bg-white/10 text-white/40 rounded-full flex-shrink-0">{i + 1}</span>
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="flex-shrink-0 opacity-50 group-hover:opacity-80" />
            <span className="pixel-sans text-white/40 text-[11px] truncate max-w-[100px] group-hover:text-white/70">{s.title || domain}</span>
          </a>
        );
      })}
    </div>
  );
}

// Build markdown components that inject citation rendering
function buildMarkdownComponents(sources: { title: string; url: string; description: string }[]): Components {
  if (sources.length === 0) return {};
  return {
    p: ({ children }) => {
      const proc = (child: React.ReactNode): React.ReactNode => typeof child === 'string' ? <CitationText text={child} sources={sources} /> : child;
      return <p>{Array.isArray(children) ? children.map((c, i) => <span key={i}>{proc(c)}</span>) : proc(children)}</p>;
    },
    li: ({ children }) => {
      const proc = (child: React.ReactNode): React.ReactNode => typeof child === 'string' ? <CitationText text={child} sources={sources} /> : child;
      return <li>{Array.isArray(children) ? children.map((c, i) => <span key={i}>{proc(c)}</span>) : proc(children)}</li>;
    },
  };
}

// Get model tier helper
function getModelTier(modelId: string): string {
  if (modelId === 'native-max') return 'max';
  if (modelId.includes('dolphin')) return 'pro';
  return 'free';
}

type ChatState = 'idle' | 'queued' | 'streaming' | 'error';

// Available models for users
const USER_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 1.5B', cost: 0, costLabel: 'Free', tier: 'standard', description: 'Fast responses' },
  { id: 'dolphin-2.6-mistral-7b-q4f16_1-MLC', name: 'Dolphin 7B', cost: 10, costLabel: '10 cr', tier: 'standard', description: 'Uncensored, higher quality' },
  { id: 'native-max', name: 'Qwen 14B', cost: 50, costLabel: '50 cr', tier: 'premium', description: 'Best quality + web search' },
];

// Local storage keys
const CHATS_STORAGE_KEY = 'c0mpute_chats';
const SELECTED_MODEL_KEY = 'c0mpute_selected_model';
const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';

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
function filterDisclaimers(text: string): string {
  const disclaimerPatterns = [
    /\n\n(?:Please note|Note:|Important:|Keep in mind|Be aware|However,|That said,|I should mention|It'?s important to|Remember that|Disclaimer:)[\s\S]*/i,
    /\n(?:Please note|Note:|Important:|Keep in mind|Be aware|However,|That said,|I should mention|It'?s important to|Remember that|Disclaimer:)[\s\S]*/i,
  ];
  
  let filtered = text;
  for (const pattern of disclaimerPatterns) {
    filtered = filtered.replace(pattern, '');
  }
  
  return filtered.trim();
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

  // Socket (waits for auth token)
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
  } = useSocket(socketAuthToken);
  
  // Chat state - now storing full chats with messages locally
  const [chats, setChats] = useState<ChatWithMessages[]>([]);
  const [activeChat, setActiveChat] = useState<ChatWithMessages | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [streamingContent, setStreamingContent] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedModel, setSelectedModel] = useState(USER_MODELS[0].id);
  const [isPremiumUser, setIsPremiumUser] = useState(false); // TODO: Check $ZERO holdings
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
  
  // Fetch credits on mount
  useEffect(() => {
    if (!isAuthenticated || !socketAuthToken) return;
    fetch('/api/credits', { headers: { Authorization: `Bearer ${socketAuthToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCreditBalance(data.balance);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, socketAuthToken]);

  // Load selected model from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SELECTED_MODEL_KEY);
      if (stored && USER_MODELS.find(m => m.id === stored)) {
        setSelectedModel(stored);
      }
    }
  }, [isPremiumUser]);
  
  // Save selected model to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_MODEL_KEY, selectedModel);
    }
  }, [selectedModel]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentJobIdRef = useRef<string | null>(null);
  // No E2E refs needed

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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
  const saveMessage = useCallback((chatId: string, role: 'user' | 'assistant', content: string, jobId?: string): Message => {
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      chat_id: chatId,
      role,
      content,
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
    if (!inputValue.trim() || !activeChat || chatState !== 'idle' || !isConnected) return;
    if (inputValue.length > MAX_INPUT_CHARS) {
      setError(`Message too long. Maximum ${MAX_INPUT_CHARS} characters.`);
      return;
    }
    
    const content = inputValue.trim();
    setInputValue('');
    setError(null);
    
    // Save user message to local storage
    const userMessage = saveMessage(activeChat.id, 'user', content);
    
    // Build messages for context (last 10 messages)
    const contextMessages = [...(activeChat.messages || []).slice(-10), userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }));
    
    setChatState('queued');
    setStreamingContent('');
    
    try {
      // Get auth token
      const authToken = await getAccessToken();
      if (!authToken) {
        setChatState('error');
        setError('Authentication expired. Please refresh and log in again.');
        return;
      }

      const jobId = await submitJob({
        messages: contextMessages,
        model: selectedModel,
        authToken,
      });
      
      currentJobIdRef.current = jobId;
      setCurrentJobId(jobId);
      // prompts_sent is now tracked server-side by the orchestrator on job completion
    } catch (err) {
      console.error('Error submitting job:', err);
      setChatState('error');
      setError('Failed to submit job. Please try again.');
    }
    
    setTimeout(scrollToBottom, 100);
  }, [inputValue, activeChat, chatState, isConnected, submitJob, saveMessage, scrollToBottom, getAccessToken, selectedModel]);

  // Handle job token (streaming) — decrypt E2E + safety scan
  useEffect(() => {
    const STOP_TOKENS = ['<|im_end|>', '<|im_end', '<|im_start|>', '<|endoftext|>'];
    
    setOnJobToken(async (jobId, token) => {
      if (jobId === currentJobIdRef.current) {
        setChatState('streaming');
        setIsSearching(false);
        
        let cleanToken = token;
        // Filter stop tokens
        for (const stopToken of STOP_TOKENS) {
          cleanToken = cleanToken.replace(stopToken, '');
        }
        if (cleanToken) {
          setStreamingContent(prev => {
            const updated = prev + cleanToken;
            // Safety scan on accumulated content
            const safety = scanOutput(updated);
            if (!safety.safe) {
              return BLOCKED_MESSAGE;
            }
            return updated;
          });
          scrollToBottom();
        }
      }
    });
    
    return () => setOnJobToken(null);
  }, [setOnJobToken, scrollToBottom]);

  // Handle job assigned
  useEffect(() => {
    setOnJobAssigned(async (jobId, _workerId) => {
      if (jobId === currentJobIdRef.current) {
        setChatState('streaming');
      }
    });
    return () => setOnJobAssigned(null);
  }, [setOnJobAssigned]);

  // Handle job complete — use accumulated streaming content (already decrypted)
  useEffect(() => {
    setOnJobComplete((jobId, _response) => {
      if (jobId === currentJobIdRef.current && activeChat) {
        
        // Use the accumulated streaming content (already decrypted and safety-scanned)
        setStreamingContent(prev => {
          let finalContent = prev.trim();
          if (!finalContent) {
            // Fallback: if no streaming content, we might not have received tokens
            finalContent = '[No response received]';
          }
          finalContent = filterDisclaimers(finalContent);
          
          // Final safety check
          const safety = scanOutput(finalContent);
          if (!safety.safe) {
            finalContent = BLOCKED_MESSAGE;
          }
          
          // Append sources to content so they persist in storage
          const sources = pendingSourcesRef.current;
          if (sources.length > 0) {
            finalContent += `\n---SOURCES---${JSON.stringify(sources)}`;
          }
          saveMessage(activeChat.id, 'assistant', finalContent, jobId);
          return '';
        });
        
        setChatState('idle');
        currentJobIdRef.current = null;
        setCurrentJobId(null);
        setPendingSources([]);
        
        scrollToBottom();
      }
    });
    
    return () => setOnJobComplete(null);
  }, [activeChat, setOnJobComplete, saveMessage, scrollToBottom]);

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
        setIsSearching(false);
        setChatState('error');
        setError(errorMsg);
        setStreamingContent('');
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
      !isAuthenticated ||
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
      
      // Get auth token for submission
      getAccessToken().then(async (authToken) => {
        if (!authToken) {
          setChatState('error');
          setError('Authentication required. Please log in.');
          return Promise.reject(new Error('No auth token'));
        }
        // E2E disabled until debugged
        return submitJob({
          messages: [{ role: 'user', content: pendingPrompt }],
          model: selectedModel,
          authToken,
        });
      })
        .then((jobId) => {
          currentJobIdRef.current = jobId;
          setCurrentJobId(jobId);
        })
        .catch((err) => {
          console.error('Error submitting pending prompt job:', err);
          setChatState('error');
          setError('Failed to submit job. Please try again.');
        });
    }, 100);
  }, [
    pendingPromptProcessed, 
    isConnected, 
    loadingChats, 
    isAuthenticated, 
    authLoading,
    user?.id, 
    chats, 
    submitJob,
    getAccessToken,
    selectedModel,
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

  // Show login prompt if not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center border border-white/10 bg-white/[0.02] rounded-2xl p-8 max-w-md mx-4">
          <div className="pixel-serif text-white text-4xl mb-4">🔒</div>
          <h1 className="pixel-serif text-white text-2xl mb-3">Login Required</h1>
          <p className="pixel-sans text-white/50 text-sm mb-6">
            You need to log in to access the chat. Connect with Privy to continue.
          </p>
          <button
            onClick={() => login()}
            className="pixel-sans text-sm px-8 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
          >
            Login with Privy
          </button>
          <div className="mt-4">
            <a href="/" className="pixel-sans text-white/30 text-xs hover:text-white/50 transition-colors">
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
            <a href="/" className="pixel-serif-logo text-white text-lg font-bold flex items-center">
              C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
            </a>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Model Switcher */}
            {/* Model switcher */}
            <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
              {USER_MODELS.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`pixel-sans text-xs px-3 py-2 transition-colors ${
                      isSelected 
                        ? 'bg-[#80a0c1]/20 text-[#80a0c1]' 
                        : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                    }`}
                    title={model.description}
                  >
                    {model.name} <span className={`${isSelected ? 'text-[#80a0c1]/60' : 'text-white/25'}`}>· {model.costLabel}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Credit balance — always visible */}
            <button
              onClick={() => router.push('/settings#usage')}
              className={`pixel-sans text-xs px-3 py-2 rounded-lg border transition-colors ${
                creditBalance === 0
                  ? 'border-red-500/20 bg-red-500/[0.04] text-red-400/70'
                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
              }`}
            >
              {creditBalance.toFixed(0)} credits
            </button>

            {/* Connection + Back */}
            <div className="flex items-center gap-3">
              <div className={`pixel-sans text-xs flex items-center gap-1.5 ${isConnected ? 'text-green-400/70' : 'text-white/30'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-white/30'}`} />
                {isConnected ? 'Online' : '...'}
              </div>
              <button 
                onClick={() => router.push('/')}
                className="pixel-sans text-sm text-white/40 hover:text-white transition-colors"
              >
                ← Back
              </button>
            </div>
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
              className="w-full pixel-sans py-3 mx-2 px-3 border border-white/20 rounded-xl text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
                <span className="pixel-sans text-white/30 text-sm">Loading...</span>
              </div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center">
                <span className="pixel-sans text-white/30 text-sm">No chats yet</span>
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
                        <p className="pixel-sans text-white/40 text-xs mt-1">{formatDate(chat.updated_at)}</p>
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
                <div className="pixel-sans text-white/40 text-xs">Workers</div>
              </div>
              <div>
                <div className="pixel-serif text-white text-xl">{networkStats?.jobsInQueue || 0}</div>
                <div className="pixel-sans text-white/40 text-xs">In Queue</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {!activeChat ? (
            // Empty state
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="pixel-serif text-white/20 text-7xl mb-6">?</div>
                <p className="pixel-sans text-white/40 text-base mb-6">Select a chat or start a new one</p>
                <button
                  onClick={createNewChat}
                  className="pixel-sans px-8 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
                >
                  New Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div 
                className="flex-1 overflow-y-auto py-4"
                onClick={() => inputRef.current?.focus()}
              >
              <div className="max-w-3xl mx-auto px-4 space-y-5">
                {activeChat.messages.length === 0 && chatState === 'idle' && (
                  <div className="flex items-center justify-center h-full">
                    <p className="pixel-sans text-white/30 text-base">Send a message to start the conversation</p>
                  </div>
                )}
                
                {activeChat.messages.map((message) => {
                  const { cleanContent, sources } = message.role === 'assistant' 
                    ? parseSourcesFromContent(message.content) 
                    : { cleanContent: message.content, sources: [] };
                  return (
                    <div
                      key={message.id}
                      className={`group/msg flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`${
                          message.role === 'user'
                            ? 'max-w-[85%] px-4 py-2.5 bg-white/[0.07] rounded-2xl'
                            : 'w-full'
                        }`}
                      >
                        <SourceStrip sources={sources} content={cleanContent} />
                        <div className="pixel-sans text-white/90 text-[15px] leading-[1.7] prose prose-invert prose-base max-w-none prose-p:my-3 prose-li:my-1 prose-ol:my-3 prose-ul:my-3 prose-headings:mt-5 prose-headings:mb-2 prose-headings:text-white prose-headings:font-semibold prose-strong:text-white prose-strong:font-extrabold prose-code:text-white/80 prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-hr:my-5 prose-hr:border-white/10 [&_br]:block [&_br]:content-[''] [&_br]:mt-2.5">
                          <ReactMarkdown remarkPlugins={[remarkBreaks]} components={buildMarkdownComponents(sources)}>{cleanContent}</ReactMarkdown>
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyMessage(message.id, message.content)}
                          className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                          title="Copy"
                        >
                          {copiedId === message.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><path d="M20 6L9 17l-5-5"/></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 hover:text-white/60"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          )}
                        </button>
                        {message.role === 'user' && chatState === 'idle' && (
                          <button
                            onClick={() => editUserMessage(message.id)}
                            className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                            title="Edit"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 hover:text-white/60"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {/* Streaming message */}
                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="w-full">
                      <SourceStrip sources={pendingSources} />
                      <div className="pixel-sans text-white/90 text-[15px] leading-[1.7] prose prose-invert prose-base max-w-none prose-p:my-3 prose-li:my-1 prose-ol:my-3 prose-ul:my-3 prose-headings:mt-5 prose-headings:mb-2 prose-headings:text-white prose-headings:font-semibold prose-strong:text-white prose-strong:font-extrabold prose-code:text-white/80 prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-hr:my-5 prose-hr:border-white/10 [&_br]:block [&_br]:content-[''] [&_br]:mt-2.5">
                        <ReactMarkdown remarkPlugins={[remarkBreaks]} components={buildMarkdownComponents(pendingSources)}>{filterDisclaimers(streamingContent)}</ReactMarkdown>
                        <span className="inline-block w-2 h-5 bg-white/50 ml-1 animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Search indicator */}
                {isSearching && (
                  <div className="flex justify-center">
                    <div className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg">
                      <p className="pixel-sans text-white/50 text-sm">
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
                        {networkStats?.avgJobDurationMs && networkStats.avgJobDurationMs > 0 && (
                          <span className="text-[#80a0c1]/70 ml-2">
                            · ~{Math.ceil((queuePosition * networkStats.avgJobDurationMs) / 1000)}s wait
                          </span>
                        )}
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
                          <>Not enough credits. Top up in <a href="/settings#usage" className="underline hover:text-red-300">Settings</a>.</>
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
                    if (!hasWorkers && isConnected) {
                      return (
                        <div className="pixel-sans text-white/40 text-xs text-center mb-2">
                          No {selectedModel === 'native-max' ? 'native' : 'browser'} workers are online — your message will queue until one connects
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                          if (e.target.value.length <= MAX_INPUT_CHARS) {
                            setInputValue(e.target.value);
                          }
                        }}
                        placeholder={isConnected ? "Type your message..." : "Connecting to network..."}
                        disabled={chatState !== 'idle' || !isConnected}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-5 py-4 pixel-sans text-white text-base placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
                      />
                      {/* Character counter */}
                      <span className={`absolute top-1/2 -translate-y-1/2 right-4 pixel-sans text-xs ${
                        inputValue.length > MAX_INPUT_CHARS * 0.9 
                          ? 'text-red-400' 
                          : inputValue.length > MAX_INPUT_CHARS * 0.75 
                            ? 'text-[#80a0c1]' 
                            : 'text-white/30'
                      }`}>
                        {inputValue.length}/{MAX_INPUT_CHARS}
                      </span>
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={!inputValue.trim() || inputValue.length > MAX_INPUT_CHARS || chatState !== 'idle' || !isConnected}
                      className="bg-black border border-white/10 rounded-xl px-5 flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Send"
                    >
                      <img src="/PixelSendIcon.png" alt="Send" width={24} height={24} />
                    </button>
                  </div>
                  <p className="pixel-sans text-white/20 text-sm mt-2 text-center">
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
