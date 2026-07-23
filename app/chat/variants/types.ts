// The single props contract every chat shell renders from. page.tsx owns all
// state, effects, and socket handlers; it assembles this object once and hands
// it to the active variant shell (v1 Studio / v2 Gallery / v3 Network). Shells
// are presentation only — they never call the network or mutate storage
// directly, everything goes through these values and handlers.

import { RefObject } from 'react';
import { ChatWithMessages } from '@/lib/types';
import { NetworkStats } from '@/lib/orchestrator/types';
import { ChatState, Plan, PlanId, SourceRef } from '../lib';

// Mirror of useSocket's nativeStatus shape. Only populated for sessions that
// run a native worker — for a plain chat visitor it stays null, and any UI row
// fed by it must simply not render.
export type NativeWorkerStatus = {
  online: boolean;
  workerId?: string;
  type?: 'native' | 'image';
  connectedAt?: number;
  jobsCompleted: number;
  tokensGenerated: number;
  tokPerSec: number;
  currentJob?: string;
} | null;

export interface ChatShellProps {
  // Connection / network
  isConnected: boolean;
  networkStats: NetworkStats | null;
  nativeStatus: NativeWorkerStatus;
  queuePosition: number | null;

  // Auth / credits
  isAuthenticated: boolean;
  anonRemaining: number | null;
  freePromptsRemaining: number;
  stakeAllowanceLeft: number;
  creditBalance: number;
  onLogin: () => void;
  onOpenUsage: () => void;
  onOpenStaking: () => void;

  // Chats + history
  chats: ChatWithMessages[];
  activeChat: ChatWithMessages | null;
  loadingChats: boolean;
  editingChatId: string | null;
  editingTitle: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onStartRename: (chatId: string, currentTitle: string) => void;
  onEditingTitleChange: (title: string) => void;
  onCommitRename: (chatId: string, title: string) => void;
  onCancelRename: () => void;

  // Sidebar / drawer (V1/V3; V2 keeps its own overlay open-state locally)
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;

  // Conversation
  chatState: ChatState;
  streamingContent: string;
  pendingSources: SourceRef[];
  pendingGenImages: string[];
  isSearching: boolean;
  isGeneratingImage: boolean;
  thinkingElapsed: number | null;
  error: string | null;
  tierSwitch: { to: PlanId; toLabel: string; toCount: number } | null;
  copiedId: string | null;
  onCopy: (messageId: string, content: string) => void;
  onEditUserMessage: (messageId: string) => void;
  onDismissError: () => void;
  onAcceptTierSwitch: () => void;
  onDismissTierSwitch: () => void;

  // Scrolling
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;
  showScrollDown: boolean;
  onScrollToBottom: () => void;
  onBackgroundClick: () => void;

  // Composer
  inputRef: RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  selectedPlan: PlanId;
  selectedPlanObj: Plan;
  onSelectPlan: (plan: PlanId) => void;
  deepThinking: boolean;
  onToggleDeepThinking: () => void;
  pendingImages: string[];
  onRemoveImage: (index: number) => void;
  onImageFiles: (files: FileList) => void;
}
