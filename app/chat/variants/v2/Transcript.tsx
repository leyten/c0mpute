'use client';

// V2 "Manuscript" transcript — the conversation set as a typeset document,
// not a message feed. The user's words are pull-quote blocks in serif italic;
// the answers run in the clean body face with generous leading; a short
// hairline separates exchanges. No bubbles, no identity rows, no pills.
// Every transient truth the other shells show survives here, re-voiced:
// queue position, searching, writing, image generation, errors and the
// tier-switch offer all render as lines of the manuscript — visible, never
// hidden. Rendering-correctness pieces (MessageMarkdown, SourceStrip,
// ThinkingDropdown) are reused from the shared components.

import { RefObject } from 'react';
import { ChatWithMessages, Message } from '@/lib/types';
import { NetworkStats } from '@/lib/orchestrator/types';
import {
  ChatState, SourceRef,
  filterDisclaimers, parseSourcesFromContent, parseThinking,
} from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';

interface TranscriptProps {
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
}

// Whisper-quiet time next to a question: clock time today, short date before.
function whisperTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// The short centered hairline that separates exchanges — the manuscript's
// section mark.
function TurnRule() {
  return <div className="mx-auto w-8 h-px bg-white/10" aria-hidden="true" />;
}

// Whisper-quiet hover actions under a block: lowercase text, no icon boxes.
function BlockActions({
  message, cleanContent, chatState, copiedId, onCopy, onEditUserMessage,
}: {
  message: Message;
  cleanContent: string;
  chatState: ChatState;
  copiedId: string | null;
  onCopy: (messageId: string, content: string) => void;
  onEditUserMessage: (messageId: string) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className="flex items-center gap-4 mt-2 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        onClick={() => onCopy(message.id, isUser ? message.content : cleanContent)}
        className="cursor-pointer pixel-sans text-[11px] text-white/30 hover:text-white/70 transition-colors"
      >
        {copiedId === message.id ? 'copied' : 'copy'}
      </button>
      {isUser && chatState === 'idle' && (
        <button
          onClick={() => onEditUserMessage(message.id)}
          className="cursor-pointer pixel-sans text-[11px] text-white/30 hover:text-white/70 transition-colors"
        >
          edit
        </button>
      )}
    </div>
  );
}

function UserTurn({
  message, showRule, chatState, copiedId, onCopy, onEditUserMessage,
}: {
  message: Message;
  showRule: boolean;
  chatState: ChatState;
  copiedId: string | null;
  onCopy: (messageId: string, content: string) => void;
  onEditUserMessage: (messageId: string) => void;
}) {
  const time = whisperTime(message.created_at);
  return (
    <div className="group/msg msg-in">
      {showRule && <div className="mb-12"><TurnRule /></div>}
      {time && (
        <p className="pixel-sans text-[10px] uppercase tracking-[0.16em] text-white/25 mb-2.5">{time}</p>
      )}
      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {message.images.map((img, i) => (
            <img
              key={i}
              src={`data:image/jpeg;base64,${img}`}
              alt="Uploaded"
              className="max-w-[160px] max-h-[160px] rounded-md border border-white/10 object-cover"
            />
          ))}
        </div>
      )}
      <blockquote className="pixel-serif italic text-white/90 text-xl md:text-2xl leading-[1.45] whitespace-pre-wrap">
        {message.content}
      </blockquote>
      <BlockActions
        message={message}
        cleanContent={message.content}
        chatState={chatState}
        copiedId={copiedId}
        onCopy={onCopy}
        onEditUserMessage={onEditUserMessage}
      />
    </div>
  );
}

function AssistantTurn({
  message, chatState, copiedId, onCopy, onEditUserMessage,
}: {
  message: Message;
  chatState: ChatState;
  copiedId: string | null;
  onCopy: (messageId: string, content: string) => void;
  onEditUserMessage: (messageId: string) => void;
}) {
  const { cleanContent: rawContent, sources } = parseSourcesFromContent(message.content);
  const { thinking, response: cleanContent, thinkSeconds } = parseThinking(rawContent);
  return (
    <div className="group/msg msg-in">
      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {message.images.map((img, i) => (
            <img
              key={i}
              src={`data:image/png;base64,${img}`}
              alt="Generated"
              className="max-w-[320px] max-h-[320px] rounded-md border border-white/10"
            />
          ))}
        </div>
      )}
      <SourceStrip sources={sources} content={cleanContent} />
      <MessageMarkdown content={cleanContent} sources={sources} />
      {thinking && <ThinkingDropdown thinking={thinking} elapsedSeconds={thinkSeconds ?? undefined} />}
      <BlockActions
        message={message}
        cleanContent={cleanContent}
        chatState={chatState}
        copiedId={copiedId}
        onCopy={onCopy}
        onEditUserMessage={onEditUserMessage}
      />
    </div>
  );
}

