'use client';

// V3 "Network" — the split-stage machine room. Two panes on desktop:
//   LEFT (~60%): the conversation console — compact header, an in-pane
//     sessions rail (history), dense messages, flat composer.
//   RIGHT (~40%): the stage — a full-height canvas of the flat Europe
//     dot-map with the six-city ring, reacting to the conversation state,
//     plus real network stats underneath.
// Below lg the stage collapses to a slim strip above the composer. This is
// the variant where c0mpute's identity — your prompt runs on people's GPUs —
// stays visible while you chat.

import { ChatShellProps } from '../types';
import ConsoleHeader from './ConsoleHeader';
import HistoryRail from './HistoryRail';
import ConsoleMessages from './ConsoleMessages';
import ConsoleComposer from './ConsoleComposer';
import NetworkStage from './NetworkStage';
import StageStrip from './StageStrip';

export default function NetworkShell(props: ChatShellProps) {
  const { activeChat, selectedPlanObj, showScrollDown, onScrollToBottom } = props;

  return (
    <div className="h-screen bg-[#0c0a09] flex ui-readable chat-ui overflow-hidden">
      {/* LEFT: the conversation console */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ConsoleHeader
          railOpen={props.sidebarOpen}
          onToggleRail={props.onToggleSidebar}
          onNewChat={props.onNewChat}
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

        <div className="flex-1 flex min-h-0">
          <HistoryRail
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
          />

          <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
            {!activeChat ? (
              <>
                {/* Empty state: nothing selected yet */}
                <div className="flex-1 flex items-center justify-center px-6">
                  <div className="text-center max-w-md">
                    <h1 className="pixel-serif text-white text-3xl mb-4">Ask the network</h1>
                    <p className="pixel-sans text-white/50 text-[13px] leading-relaxed mb-6">
                      Your prompts run on GPUs contributed by people around the world.
                      Open a session to start.
                    </p>
                    <button
                      onClick={props.onNewChat}
                      className="cursor-pointer pixel-sans font-medium text-sm px-6 py-2.5 bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
                    >
                      New chat
                    </button>
                  </div>
                </div>
                <StageStrip
                  networkStats={props.networkStats}
                  isConnected={props.isConnected}
                  chatState={props.chatState}
                  queuePosition={props.queuePosition}
                  nativeStatus={props.nativeStatus}
                />
              </>
            ) : (
              <>
                <ConsoleMessages
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
                    className="absolute bottom-36 right-5 z-10 w-8 h-8 rounded-md bg-[#141210] border border-white/15 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/80"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                  </button>
                )}

                {/* Below lg the stage compresses into this band, above the composer */}
                <StageStrip
                  networkStats={props.networkStats}
                  isConnected={props.isConnected}
                  chatState={props.chatState}
                  queuePosition={props.queuePosition}
                  nativeStatus={props.nativeStatus}
                />

                <ConsoleComposer
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

      {/* RIGHT: the stage */}
      <aside className="hidden lg:flex w-[40%] max-w-[600px] shrink-0 border-l border-white/10 bg-[#0a0908]">
        <NetworkStage
          networkStats={props.networkStats}
          isConnected={props.isConnected}
          chatState={props.chatState}
          nativeStatus={props.nativeStatus}
        />
      </aside>
    </div>
  );
}
