'use client';

// The conversation column: finished messages, the live streaming response,
// and every transient indicator (search, image generation, queue position,
// processing, errors, tier-switch offer).
//
// `appearance` switches the skin only — every behavior and indicator is
// shared:
//   'studio'  (default) — V1/V3: assistant identity row, standard column.
//   'gallery' — V2: wider margins, narrower reading column, generous leading,
//               no assistant label (text nearly bare), quieter user blocks,
//               serif empty state.

import { RefObject } from 'react';
import { ChatWithMessages, Message } from '@/lib/types';
import { NetworkStats } from '@/lib/orchestrator/types';
import {
  ChatState, SourceRef,
  filterDisclaimers, parseSourcesFromContent, parseThinking,
} from '../lib';
import { MessageMarkdown, SourceStrip } from './MarkdownContent';
import ThinkingDropdown from './ThinkingDropdown';

type Appearance = 'studio' | 'gallery';

interface MessageListProps {
  activeChat: ChatWithMessages;
  chatState: ChatState;
  streamingContent: string;
  pendingSources: SourceRef[];
  pendingGenImages: string[];
  isSearching: boolean;
  isGeneratingImage: boolean;
  queuePosition: number | null;
  networkStats: NetworkStats | null;
  thinkingElapsed: number | null;
  error: string | null;
  tierSwitch: { toLabel: string; toCount: number } | null;
  selectedPlanName: string;
  copiedId: string | null;
  onCopy: (messageId: string, content: string) => void;
  onEditUserMessage: (messageId: string) => void;
  onDismissError: () => void;
  onAcceptTierSwitch: () => void;
  onDismissTierSwitch: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onBackgroundClick: () => void;
  appearance?: Appearance;
}

