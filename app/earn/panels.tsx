'use client';

// Presentational panels for the /earn worker dashboard. Pure props in, markup
// out. All worker logic (engine, socket, API calls) lives in page.tsx.

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { NetworkStats } from '@/lib/orchestrator/types';

export const ACCENT = '#80a0c1';
export const GREEN = 'rgba(52, 211, 153, 1)';

/* ---------------------------------------------------------------- stage rail */

const STAGES = ['Idle', 'Download', 'Ready', 'Serving'] as const;

export function StageRail({ stage, errored }: { stage: number; errored?: boolean }) {
  return (
    <div className="flex items-start w-full max-w-lg">
      {STAGES.map((label, i) => {
        const done = i < stage;
        const current = i === stage;
        const dotStyle: CSSProperties = current
          ? errored
            ? { backgroundColor: 'rgba(248,113,113,0.9)', boxShadow: '0 0 0 4px rgba(248,113,113,0.12)' }
            : i === 3
              ? { backgroundColor: GREEN, boxShadow: '0 0 0 4px rgba(52,211,153,0.15)' }
              : i === 2
                ? { backgroundColor: GREEN, boxShadow: '0 0 0 4px rgba(52,211,153,0.15)' }
                : { backgroundColor: ACCENT, boxShadow: '0 0 0 4px rgba(128,160,193,0.15)' }
          : done
            ? { backgroundColor: 'rgba(128,160,193,0.55)' }
            : { backgroundColor: 'rgba(255,255,255,0.12)' };
        return (
          <Fragment key={label}>
            {i > 0 && (
              <div
                className="flex-1 h-px mt-[5px] mx-1.5"
                style={{ backgroundColor: i <= stage ? 'rgba(128,160,193,0.4)' : 'rgba(255,255,255,0.08)' }}
              />
            )}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full transition-colors" style={dotStyle} />
              <span
                className={`pixel-sans text-[10px] uppercase tracking-[0.14em] ${
                  current ? 'text-white' : done ? 'text-white/55' : 'text-white/30'
                }`}
              >
                {label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- metric tile */

export function MetricTile({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col justify-center px-5 py-4 bg-white/[0.02] border border-white/5 rounded-xl min-h-[86px]">
      <div className={`pixel-serif text-white text-xl md:text-2xl whitespace-nowrap ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
      <div className="pixel-sans text-white/50 text-xs mt-1.5">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ earnings */

export interface SessionJob {
  id: string;
  at: number;
  tokens: number;
  ms: number;
  status: 'completed' | 'failed';
}

const fmtTime = (at: number) =>
  new Date(at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function EarningsPanel({
  lifetimeEarned,
  todayEarnings,
  paidJobs,
  totalTokens,
  browserRate,
  jobs,
}: {
  lifetimeEarned: number;
  todayEarnings: number | null;
  paidJobs: number | null;
  totalTokens: number | null;
  browserRate: string;
  jobs: SessionJob[];
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-7 md:p-8 flex flex-col">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="pixel-serif text-white text-2xl">Earnings</h2>
        <span className="pixel-sans text-white/40 text-xs">Paid in USDC</span>
      </div>

      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <div className="pixel-serif text-white text-4xl md:text-5xl leading-none">
            <span className="dollar">$</span>
            {lifetimeEarned.toFixed(2)}
          </div>
          <div className="pixel-sans text-white/50 text-xs mt-2">Lifetime</div>
        </div>
        <div>
          <div className="pixel-serif text-white/90 text-2xl leading-none">
            <span className="dollar">$</span>
            {(todayEarnings ?? 0).toFixed(2)}
          </div>
          <div className="pixel-sans text-white/50 text-xs mt-2">Today</div>
        </div>
        <div>
          <div className="pixel-serif text-white/90 text-2xl leading-none">{paidJobs ?? 0}</div>
          <div className="pixel-sans text-white/50 text-xs mt-2">Paid jobs</div>
        </div>
        <div>
          <div className="pixel-serif text-white/90 text-2xl leading-none">{(totalTokens ?? 0).toLocaleString('en-US')}</div>
          <div className="pixel-sans text-white/50 text-xs mt-2">Tokens generated</div>
        </div>
      </div>

      <div className="mt-7 pt-6 border-t border-white/10 flex-1">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="pixel-sans text-white/70 text-sm">Recent jobs</h3>
          <span className="pixel-sans text-white/35 text-xs">This session</span>
        </div>

        {jobs.length === 0 ? (
          <p className="pixel-sans text-white/40 text-sm py-6">
            Jobs served by this machine will appear here as they complete. Browser jobs pay {browserRate}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="pixel-sans text-white/40 text-xs font-normal py-2 pr-4">Time</th>
                  <th className="pixel-sans text-white/40 text-xs font-normal py-2 pr-4">Job</th>
                  <th className="pixel-sans text-white/40 text-xs font-normal py-2 pr-4 text-right">Tokens</th>
                  <th className="pixel-sans text-white/40 text-xs font-normal py-2 pr-4 text-right">Duration</th>
                  <th className="pixel-sans text-white/40 text-xs font-normal py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={`${j.id}-${j.at}`} className="border-t border-white/5">
                    <td className="pixel-sans text-white/60 text-xs py-2.5 pr-4 whitespace-nowrap">{fmtTime(j.at)}</td>
                    <td className="pixel-sans text-white/60 text-xs py-2.5 pr-4 font-mono">{j.id.slice(0, 8)}</td>
                    <td className="pixel-sans text-white/80 text-xs py-2.5 pr-4 text-right">{j.tokens}</td>
                    <td className="pixel-sans text-white/60 text-xs py-2.5 pr-4 text-right">{(j.ms / 1000).toFixed(1)}s</td>
                    <td className="py-2.5 text-right">
                      <span
                        className="pixel-sans text-xs inline-flex items-center gap-1.5"
                        style={{ color: j.status === 'completed' ? GREEN : 'rgba(248,113,113,0.85)' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- device */

function DeviceRow({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="pixel-sans text-white/45 text-xs shrink-0">{label}</span>
      <span className="pixel-sans text-white/80 text-xs text-right truncate" title={title}>
        {value}
      </span>
    </div>
  );
}

export function DevicePanel({
  gpuInfo,
  gpuVendor,
  gpuArchitecture,
  detectedVRAM,
  webGPUSupported,
  modelName,
  modelSize,
  modelVram,
  modelRate,
  fits,
}: {
  gpuInfo: string | null;
  gpuVendor: string | null;
  gpuArchitecture: string | null;
  detectedVRAM: number | null;
  webGPUSupported: boolean | null;
  modelName: string;
  modelSize: string;
  modelVram: string;
  modelRate: string;
  fits: boolean;
}) {
  const gpuTitle = gpuInfo
    ? `${gpuInfo}${gpuVendor ? ` (${gpuVendor})` : ''}${gpuArchitecture ? ` [${gpuArchitecture}]` : ''}`
    : undefined;

  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="pixel-serif text-white text-xl">This device</h3>
        <span
          className={`pixel-sans text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded-md border ${
            webGPUSupported === null
              ? 'text-white/40 border-white/10'
              : webGPUSupported
                ? 'text-[#80a0c1] border-[#80a0c1]/30 bg-[#80a0c1]/10'
                : 'text-red-400 border-red-500/30 bg-red-500/10'
          }`}
        >
          {webGPUSupported === null ? 'Checking' : webGPUSupported ? 'WebGPU ready' : 'WebGPU missing'}
        </span>
      </div>

      <div className="divide-y divide-white/5">
        <DeviceRow label="Graphics" value={gpuInfo ?? 'Not detected'} title={gpuTitle} />
        {(gpuVendor || gpuArchitecture) && (
          <DeviceRow label="Vendor" value={[gpuVendor, gpuArchitecture].filter(Boolean).join(' / ')} />
        )}
        <DeviceRow label="Memory" value={detectedVRAM !== null ? `~${detectedVRAM} GB (estimated)` : 'Unknown'} />
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="pixel-sans text-white/45 text-[10px] uppercase tracking-[0.12em] mb-2">Assigned model</div>
        <div className="pixel-sans text-white text-sm mb-1">{modelName}</div>
        <div className="divide-y divide-white/5">
          <DeviceRow label="Download" value={modelSize} />
          <DeviceRow label="VRAM required" value={modelVram} />
          <DeviceRow label="Rate" value={modelRate} />
        </div>
        <p className={`pixel-sans text-xs mt-3 ${fits ? 'text-white/50' : 'text-amber-400/90'}`}>
          {fits
            ? 'This model fits the detected memory on your GPU.'
            : 'Detected memory may be below what this model needs. It can still be attempted.'}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- network */

function NetworkRing({
  workersOnline,
  nativeWorkers,
  isWorkerActive,
}: {
  workersOnline: number;
  nativeWorkers: number;
  isWorkerActive: boolean;
}) {
  const positions: { x: number; y: number }[] = [];
  const radius = 58;
  const cx = 100;
  const cy = 72;
  const shown = Math.min(workersOnline, 8);
  for (let i = 0; i < shown; i++) {
    const angle = (i / Math.max(workersOnline, 8)) * 2 * Math.PI - Math.PI / 2;
    positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  const browserCount = workersOnline - nativeWorkers;

  return (
    <svg viewBox="0 0 200 150" className="w-full h-full">
      {positions.map((pos, i) => (
        <line
          key={`l-${i}`}
          x1={cx}
          y1={cy}
          x2={pos.x}
          y2={pos.y}
          stroke={i === 0 && isWorkerActive ? GREEN : 'white'}
          strokeOpacity={i === 0 && isWorkerActive ? 0.35 : 0.08}
          strokeWidth="1"
          strokeDasharray="2,3"
        />
      ))}

      <circle cx={cx} cy={cy} r="14" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.25" />
      <circle cx={cx} cy={cy} r="4.5" fill="white" fillOpacity="0.2" />
      <text x={cx} y={cy + 26} textAnchor="middle" className="fill-white/35 text-[7px] font-mono uppercase">
        orchestrator
      </text>

      {positions.map((pos, i) => {
        const isNative = i >= browserCount;
        const isYou = i === 0 && isWorkerActive;
        return (
          <g key={`w-${i}`}>
            {isNative ? (
              <polygon
                points={`${pos.x},${pos.y - 6} ${pos.x + 6},${pos.y} ${pos.x},${pos.y + 6} ${pos.x - 6},${pos.y}`}
                fill={isYou ? GREEN : 'transparent'}
                fillOpacity={isYou ? 0.85 : 0}
                stroke={isYou ? GREEN : ACCENT}
                strokeWidth="1"
                strokeOpacity={isYou ? 0.9 : 0.45}
              />
            ) : (
              <rect
                x={pos.x - 5}
                y={pos.y - 5}
                width="10"
                height="10"
                rx="2.5"
                fill={isYou ? GREEN : 'transparent'}
                fillOpacity={isYou ? 0.85 : 0}
                stroke={isYou ? GREEN : 'white'}
                strokeWidth="1"
                strokeOpacity={isYou ? 0.9 : 0.22}
              />
            )}
            {isYou && (
              <text x={pos.x} y={pos.y - 10} textAnchor="middle" fill={GREEN} className="text-[7px] font-mono">
                you
              </text>
            )}
          </g>
        );
      })}

      {workersOnline > 8 && (
        <text x={cx} y={cy + 40} textAnchor="middle" className="fill-white/30 text-[7px] font-mono">
          +{workersOnline - 8} more
        </text>
      )}
    </svg>
  );
}

export function NetworkPanel({
  stats,
  isConnected,
  isWorkerActive,
}: {
  stats: NetworkStats | null;
  isConnected: boolean;
  isWorkerActive: boolean;
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="pixel-serif text-white text-xl">Network</h3>
        <span className="pixel-sans text-xs flex items-center gap-1.5" style={{ color: isConnected ? GREEN : 'rgba(128,160,193,0.9)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {isConnected ? 'Connected' : 'Connecting'}
        </span>
      </div>

      <div className="h-36">
        <NetworkRing
          workersOnline={stats?.workersOnline || 0}
          nativeWorkers={stats?.nativeWorkers || 0}
          isWorkerActive={isWorkerActive}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2">
        <div>
          <div className="pixel-serif text-white text-lg leading-none">{stats ? stats.workersOnline : '-'}</div>
          <div className="pixel-sans text-white/45 text-[10px] mt-1">Workers</div>
        </div>
        <div>
          <div className="pixel-serif text-white text-lg leading-none">
            {stats ? `${stats.browserWorkers || 0}/${stats.nativeWorkers || 0}` : '-'}
          </div>
          <div className="pixel-sans text-white/45 text-[10px] mt-1">Browser/native</div>
        </div>
        <div>
          <div className="pixel-serif text-white text-lg leading-none">{stats ? stats.jobsInQueue : '-'}</div>
          <div className="pixel-sans text-white/45 text-[10px] mt-1">In queue</div>
        </div>
      </div>
    </div>
  );
}
