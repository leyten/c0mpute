'use client';

// V3: thin strip above the composer stating who serves the selected model
// right now. Data comes only from existing socket state; when the worker
// count is zero or stats haven't arrived, the strip stays hidden (the
// composer's own no-workers note and the queue pill already cover that).

import { NetworkStats } from '@/lib/orchestrator/types';
import { ChatState, Plan, planWorkerCount } from '../../lib';
import { NativeWorkerStatus } from '../types';

interface ServeStripProps {
  networkStats: NetworkStats | null;
  chatState: ChatState;
  queuePosition: number | null;
  selectedPlanObj: Plan;
  nativeStatus: NativeWorkerStatus;
}

export default function ServeStrip({ networkStats, chatState, queuePosition, selectedPlanObj, nativeStatus }: ServeStripProps) {
  if (!networkStats) return null;
  const n = planWorkerCount(selectedPlanObj, networkStats);
  if (n === 0) return null;

  const streaming = chatState === 'streaming';
  const queued = chatState === 'queued' && queuePosition !== null && queuePosition > 0;
  const tokPerSec = nativeStatus?.online && nativeStatus.tokPerSec > 0 ? nativeStatus.tokPerSec : null;

  return (
    // relative z-10 lifts the strip above the composer's fade gradient,
    // which is absolutely positioned over this exact zone.
    <div className="relative z-10 px-4">
      <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 pb-1.5">
        <span className={`w-1.5 h-1.5 bg-emerald-400/90 ${streaming ? 'animate-pulse' : ''}`} />
        <span className="pixel-sans text-white/40 text-[11px]">
          {streaming ? 'serving now' : `served by ${n} ${n === 1 ? 'worker' : 'workers'}`}
          <span className="text-white/25"> · {selectedPlanObj.name}</span>
        </span>
        {streaming && tokPerSec !== null && (
          <span className="pixel-sans text-white/60 text-[11px] tabular-nums">{tokPerSec.toFixed(1)} tok/s</span>
        )}
        {queued && (
          <span className="pixel-sans text-[11px] px-2 py-0.5 rounded-full border border-[#80a0c1]/25 bg-[#80a0c1]/[0.08] text-[#80a0c1]">
            #{queuePosition} in queue
          </span>
        )}
      </div>
    </div>
  );
}