// The small identity row above every assistant turn (hidden in gallery)
function AssistantLabel({ pulse }: { pulse?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-1.5 px-1">
      <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400/90 ${pulse ? 'animate-pulse' : ''}`} />
      <span className="pixel-serif text-white/85 text-sm">c0mpute</span>
    </div>
  );
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><path d="M20 6L9 17l-5-5" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
  );
}

function MessageRow({
  message, chatState, copiedId, onCopy, onEditUserMessage, appearance,
}: {
  message: Message;
  chatState: ChatState;
  copiedId: string | null;
  onCopy: (messageId: string, content: string) => void;
  onEditUserMessage: (messageId: string) => void;
  appearance: Appearance;
}) {
  const { cleanContent: rawContent, sources } = message.role === 'assistant'
    ? parseSourcesFromContent(message.content)
    : { cleanContent: message.content, sources: [] as SourceRef[] };
  const { thinking, response: cleanContent, thinkSeconds } = message.role === 'assistant'
    ? parseThinking(rawContent)
    : { thinking: null, response: rawContent, thinkSeconds: null };

  const isUser = message.role === 'user';
  const gallery = appearance === 'gallery';

  return (
    <div className={`group/msg msg-in flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {!isUser && !gallery && <AssistantLabel />}
      <div className={isUser
        ? (gallery
          ? 'max-w-[75%] px-4 py-2.5 bg-white/[0.04] border border-white/[0.07] rounded-2xl rounded-br-md'
          : 'max-w-[80%] px-4 py-2.5 bg-white/[0.07] rounded-2xl rounded-br-md')
        : 'w-full px-1'}
      >
        {/* Display images: user uploads small, generated images large */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, imgIdx) => (
              message.role === 'assistant'
                ? <img key={imgIdx} src={`data:image/png;base64,${img}`} alt="Generated" className="max-w-[320px] max-h-[320px] rounded-xl border border-white/10" />
                : <img key={imgIdx} src={`data:image/jpeg;base64,${img}`} alt="Uploaded" className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
            ))}
          </div>
        )}
        <SourceStrip sources={sources} content={cleanContent} />
        <MessageMarkdown content={cleanContent} sources={sources} />
        {thinking && <ThinkingDropdown thinking={thinking} elapsedSeconds={thinkSeconds ?? undefined} />}
      </div>
      {/* Hover actions */}
      <div className={`flex items-center gap-1 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity ${isUser ? '' : 'px-1'}`}>
        <button
          onClick={() => onCopy(message.id, message.role === 'assistant' ? cleanContent : message.content)}
          className="p-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Copy"
        >
          <CopyIcon copied={copiedId === message.id} />
        </button>
        {isUser && chatState === 'idle' && (
          <button
            onClick={() => onEditUserMessage(message.id)}
            className="p-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function MessageList({
  activeChat, chatState, streamingContent, pendingSources, pendingGenImages,
  isSearching, isGeneratingImage, queuePosition, networkStats, thinkingElapsed,
  error, tierSwitch, selectedPlanName, copiedId,
  onCopy, onEditUserMessage, onDismissError, onAcceptTierSwitch, onDismissTierSwitch,
  containerRef, endRef, onScroll, onBackgroundClick,
  appearance = 'studio',
}: MessageListProps) {
  const gallery = appearance === 'gallery';
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`flex-1 overflow-y-auto ${gallery ? 'py-10' : 'py-6'}`}
      onClick={onBackgroundClick}
    >
      <div className={gallery
        ? 'max-w-2xl mx-auto px-5 md:px-8 space-y-10 [&_.chat-answer]:leading-[1.9]'
        : 'max-w-3xl mx-auto px-4 md:px-6 space-y-7'}
      >
        {activeChat.messages.length === 0 && chatState === 'idle' && (
          gallery ? (
            <div className="flex flex-col items-center justify-center text-center pt-28">
              <h2 className="pixel-serif text-white/90 text-4xl mb-4">Start the conversation</h2>
              <p className="pixel-sans text-white/40 text-sm max-w-sm leading-relaxed">
                Your prompt runs on {selectedPlanName}, served by GPUs contributed to the network.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center pt-24">
              <h2 className="pixel-serif text-white/90 text-3xl mb-3">Start the conversation</h2>
              <p className="pixel-sans text-white/45 text-sm max-w-sm">
                Your prompt runs on {selectedPlanName}, served by GPUs contributed to the network.
              </p>
            </div>
          )
        )}

        {activeChat.messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            chatState={chatState}
            copiedId={copiedId}
            onCopy={onCopy}
            onEditUserMessage={onEditUserMessage}
            appearance={appearance}
          />
        ))}

        {/* Streaming message */}
        {streamingContent && (() => {
          const { thinking: streamThinking, response: streamResponse } = parseThinking(filterDisclaimers(streamingContent));
          const isStillThinking = streamThinking !== null && !streamResponse;
          return (
            <div className="msg-in flex flex-col items-start">
              {!gallery && <AssistantLabel pulse />}
              <div className="w-full px-1">
                <SourceStrip sources={pendingSources} />
                {pendingGenImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingGenImages.map((img, i) => (
                      <img key={i} src={`data:image/png;base64,${img}`} alt="Generated" className="max-w-[320px] max-h-[320px] rounded-xl border border-white/10" />
                    ))}
                  </div>
                )}
                {streamResponse && (
                  <MessageMarkdown
                    content={streamResponse}
                    sources={pendingSources}
                    trailing={<span className="inline-block w-1.5 h-4 bg-white/50 ml-1 animate-pulse rounded-[1px]" />}
                  />
                )}
                {streamThinking && <ThinkingDropdown thinking={streamThinking} isStreaming={isStillThinking} elapsedSeconds={thinkingElapsed ?? undefined} />}
              </div>
            </div>
          );
        })()}

        {/* Search indicator */}
        {isSearching && (
          <div className="flex justify-center">
            <div className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg">
              <p className="pixel-sans text-white/60 text-sm">Searching the web...</p>
            </div>
          </div>
        )}

        {/* Image generation placeholder — skeleton the size of the
            upcoming image with a scanning stripe */}
        {isGeneratingImage && (
          <div className="msg-in flex flex-col items-start">
            <div className="w-full px-1">
              <div className="img-skeleton">
                <span className="img-skeleton-label pixel-sans">generating image...</span>
              </div>
            </div>
          </div>
        )}

        {/* Queue position indicator with estimated wait time */}
        {chatState === 'queued' && queuePosition !== null && queuePosition > 0 && (
          <div className="flex justify-center">
            <div className="px-5 py-3 bg-[#80a0c1]/10 border border-[#80a0c1]/20 rounded-lg">
              <p className="pixel-sans text-[#80a0c1] text-sm">
                You are #{queuePosition} in queue
                {(() => {
                  const waitSec = networkStats?.avgJobDurationMs ? Math.ceil((queuePosition * networkStats.avgJobDurationMs) / 1000) : 0;
                  return waitSec > 0 ? (
                    <span className="text-[#80a0c1]/70 ml-2">· ~{waitSec}s wait</span>
                  ) : null;
                })()}
              </p>
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {chatState === 'streaming' && !streamingContent && (
          <div className="msg-in flex flex-col items-start">
            {!gallery && <AssistantLabel pulse />}
            <div className="flex gap-1 px-1 py-1">
              <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex justify-center">
            <div className="px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
              <p className="pixel-sans text-red-400 text-sm">
                {error.includes('Top up in Settings') ? (
                  <>Not enough credits. Top up in <a href="/settings#usage" className="cursor-pointer underline hover:text-red-300">Settings</a>.</>
                ) : error}
              </p>
              <button
                onClick={onDismissError}
                className="pixel-sans text-red-400/70 text-sm underline mt-1 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* No workers for this model, but another model is online: offer switch */}
        {tierSwitch && (
          <div className="flex justify-center">
            <div className="px-5 py-3 bg-[#80a0c1]/10 border border-[#80a0c1]/20 rounded-lg text-center">
              <p className="pixel-sans text-[#80a0c1] text-sm mb-2">
                No workers online for {selectedPlanName} right now. {tierSwitch.toCount} {tierSwitch.toCount === 1 ? 'worker' : 'workers'} online for {tierSwitch.toLabel}.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={onAcceptTierSwitch}
                  className="cursor-pointer pixel-sans font-medium text-black bg-[#80a0c1] hover:bg-[#80a0c1]/90 text-sm px-4 py-1.5 rounded-lg"
                >
                  Switch to {tierSwitch.toLabel}
                </button>
                <button
                  onClick={onDismissTierSwitch}
                  className="cursor-pointer pixel-sans text-[#80a0c1]/70 text-sm underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