export default function Transcript({
  activeChat, chatState, streamingContent, pendingSources, pendingGenImages,
  isSearching, isGeneratingImage, queuePosition, networkStats, thinkingElapsed,
  error, tierSwitch, selectedPlanName, copiedId,
  onCopy, onEditUserMessage, onDismissError, onAcceptTierSwitch, onDismissTierSwitch,
  containerRef, endRef, onScroll, onBackgroundClick,
}: TranscriptProps) {
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      onClick={onBackgroundClick}
      className="h-full overflow-y-auto pt-24 md:pt-28 pb-56"
    >
      <div className="max-w-[41rem] mx-auto px-6 md:px-8 space-y-10 [&_.chat-answer]:leading-[1.9]">
        {/* The book's first page: one serif line, nothing else */}
        {activeChat.messages.length === 0 && chatState === 'idle' && (
          <p className="pixel-serif italic text-white/85 text-2xl md:text-3xl leading-snug text-center pt-[22vh]">
            Ask, and the network answers.
          </p>
        )}

        {activeChat.messages.map((message, idx) => (
          message.role === 'user' ? (
            <UserTurn
              key={message.id}
              message={message}
              showRule={idx > 0}
              chatState={chatState}
              copiedId={copiedId}
              onCopy={onCopy}
              onEditUserMessage={onEditUserMessage}
            />
          ) : (
            <AssistantTurn
              key={message.id}
              message={message}
              chatState={chatState}
              copiedId={copiedId}
              onCopy={onCopy}
              onEditUserMessage={onEditUserMessage}
            />
          )
        ))}

        {/* The answer being written */}
        {streamingContent && (() => {
          const { thinking: streamThinking, response: streamResponse } = parseThinking(filterDisclaimers(streamingContent));
          const isStillThinking = streamThinking !== null && !streamResponse;
          return (
            <div className="msg-in">
              <SourceStrip sources={pendingSources} />
              {pendingGenImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {pendingGenImages.map((img, i) => (
                    <img key={i} src={`data:image/png;base64,${img}`} alt="Generated" className="max-w-[320px] max-h-[320px] rounded-md border border-white/10" />
                  ))}
                </div>
              )}
              {streamResponse && (
                <MessageMarkdown
                  content={streamResponse}
                  sources={pendingSources}
                  trailing={<span className="inline-block w-[2px] h-4 bg-white/60 ml-1 animate-pulse rounded-[1px]" />}
                />
              )}
              {streamThinking && <ThinkingDropdown thinking={streamThinking} isStreaming={isStillThinking} elapsedSeconds={thinkingElapsed ?? undefined} />}
            </div>
          );
        })()}

        {/* Searching — a line of the manuscript, not a pill */}
        {isSearching && (
          <p className="msg-in pixel-serif italic text-white/45 text-lg">
            searching the web
            <span className="thinking-dots"><span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></span>
          </p>
        )}

        {/* Image generation: the skeleton stays (it is the honest progress
            surface), with its quiet label */}
        {isGeneratingImage && (
          <div className="msg-in">
            <div className="img-skeleton">
              <span className="img-skeleton-label pixel-sans">generating image...</span>
            </div>
          </div>
        )}

        {/* Queue truth — italic, steel, unmissable in the reading column */}
        {chatState === 'queued' && queuePosition !== null && queuePosition > 0 && (
          <p className="msg-in pixel-serif italic text-[#80a0c1] text-lg text-center">
            You are #{queuePosition} in line
            {(() => {
              const waitSec = networkStats?.avgJobDurationMs ? Math.ceil((queuePosition * networkStats.avgJobDurationMs) / 1000) : 0;
              return waitSec > 0 ? <span className="text-[#80a0c1]/70"> · about {waitSec}s</span> : null;
            })()}
          </p>
        )}

        {/* The model has the pen but no words yet */}
        {chatState === 'streaming' && !streamingContent && (
          <p className="msg-in pixel-serif italic text-white/45 text-lg">
            writing
            <span className="thinking-dots"><span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></span>
          </p>
        )}

        {/* Errors are part of the record — hairline-ruled, never hidden */}
        {error && (
          <div className="msg-in border-y border-red-500/25 py-4 text-center">
            <p className="pixel-sans text-red-400 text-sm">
              {error.includes('Top up in Settings') ? (
                <>Not enough credits. Top up in <a href="/settings#usage" className="cursor-pointer underline hover:text-red-300">Settings</a>.</>
              ) : error}
            </p>
            <button
              onClick={onDismissError}
              className="cursor-pointer pixel-sans text-red-400/70 hover:text-red-300 text-xs underline mt-2"
            >
              dismiss
            </button>
          </div>
        )}

        {/* No workers for this model, another model online: the offer, spoken plainly */}
        {tierSwitch && (
          <div className="msg-in text-center">
            <p className="pixel-serif italic text-[#80a0c1] text-lg leading-relaxed">
              No workers are online for {selectedPlanName} right now.
              {' '}{tierSwitch.toCount} {tierSwitch.toCount === 1 ? 'worker is' : 'workers are'} serving {tierSwitch.toLabel}.
            </p>
            <div className="flex items-center justify-center gap-5 mt-3">
              <button
                onClick={onAcceptTierSwitch}
                className="cursor-pointer pixel-sans text-sm text-[#80a0c1] hover:text-white underline underline-offset-4 decoration-[#80a0c1]/40 hover:decoration-white/50 transition-colors"
              >
                switch to {tierSwitch.toLabel}
              </button>
              <button
                onClick={onDismissTierSwitch}
                className="cursor-pointer pixel-sans text-sm text-white/40 hover:text-white/70 underline underline-offset-4 decoration-white/20 transition-colors"
              >
                dismiss
              </button>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
