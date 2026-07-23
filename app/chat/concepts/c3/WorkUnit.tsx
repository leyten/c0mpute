'use client';

// A fulfilled work unit: the request, the fulfilment, and the provenance
// line — the receipt made quiet. Errored units show the honest failure and
// offer a retry.

import { useState } from 'react';
import { ReplyBody, RequestBlock, Square } from './bits';
import { fmtElapsed, type Exchange } from './types';

function ProvenanceItem({ children }: { children: React.ReactNode }) {
  return <span className="pixel-sans text-[11px] uppercase tracking-[0.14em] text-white/35">{children}</span>;
}

function Dot() {
  return <span aria-hidden className="pixel-sans text-[11px] text-white/15">·</span>;
}

export default function WorkUnit({
  index,
  exchange,
  awaitingImage,
  canRetry,
  onRetry,
}: {
  index: number;
  exchange: Exchange;
  awaitingImage: boolean;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const p = exchange.provenance;
  const failed = exchange.status === 'error';

  const copyReply = () => {
    if (!exchange.reply) return;
    const response = exchange.reply.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    navigator.clipboard.writeText(response).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article>
      <RequestBlock index={index} text={exchange.request.text} images={exchange.request.images} />

      <div className="mt-5">
        {exchange.reply && (
          <ReplyBody
            text={exchange.reply.text}
            sources={exchange.reply.sources}
            images={exchange.reply.images}
            streaming={false}
            thinkSeconds={p.thinkSeconds}
            awaitingImage={awaitingImage}
          />
        )}

        {failed && (
          <div className={`rounded-xl border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.05)] p-4 ${exchange.reply ? 'mt-4' : ''}`}>
            <div className="flex items-start gap-2.5">
              <span className="mt-[5px]"><Square tone="fault" size={6} /></span>
              <div className="min-w-0">
                <div className="pixel-sans text-[13px] text-[rgba(248,113,113,0.9)]">
                  {exchange.error || 'The job failed.'}
                </div>
                {exchange.reply && (
                  <div className="pixel-sans mt-1 text-[11px] text-white/35">
                    The partial text above arrived before the failure.
                  </div>
                )}
              </div>
              {canRetry && (
                <button
                  onClick={onRetry}
                  className="pixel-sans ml-auto shrink-0 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-white/30 hover:text-white"
                >
                  retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* the provenance line — model, cost, timing, sources, queue history */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-white/10 pt-2.5">
        <Square tone={failed ? 'fault' : 'done'} size={6} />
        <ProvenanceItem>{p.model}</ProvenanceItem>
        <Dot />
        <ProvenanceItem>{failed ? 'not completed' : p.costLabel}</ProvenanceItem>
        {p.elapsedMs !== null && (
          <>
            <Dot />
            <ProvenanceItem>{fmtElapsed(p.elapsedMs)}</ProvenanceItem>
          </>
        )}
        {p.thinkSeconds !== null && p.thinkSeconds > 0 && (
          <>
            <Dot />
            <ProvenanceItem>thought {p.thinkSeconds}s</ProvenanceItem>
          </>
        )}
        {p.sourcesCount > 0 && (
          <>
            <Dot />
            <ProvenanceItem>{p.sourcesCount} source{p.sourcesCount === 1 ? '' : 's'}</ProvenanceItem>
          </>
        )}
        {p.queuePeak !== null && (
          <>
            <Dot />
            <ProvenanceItem>queued №{p.queuePeak}</ProvenanceItem>
          </>
        )}
        {exchange.reply && (
          <button
            onClick={copyReply}
            className="pixel-sans ml-auto cursor-pointer text-[11px] uppercase tracking-[0.14em] text-white/30 transition-colors hover:text-white/70"
          >
            {copied ? 'copied' : 'copy'}
          </button>
        )}
      </div>
    </article>
  );
}
