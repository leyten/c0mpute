'use client';

// V3 "Network" — the chat that shows what serves it. Same layout as V1, but
// the sidebar footer grows into a concrete network panel (per-model workers,
// connection state, live serving indicator) and a thin strip above the
// composer says who is serving the selected model. All numbers come from the
// existing socket state; absent numbers are omitted, never invented.

import { ChatShellProps } from '../types';
import Sidebar from '../../components/Sidebar';
import HeaderBar from '../../components/HeaderBar';
import MessageList from '../../components/MessageList';
import Composer from '../../components/Composer';
import NetworkPanel from './NetworkPanel';
import ServeStrip from './ServeStrip';

export default function NetworkShell(props: ChatShellProps) {
  const { activeChat, selectedPlanObj, showScrollDown, onScrollToBottom } = props;

  return (
    <div className="h-screen bg-black flex ui-readable chat-ui overflow-hidden">
      <Sidebar
        open={props.sidebarOpen}
        onClose={props.onCloseSidebar}
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
        networkStats={props.networkStats}
        isConnected={props.isConnected}
        footer={
          <NetworkPanel
            networkStats={props.networkStats}
            isConnected={props.isConnected}
            chatState={props.chatState}
            nativeStatus={props.nativeStatus}
          />
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar
          sidebarOpen={props.sidebarOpen}
          onToggleSidebar={props.onToggleSidebar}
          activeChatTitle={activeChat && activeChat.title !== 'New Chat' ? activeChat.title : null}
          isAuthenticated={props.isAuthenticated}
          freePromptsRemaining={props.freePromptsRemaining}
          stakeAllowanceLeft={props.stakeAllowanceLeft}
          creditBalance={props.creditBalance}
          anonRemaining={props.anonRemaining}
          onLogin={props.onLogin}
          onOpenUsage={props.onOpenUsage}
          onOpenStaking={props.onOpenStaking}
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
                  onClick={props.onNewChat}
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
                  className="absolute bottom-36 right-5 z-10 w-9 h-9 rounded-full bg-[#141210] border border-white/15 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                </button>
              )}

              <ServeStrip
                networkStats={props.networkStats}
                chatState={props.chatState}
                queuePosition={props.queuePosition}
                selectedPlanObj={selectedPlanObj}
                nativeStatus={props.nativeStatus}
              />

              <Composer
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
      </div>
    </div>
  );
}
