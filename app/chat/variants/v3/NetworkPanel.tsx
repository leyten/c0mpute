'use client';

// V3 sidebar footer: the concrete network panel. Every number comes straight
// from the existing socket state (networkStats / nativeStatus) — rows for
// which no data exists are omitted, never faked. Green squares echo the
// homepage map's live-worker language.

import { NetworkStats } from '@/lib/orchestrator/types';
import { ChatState, PLANS, planWorkerCount } from '../../lib';
import { NativeWorkerStatus } from '../types';

function fmtCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

interface NetworkPanelProps {
  networkStats: NetworkStats | null;
  isConnected: boolean;
  chatState: ChatState;
  nativeStatus: NativeWorkerStatus;
}

export default function NetworkPanel({ networkStats, isConnected, chatState, nativeStatus }: NetworkPanelProps) {
  const streaming = chatState === 'streaming';
  const tokPerSec = nativeStatus?.online && nativeStatus.tokPerSec > 0 ? nativeStatus.tokPerSec : null;

  return (
    <div className="shrink-0 border-t border-white/10 px-5 py-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em]">network</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 ${isConnected ? 'bg-emerald-400' : 'bg-white/25'}`} />
          <span className={`pixel-sans text-[11px] ${isConnected ? 'text-emerald-300/80' : 'text-white/50'}`}>
            {isConnected ? 'connected' : 'connecting...'}
          </span>
        </span>
      </div>

      {/* Workers online, per model — only once stats have arrived */}
      {networkStats && (
        <div className="space-y-1.5">
          {PLANS.map((plan) => {
            const count = planWorkerCount(plan, networkStats);
            return (
              <div key={plan.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 shrink-0 ${count > 0 ? 'bg-emerald-400/90' : 'bg-white/20'}`} />
                  <span className="pixel-sans text-white/50 text-xs truncate">{plan.name}</span>
                </span>
                <span className={`pixel-sans text-xs tabular-nums ${count > 0 ? 'text-white/80' : 'text-white/35'}`}>{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {networkStats && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="pixel-sans text-white/40 text-xs">Jobs in queue</span>
            <span className="pixel-sans text-white/80 text-xs tabular-nums">{networkStats.jobsInQueue}</span>
          </div>
          {networkStats.avgJobDurationMs > 0 && (
            <div className="flex items-center justify-between">
              <span className="pixel-sans text-white/40 text-xs">Avg job time</span>
              <span className="pixel-sans text-white/80 text-xs tabular-nums">{(networkStats.avgJobDurationMs / 1000).toFixed(1)}s</span>
            </div>
          )}
          {networkStats.tokensGenerated > 0 && (
            <div className="flex items-center justify-between">
              <span className="pixel-sans text-white/40 text-xs">Tokens served</span>
              <span className="pixel-sans text-white/80 text-xs tabular-nums">{fmtCount(networkStats.tokensGenerated)}</span>
            </div>
          )}
        </div>
      )}

      {/* Live serving indicator — only while a response is streaming */}
      {streaming && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
              <span className="pixel-sans text-emerald-300/80 text-xs">serving your request</span>
            </span>
            {tokPerSec !== null && (
              <span className="pixel-sans text-white/80 text-xs tabular-nums">{tokPerSec.toFixed(1)} tok/s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
