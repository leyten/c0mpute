'use client';

// V3 mobile stage: below lg the right-pane map collapses into this slim band
// above the composer — the six ring squares in miniature plus real counts.
// Same honesty rules as the stage: only fields that exist are shown.

import { NetworkStats } from '@/lib/orchestrator/types';
import { ChatState } from '../../lib';
import { NativeWorkerStatus } from '../types';

interface StageStripProps {
  networkStats: NetworkStats | null;
  isConnected: boolean;
  chatState: ChatState;
  queuePosition: number | null;
  nativeStatus: NativeWorkerStatus;
}

export default function StageStrip({ networkStats, isConnected, chatState, queuePosition, nativeStatus }: StageStripProps) {
  const streaming = chatState === 'streaming';
  const queued = chatState === 'queued' && queuePosition !== null && queuePosition > 0;
  const tokPerSec = nativeStatus?.online && nativeStatus.tokPerSec > 0 ? nativeStatus.tokPerSec : null;

  return (
    // relative z-10 lifts the strip above the composer's fade gradient,
    // which is absolutely positioned over this exact zone.
    <div className="lg:hidden relative z-10 shrink-0 border-t border-white/10 bg-[#0a0908] px-4 h-9 flex items-center gap-3">
      <style>{'@keyframes v3StripPulse{0%,100%{opacity:.3}50%{opacity:1}}@media (prefers-reduced-motion: reduce){.v3-strip-dot{animation:none !important}}'}</style>
      <span className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em] shrink-0">network</span>

      {/* The six-city ring, compressed to its squares */}
      <span className="flex items-center gap-1 shrink-0">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`v3-strip-dot w-1.5 h-1.5 ${isConnected ? 'bg-emerald-400' : 'bg-white/25'}`}
            style={
              streaming
                ? { animation: `v3StripPulse 1.2s linear ${i * 0.15}s infinite` }
                : { opacity: isConnected ? 0.55 : 1 }
            }
          />
        ))}
      </span>

      <span className="flex-1" />

      <span className="pixel-sans text-[10px] whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
        {!isConnected ? (
          <span className="text-white/50">connecting...</span>
        ) : streaming ? (
          <span className="text-emerald-300/80">
            serving{tokPerSec !== null && <span className="text-white/70 tabular-nums"> · {tokPerSec.toFixed(1)} tok/s</span>}
          </span>
        ) : queued ? (
          <span className="text-[#80a0c1]">#{queuePosition} in queue</span>
        ) : networkStats ? (
          <span className="text-white/45 tabular-nums">
            {networkStats.workersOnline} workers · {networkStats.jobsInQueue} queued
          </span>
        ) : null}
      </span>

      <a
        href="https://shard.c0mpute.ai"
        target="_blank"
        rel="noreferrer"
        className="hidden min-[420px]:inline pixel-sans text-[10px] text-white/35 hover:text-[#80a0c1] transition-colors shrink-0 cursor-pointer"
      >
        testbed →
      </a>
    </div>
  );
}
