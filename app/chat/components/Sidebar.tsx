'use client';

// Left rail: wordmark, new-chat, conversation history, network status.
// In-flow on desktop (collapses to zero width), overlay drawer on mobile.

import Link from 'next/link';
import { ChatWithMessages } from '@/lib/types';
import { NetworkStats } from '@/lib/orchestrator/types';
import { formatChatDate } from '../lib';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  chats: ChatWithMessages[];
  activeChatId: string | null;
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
  networkStats: NetworkStats | null;
  isConnected: boolean;
  /** Replaces the default network-status footer (V3 passes its network panel). */
  footer?: React.ReactNode;
}

export default function Sidebar({
  open, onClose, chats, activeChatId, loadingChats,
  editingChatId, editingTitle,
  onSelectChat, onNewChat, onDeleteChat,
  onStartRename, onEditingTitleChange, onCommitRename, onCancelRename,
  networkStats, isConnected, footer,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop while the drawer overlays the chat */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={onClose} />
      )}
      <aside
        className={`${open ? 'w-72 max-md:translate-x-0' : 'w-0 max-md:-translate-x-full'} max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72 shrink-0 border-r border-white/10 bg-[#0a0908] flex flex-col transition-all duration-300 overflow-hidden`}
      >
        {/* Wordmark row */}
        <div className="h-14 shrink-0 flex items-center justify-between pl-5 pr-3 border-b border-white/10">
          <Link href="/" className="cursor-pointer pixel-serif-logo text-white text-lg whitespace-nowrap">
            c<span>0</span>mpute
          </Link>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className="p-3 shrink-0">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2.5 rounded-xl border border-white/15 px-3.5 py-2.5 pixel-sans text-sm text-white hover:bg-white/[0.05] hover:border-white/25 transition-colors cursor-pointer whitespace-nowrap"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>

        {/* Conversation list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {loadingChats ? (
            <p className="pixel-sans text-white/40 text-sm text-center py-6">Loading...</p>
          ) : chats.length === 0 ? (
            <p className="pixel-sans text-white/40 text-sm text-center py-6">No conversations yet</p>
          ) : (
            <div className="space-y-0.5">
              {chats.map((chat) => {
                const isActive = activeChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-1 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                      isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                    onClick={() => editingChatId !== chat.id && onSelectChat(chat.id)}
                  >
                    <div className="flex-1 min-w-0">
                      {editingChatId === chat.id ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => onEditingTitleChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onCommitRename(chat.id, editingTitle);
                            if (e.key === 'Escape') onCancelRename();
                          }}
                          onBlur={() => onCommitRename(chat.id, editingTitle)}
                          autoFocus
                          className="w-full bg-black/50 border border-white/20 rounded-md px-2 py-1 pixel-sans text-white text-sm focus:outline-none focus:border-white/40"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <p className={`pixel-sans text-sm truncate ${isActive ? 'text-white' : 'text-white/80'}`}>{chat.title}</p>
                          <p className="pixel-sans text-white/35 text-[11px] mt-0.5">{formatChatDate(chat.updated_at)}</p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartRename(chat.id, chat.title);
                        }}
                        title="Rename"
                        className="p-1.5 cursor-pointer transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 hover:text-[#80a0c1]">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        title="Delete"
                        className="p-1.5 cursor-pointer transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 hover:text-red-400">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        {/* Network status (or the variant's own footer when provided) */}
        {footer !== undefined ? footer : (
          <div className="shrink-0 border-t border-white/10 px-5 py-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="pixel-sans text-white/40 text-xs">Workers online</span>
              <span className="pixel-sans text-white/80 text-xs tabular-nums">{networkStats?.workersOnline || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="pixel-sans text-white/40 text-xs">Jobs in queue</span>
              <span className="pixel-sans text-white/80 text-xs tabular-nums">{networkStats?.jobsInQueue || 0}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-white/25'}`} />
              <span className={`pixel-sans text-xs ${isConnected ? 'text-emerald-300/80' : 'text-white/50'}`}>
                {isConnected ? 'Connected to network' : 'Connecting...'}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
