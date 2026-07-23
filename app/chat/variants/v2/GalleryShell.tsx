'use client';

// V2 "Manuscript" — chatting inside a beautifully typeset living document.
// No chrome at rest: no header bar, no sidebar, no panels. The page IS the
// conversation. Two floating marks are the only furniture — the wordmark
// top-left and a small-caps "menu" top-right that opens the single
// administrative overlay (history, model, credits, new chat). Questions are
// serif-italic pull quotes, answers run in the body face, the composer is a
// floating hero-style pill that grows on focus. The file keeps the
// GalleryShell name because page.tsx binds variant '2' to this module.

import { useState } from 'react';
import Link from 'next/link';
import { ChatShellProps } from '../types';
import Transcript from './Transcript';
import QuillComposer from './QuillComposer';
import MenuOverlay from './MenuOverlay';

export default function GalleryShell(props: ChatShellProps) {
  const { activeChat, selectedPlanObj, showScrollDown, onScrollToBottom } = props;
  // The overlay is pure presentation state — it belongs to the shell.
  // (Per the contract, V2 keeps its own overlay open-state locally and
  // leaves sidebarOpen/onToggleSidebar/onCloseSidebar to V1/V3.)
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="h-screen bg-[#0c0a09] ui-readable chat-ui relative overflow-hidden">
      {/* Top fade: the text dissolves before it reaches the floating marks */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-20 z-10 bg-gradient-to-b from-[#0c0a09] via-[#0c0a09]/70 to-transparent" />

      {/* The only chrome at rest — a wordmark and a way in */}
      <Link
        href="/"
        className="absolute top-5 left-5 md:top-6 md:left-8 z-20 cursor-pointer pixel-serif-logo text-white/70 hover:text-white text-base transition-colors"
      >
        c<span>0</span>mpute
      </Link>
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        className="absolute top-5 right-5 md:top-6 md:right-8 z-20 cursor-pointer pixel-sans text-xs uppercase tracking-[0.18em] text-white/40 hover:text-white transition-colors"
      >
        menu
      </button>

      {!activeChat ? (
        // The book before its first page: one serif line, one way to begin.
        <div className="h-full flex items-center justify-center px-6">
          <div className="text-center">
            <p className="pixel-serif italic text-white/90 text-3xl md:text-4xl leading-snug">
              Ask, and the network answers.
            </p>
            <button
              onClick={props.onNewChat}
              className="cursor-pointer mt-8 pixel-sans text-sm text-[#80a0c1] hover:text-white underline underline-offset-4 decoration-white/20 hover:decoration-white/50 transition-colors"
            >
              begin
            </button>
          </div>
        </div>
      ) : (
        <>
          <Transcript
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

          {/* Bottom fade so the manuscript settles under the floating pill */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 z-10 bg-gradient-to-t from-[#0c0a09] via-[#0c0a09]/80 to-transparent" />

          {/* Quiet way back to the latest line */}
          {showScrollDown && (
            <button
              onClick={onScrollToBottom}
              aria-label="Scroll to bottom"
              className="absolute bottom-36 right-5 z-20 cursor-pointer pixel-sans text-[11px] text-white/40 hover:text-white px-2 py-1 rounded-md bg-[#0c0a09]/80 transition-colors"
            >
              latest &darr;
            </button>
          )}

          <QuillComposer
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

      {menuOpen && (
        <MenuOverlay
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
          selectedPlan={props.selectedPlan}
          onSelectPlan={props.onSelectPlan}
          networkStats={props.networkStats}
          isAuthenticated={props.isAuthenticated}
          anonRemaining={props.anonRemaining}
          freePromptsRemaining={props.freePromptsRemaining}
          stakeAllowanceLeft={props.stakeAllowanceLeft}
          creditBalance={props.creditBalance}
          onLogin={props.onLogin}
          onOpenUsage={props.onOpenUsage}
          onOpenStaking={props.onOpenStaking}
          isConnected={props.isConnected}
          nativeStatus={props.nativeStatus}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
