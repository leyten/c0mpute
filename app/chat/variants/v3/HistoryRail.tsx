'use client';

// V3 sessions rail: history as a compact in-pane panel (not the shared
// Sidebar). On desktop it sits in-flow inside the left pane below the header
// and collapses to zero width; on mobile it overlays as a drawer. Rename and
// delete flows are identical to the shared Sidebar — only the skin is the
// denser console read (eyebrow, smaller rows, square accents).

import { ChatWithMessages } from '@/lib/types';
import { formatChatDate } from '../../lib';

interface HistoryRailProps {
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
}

export default function HistoryRail({
  open, onClose, chats, activeChatId, loadingChats,
  editingChatId, editingTitle,
  onSelectChat, onNewChat, onDeleteChat,
  onStartRename, onEditingTitleChange, onCommitRename, onCancelRename,
}: HistoryRailProps) {
  return (
    <>
      {/* Mobile backdrop while the drawer overlays the console */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={onClose} />
      )}
      <aside
        className={`${open ? 'w-60 max-md:translate-x-0' : 'w-0 max-md:-translate-x-full'} max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72 shrink-0 border-r border-white/10 bg-[#0a0908] flex flex-col transition-all duration-300 overflow-hidden`}
      >
        {/* Rail header */}
        <div className="h-9 shrink-0 flex items-center justify-between pl-4 pr-2 border-b border-white/10">
          <span className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em] whitespace-nowrap">sessions</span>
          <button
            onClick={onClose}
            aria-label="Close sessions"
            className="md:hidden p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className="p-2 shrink-0">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 pixel-sans text-[13px] text-white hover:bg-white/[0.05] hover:border-white/25 transition-colors cursor-pointer whitespace-nowrap"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>

        {/* Conversation list */}
        <nav className="flex-1 overflow-y-auto px-1.5 pb-2">
          {loadingChats ? (
            <p className="pixel-sans text-white/40 text-[13px] text-center py-5">Loading...</p>
          ) : chats.length === 0 ? (
            <p className="pixel-sans text-white/40 text-[13px] text-center py-5">No conversations yet</p>
          ) : (
            <div className="space-y-0.5">
              {chats.map((chat) => {
                const isActive = activeChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-1 rounded-md px-2.5 py-1.5 cursor-pointer transition-colors ${
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
                          className="w-full bg-black/50 border border-white/20 rounded-md px-2 py-1 pixel-sans text-white text-[13px] focus:outline-none focus:border-white/40"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <p className={`pixel-sans text-[13px] truncate ${isActive ? 'text-white' : 'text-white/75'}`}>{chat.title}</p>
                          <p className="pixel-sans text-white/30 text-[10px] mt-0.5">{formatChatDate(chat.updated_at)}</p>
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
                        className="p-1 cursor-pointer transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 hover:text-[#80a0c1]">
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
                        className="p-1 cursor-pointer transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 hover:text-red-400">
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
      </aside>
    </>
  );
}
