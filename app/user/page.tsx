'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { Chat, Message, ChatWithMessages } from '@/lib/supabase/types';
import { MAX_INPUT_CHARS } from '@/lib/orchestrator/types';

type ChatState = 'idle' | 'queued' | 'streaming' | 'error';

// Local storage key for chats
const CHATS_STORAGE_KEY = 'c0mpute_chats';

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
  const { isLoading: authLoading, isAuthenticated, user, login } = useAuth();
  
  // Socket
  const {
    isConnected,
    networkStats,
    queuePosition,
    submitJob,
    setOnJobToken,
    setOnJobComplete,
    setOnJobError,
    setOnJobAssigned,
  } = useSocket();
  
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
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentJobIdRef = useRef<string | null>(null);

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

  // Send message
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !activeChat || chatState !== 'idle' || !isConnected) return;
    if (inputValue.length > MAX_INPUT_CHARS) {
      setError(`Message too long. Maximum ${MAX_INPUT_CHARS} characters.`);
      return;
    }
    
    const content = inputValue.trim();
    setInputValue('');
    setError(null);
    
    // Save user message to local storage (this updates activeChat via setChats)
    const userMessage = saveMessage(activeChat.id, 'user', content);
    
    // Build messages for context (last 10 messages)
    const contextMessages = [...(activeChat.messages || []).slice(-10), userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }));
    
    // Submit job to orchestrator
    setChatState('queued');
    setStreamingContent('');
    
    try {
      const jobId = await submitJob(contextMessages);
      // Update ref immediately (sync) before async state update
      currentJobIdRef.current = jobId;
      setCurrentJobId(jobId);
      console.log('[User] Job submitted:', jobId);
    } catch (err) {
      console.error('Error submitting job:', err);
      setChatState('error');
      setError('Failed to submit job. Please try again.');
    }
    
    setTimeout(scrollToBottom, 100);
  }, [inputValue, activeChat, chatState, isConnected, submitJob, saveMessage, scrollToBottom]);

  // Handle job token (streaming)
  useEffect(() => {
    // Stop tokens to filter out
    const STOP_TOKENS = ['<|im_end|>', '<|im_end', '<|im_start|>', '<|endoftext|>'];
    
    setOnJobToken((jobId, token) => {
      // Use ref for immediate access (avoids race condition with state)
      if (jobId === currentJobIdRef.current) {
        console.log('[User] Received token for job:', jobId, token);
        setChatState('streaming');
        // Filter out stop tokens
        let cleanToken = token;
        for (const stopToken of STOP_TOKENS) {
          cleanToken = cleanToken.replace(stopToken, '');
        }
        if (cleanToken) {
          setStreamingContent(prev => prev + cleanToken);
          scrollToBottom();
        }
      } else {
        console.log('[User] Ignoring token for job:', jobId, '(current:', currentJobIdRef.current, ')');
      }
    });
    
    return () => setOnJobToken(null);
  }, [setOnJobToken, scrollToBottom]);

  // Handle job assigned
  useEffect(() => {
    setOnJobAssigned((jobId) => {
      // Use ref for immediate access
      if (jobId === currentJobIdRef.current) {
        console.log('[User] Job assigned:', jobId);
        setChatState('streaming');
      }
    });
    
    return () => setOnJobAssigned(null);
  }, [setOnJobAssigned]);

  // Handle job complete
  useEffect(() => {
    const STOP_TOKENS = ['<|im_end|>', '<|im_end', '<|im_start|>', '<|endoftext|>'];
    
    setOnJobComplete((jobId, response) => {
      // Use ref for immediate access
      if (jobId === currentJobIdRef.current && activeChat) {
        console.log('[User] Job complete:', jobId);
        // Clean response of stop tokens
        let cleanResponse = response;
        for (const stopToken of STOP_TOKENS) {
          cleanResponse = cleanResponse.split(stopToken).join('');
        }
        cleanResponse = cleanResponse.trim();
        
        // Filter out AI disclaimers
        cleanResponse = filterDisclaimers(cleanResponse);
        
        // Save assistant message to local storage
        saveMessage(activeChat.id, 'assistant', cleanResponse, jobId);
        
        setStreamingContent('');
        setChatState('idle');
        // Clear ref immediately
        currentJobIdRef.current = null;
        setCurrentJobId(null);
        
        scrollToBottom();
      }
    });
    
    return () => setOnJobComplete(null);
  }, [activeChat, setOnJobComplete, saveMessage, scrollToBottom]);

  // Handle job error
  useEffect(() => {
    setOnJobError((jobId, errorMsg) => {
      // Use ref for immediate access
      if (jobId === currentJobIdRef.current) {
        console.log('[User] Job error:', jobId, errorMsg);
        setChatState('error');
        setError(errorMsg);
        setStreamingContent('');
        // Clear ref immediately
        currentJobIdRef.current = null;
        setCurrentJobId(null);
      }
    });
    
    return () => setOnJobError(null);
  }, [setOnJobError]);

  // Load chats from localStorage on mount
  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

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
        <div className="text-center border border-white/10 bg-white/[0.02] p-8 max-w-md mx-4">
          <div className="pixel-serif text-white text-4xl mb-4">🔒</div>
          <h1 className="pixel-serif text-white text-2xl mb-3">Login Required</h1>
          <p className="pixel-sans text-white/50 text-sm mb-6">
            You need to log in to access the chat. Connect with Privy to continue.
          </p>
          <button
            onClick={() => login()}
            className="pixel-sans text-sm px-8 py-3 bg-white text-black hover:bg-white/90 transition-colors"
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
            <div className={`pixel-sans text-xs flex items-center gap-2 ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`} />
              {isConnected ? 'Connected' : 'Connecting...'}
            </div>
            <button 
              onClick={() => router.push('/')}
              className="pixel-sans text-sm text-white/70 hover:text-white transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} border-r border-white/10 bg-black/50 flex flex-col transition-all duration-300 overflow-hidden`}>
          {/* New Chat Button */}
          <div className="p-3 border-b border-white/5">
            <button
              onClick={createNewChat}
              className="w-full pixel-sans text-sm py-2.5 border border-white/20 text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Chat
            </button>
          </div>
          
          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <div className="p-4 text-center">
                <span className="pixel-sans text-white/30 text-xs">Loading...</span>
              </div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center">
                <span className="pixel-sans text-white/30 text-xs">No chats yet</span>
              </div>
            ) : (
              <div className="py-2">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group px-3 py-2 mx-2 mb-1 cursor-pointer transition-colors ${
                      activeChat?.id === chat.id 
                        ? 'bg-white/10 border border-white/20' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                    onClick={() => fetchChat(chat.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="pixel-sans text-white text-sm truncate">{chat.title}</p>
                        <p className="pixel-sans text-white/40 text-xs mt-0.5">{formatDate(chat.updated_at)}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(chat.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 transition-all"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50 hover:text-red-400">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Network Stats */}
          <div className="p-3 border-t border-white/5 bg-white/[0.02]">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="pixel-serif text-white text-lg">{networkStats?.workersOnline || 0}</div>
                <div className="pixel-sans text-white/40 text-[10px]">Workers</div>
              </div>
              <div>
                <div className="pixel-serif text-white text-lg">{networkStats?.jobsInQueue || 0}</div>
                <div className="pixel-sans text-white/40 text-[10px]">In Queue</div>
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
                <div className="pixel-serif text-white/20 text-6xl mb-4">?</div>
                <p className="pixel-sans text-white/40 text-sm mb-4">Select a chat or start a new one</p>
                <button
                  onClick={createNewChat}
                  className="pixel-sans text-sm px-6 py-2 bg-white text-black hover:bg-white/90 transition-colors"
                >
                  New Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-4"
                onClick={() => inputRef.current?.focus()}
              >
                {activeChat.messages.length === 0 && chatState === 'idle' && (
                  <div className="flex items-center justify-center h-full">
                    <p className="pixel-sans text-white/30 text-sm">Send a message to start the conversation</p>
                  </div>
                )}
                
                {activeChat.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] md:max-w-[60%] p-4 ${
                        message.role === 'user'
                          ? 'bg-white/10 border border-white/20'
                          : 'bg-white/[0.02] border border-white/5'
                      }`}
                    >
                      <p className="pixel-sans text-white text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                
                {/* Streaming message */}
                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] md:max-w-[60%] p-4 bg-white/[0.02] border border-white/5">
                      <p className="pixel-sans text-white text-sm whitespace-pre-wrap">
                        {filterDisclaimers(streamingContent)}
                        <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Queue position indicator with estimated wait time */}
                {chatState === 'queued' && queuePosition !== null && queuePosition > 0 && (
                  <div className="flex justify-center">
                    <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20">
                      <p className="pixel-sans text-yellow-400 text-xs">
                        You are #{queuePosition} in queue
                        {networkStats?.avgJobDurationMs && networkStats.avgJobDurationMs > 0 && (
                          <span className="text-yellow-400/70 ml-2">
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
                    <div className="p-4 bg-white/[0.02] border border-white/5">
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
                    <div className="px-4 py-2 bg-red-500/10 border border-red-500/20">
                      <p className="pixel-sans text-red-400 text-xs">{error}</p>
                      <button
                        onClick={() => {
                          setError(null);
                          setChatState('idle');
                        }}
                        className="pixel-sans text-red-400/70 text-xs underline mt-1"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="border-t border-white/10 p-4">
                <div className="max-w-4xl mx-auto">
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
                        className="w-full bg-white/[0.02] border border-white/10 px-4 py-3 pixel-sans text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 h-12"
                      />
                      {/* Character counter */}
                      <span className={`absolute top-1/2 -translate-y-1/2 right-3 pixel-sans text-[10px] ${
                        inputValue.length > MAX_INPUT_CHARS * 0.9 
                          ? 'text-red-400' 
                          : inputValue.length > MAX_INPUT_CHARS * 0.75 
                            ? 'text-yellow-400' 
                            : 'text-white/30'
                      }`}>
                        {inputValue.length}/{MAX_INPUT_CHARS}
                      </span>
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={!inputValue.trim() || inputValue.length > MAX_INPUT_CHARS || chatState !== 'idle' || !isConnected}
                      className="bg-black border border-white/10 px-4 h-12 flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Send"
                    >
                      <img src="/PixelSendIcon.png" alt="Send" width={20} height={20} />
                    </button>
                  </div>
                  <p className="pixel-sans text-white/20 text-xs mt-2 text-center">
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
