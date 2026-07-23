'use client';

// V2 history: a command-palette-style overlay instead of a persistent
// sidebar. Backdrop click or Esc closes it; a local filter narrows the
// list; rename/delete reuse the exact page handlers the sidebar used.

import { useEffect, useState } from 'react';
import { ChatWithMessages } from '@/lib/types';
import { formatChatDate } from '../../lib';

interface HistoryOverlayProps {
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
  onClose: () => void;
}

export default function HistoryOverlay({
  chats, activeChatId, loadingChats,
  editingChatId, editingTitle,
  onSelectChat, onNewChat, onDeleteChat,
  onStartRename, onEditingTitleChange, onCommitRename, onCancelRename,
  onClose,
}: HistoryOverlayProps) {
  const [filter, setFilter] = useState('');

  // Esc closes the overlay. The rename input stops propagation on its own
  // Escape so cancelling a rename never also closes the panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const shown = filter.trim()
    ? chats.filter(c => c.title.toLowerCase().includes(filter.trim().toLowerCase()))
    : chats;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-start justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mt-[10vh] bg-[#141210] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Filter row + new chat */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/35 shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search conversations..."
            autoFocus
            className="flex-1 bg-transparent pixel-sans text-white text-sm placeholder:text-white/35 focus:outline-none"
          />
          <button
            onClick={() => { onNewChat(); onClose(); }}
            className="cursor-pointer flex items-center gap-1.5 pixel-sans text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/80 hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            New chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {loadingChats ? (
            <p className="pixel-sans text-white/40 text-sm text-center py-8">Loading...</p>
          ) : shown.length === 0 ? (
            <p className="pixel-sans text-white/40 text-sm text-center py-8">
              {chats.length === 0 ? 'No conversations yet' : 'No matches'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {shown.map((chat) => {
                const isActive = activeChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-1 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                      isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                    onClick={() => {
                      if (editingChatId === chat.id) return;
                      onSelectChat(chat.id);
                      onClose();
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      {editingChatId === chat.id ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => onEditingTitleChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onCommitRename(chat.id, editingTitle);
                            if (e.key === 'Escape') { e.stopPropagation(); onCancelRename(); }
                          }}
                          onBlur={() => onCommitRename(chat.id, editingTitle)}
                          autoFocus
                          className="w-full bg-black/50 border border-white/20 rounded-md px-2 py-1 pixel-sans text-white text-sm focus:outline-none focus:border-white/40"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`pixel-sans text-sm truncate ${isActive ? 'text-white' : 'text-white/80'}`}>{chat.title}</p>
                          <p className="pixel-sans text-white/35 text-[11px] shrink-0">{formatChatDate(chat.updated_at)}</p>
                        </div>
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
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-white/[0.06]">
          <span className="pixel-sans text-white/30 text-[11px]">esc to close</span>
        </div>
      </div>
    </div>
  );
}
