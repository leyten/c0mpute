'use client';

// V2 "Gallery" — the exclusive-minimal read. No persistent sidebar: history
// lives behind a single header button that opens a command-palette overlay.
// The conversation column is the whole stage — wide margins, serif empty
// state, generous leading, assistant text nearly bare on the page. The
// composer floats like the homepage hero input.

import { useState } from 'react';
import { ChatShellProps } from '../types';
import MessageList from '../../components/MessageList';
import Composer from '../../components/Composer';
import GalleryHeader from './GalleryHeader';
import HistoryOverlay from './HistoryOverlay';

export default function GalleryShell(props: ChatShellProps) {
  const { activeChat, selectedPlanObj, showScrollDown, onScrollToBottom } = props;
  // Overlay visibility is pure presentation state — it belongs to the shell.
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="h-screen bg-black flex flex-col ui-readable chat-ui overflow-hidden">
      <GalleryHeader
        isAuthenticated={props.isAuthenticated}
        freePromptsRemaining={props.freePromptsRemaining}
        stakeAllowanceLeft={props.stakeAllowanceLeft}
        creditBalance={props.creditBalance}
        anonRemaining={props.anonRemaining}
        onLogin={props.onLogin}
        onOpenUsage={props.onOpenUsage}
        onOpenStaking={props.onOpenStaking}
        onOpenHistory={() => setHistoryOpen(true)}
        onNewChat={props.onNewChat}
      />

      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {!activeChat ? (
          // Empty stage: serif hero, one quiet line, one action
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center max-w-lg">
              <h1 className="pixel-serif text-white text-5xl mb-5">Ask the network</h1>
              <p className="pixel-sans text-white/45 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                Your prompts run on GPUs contributed by people around the world.
              </p>
              <button
                onClick={props.onNewChat}
                className="cursor-pointer pixel-sans font-medium px-7 py-3 bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
              >
                Start a conversation
              </button>
            </div>
          </div>
        ) : (
          <>
            <MessageList
              appearance="gallery"
              activeChat={activeChat}
              chatState={props.chatState}
              streamingContent={props.streamingContent}
              pendingSources={props.pendingSources}
              pendingGenImages={props.pendingGenImages}
              isSearching={props.isSearching}
              isGeneratingImage={props.isGeneratingImage}
              queuePosition={props.queuePosition}
              networkStats={props.networkStats}
              thinkingElapsed={props.thinkingElapsed}
              error={props.error}
              tierSwitch={props.tierSwitch}
              selectedPlanName={selectedPlanObj.name}
              copiedId={props.copiedId}
              onCopy={props.onCopy}
              onEditUserMessage={props.onEditUserMessage}
              onDismissError={props.onDismissError}
              onAcceptTierSwitch={props.onAcceptTierSwitch}
              onDismissTierSwitch={props.onDismissTierSwitch}
              containerRef={props.messagesContainerRef}
              endRef={props.messagesEndRef}
              onScroll={props.onMessagesScroll}
              onBackgroundClick={props.onBackgroundClick}
            />

            {/* Floating scroll-to-bottom button */}
            {showScrollDown && (
              <button
                onClick={onScrollToBottom}
                aria-label="Scroll to bottom"
                className="absolute bottom-40 right-5 z-10 w-9 h-9 rounded-full bg-[#141210] border border-white/15 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
              </button>
            )}

            <Composer
              appearance="gallery"
              inputRef={props.inputRef}
              inputValue={props.inputValue}
              onInputChange={props.onInputChange}
              onSend={props.onSend}
              chatState={props.chatState}
              isConnected={props.isConnected}
              selectedPlan={props.selectedPlan}
              selectedPlanObj={selectedPlanObj}
              onSelectPlan={props.onSelectPlan}
              deepThinking={props.deepThinking}
              onToggleDeepThinking={props.onToggleDeepThinking}
              pendingImages={props.pendingImages}
              onRemoveImage={props.onRemoveImage}
              onImageFiles={props.onImageFiles}
              networkStats={props.networkStats}
            />
          </>
        )}
      </main>

      {historyOpen && (
        <HistoryOverlay
          chats={props.chats}
          activeChatId={activeChat?.id ?? null}
          loadingChats={props.loadingChats}
          editingChatId={props.editingChatId}
          editingTitle={props.editingTitle}
          onSelectChat={props.onSelectChat}
          onNewChat={props.onNewChat}
          onDeleteChat={props.onDeleteChat}
          onStartRename={props.onStartRename}
          onEditingTitleChange={props.onEditingTitleChange}
          onCommitRename={props.onCommitRename}
          onCancelRename={props.onCancelRename}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
