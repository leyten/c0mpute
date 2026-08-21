'use client';

// Pieces the three earn layouts share, so each variant file is only its layout.
import { useCallback, useEffect, useState } from 'react';
import type { useWorkerEngine } from './engine/useWorkerEngine';
import SiteNav from '@/components/SiteNav';

export type Engine = ReturnType<typeof useWorkerEngine>;

export const STEEL = 'var(--steel)';
export const BG = 'var(--background)';

export const PHASE: Record<string, string> = {
  initializing: 'Starting up',
  downloading: 'Downloading the model',
  connecting: 'Registering',
  ready: 'Waiting for a job',
  working: 'Serving a job',
};

export const NATIVE_RATE = '$0.10–0.14';
export const SWARM_NOTE = 'When the new network launches, the same command joins a swarm.';

export function Eyebrow({ children, tone }: { children: React.ReactNode; tone?: 'steel' }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: tone === 'steel' ? STEEL : 'var(--fg-40)' }}>
      {children}
    </span>
  );
}

export function Dot({ on }: { on: boolean }) {
  return <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: on ? 'var(--live)' : 'var(--fg-25)' }} />;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[18px] tabular-nums text-fg">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-fg-40">{label}</div>
    </div>
  );
}

export function Button({ onClick, disabled, kind = 'solid', children }: {
  onClick: () => void; disabled?: boolean; kind?: 'solid' | 'quiet'; children: React.ReactNode;
}) {
  const look = kind === 'solid'
    ? 'bg-fg text-on-fg hover:bg-fg/90'
    : 'border border-fg/15 text-fg-80 hover:bg-fg/[0.06] hover:text-fg';
  return (
    <button onClick={onClick} disabled={disabled}
      className={`cursor-pointer rounded-xl px-5 py-2.5 text-[14.5px] transition-colors disabled:cursor-default disabled:opacity-40 ${look}`}>
      {children}
    </button>
  );
}

/** What the browser worker costs the visitor, in one sentence. */
export function browserNote(engine: Engine): string {
  const { device, model } = engine;
  if (device.webGPUSupported === false) return 'This browser cannot run a worker. It needs WebGPU.';
  return `${model.name}, ${model.size} downloaded once. The tab stays open while it serves.`;
}

/** Token issuing, the run command and the copy button, shared by all three. */
export function useNativeCommand(engine: Engine) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const issue = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    try {
      const access = await engine.getAccessToken();
      if (!access) { setFailed('Sign in first.'); return; }
      const res = await fetch('/api/worker-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'cli' }),
      });
      const data = await res.json();
      if (!res.ok) { setFailed(data.error || 'Could not issue a token.'); return; }
      setToken(data.token);
    } catch {
      setFailed('Could not issue a token.');
    } finally {
      setBusy(false);
    }
  }, [engine]);

  const command = `npx @compute-network/worker --token ${token ?? 'YOUR_TOKEN'}`;
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [command]);

  return { token, busy, copied, failed, issue, command, copy };
}

/** The run command in a box, with copy. */
export function CommandBox({ command, copied, onCopy }: { command: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto rounded-xl border border-fg/10 bg-recess-soft px-4 py-2.5">
      <code className="whitespace-nowrap font-mono text-[12.5px]" style={{ color: STEEL }}>{command}</code>
      <button onClick={onCopy}
        className="ml-auto shrink-0 cursor-pointer rounded-lg border border-fg/10 px-2.5 py-1 text-[11.5px] text-fg-70 transition-colors hover:bg-fg/[0.06] hover:text-fg">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** One screen, never scrolled on a desktop. A phone still scrolls, or the page
 *  would be unusable at 390px. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: BG }}>
      <SiteNav />
      {/* the nav is fixed, so the page starts below it */}
      <main className="flex min-h-dvh flex-col overflow-y-auto pt-[70px] md:pt-[88px] md:h-dvh md:overflow-hidden">
        {children}
      </main>
    </div>
  );
}

export function useEarnControls(engine: Engine) {
  const running = engine.status !== 'offline' && engine.status !== 'error';
  const blocked = engine.device.webGPUSupported === false;
  return { running, blocked };
}

export function usePlatform() {
  const [os, setOs] = useState<'macos' | 'windows' | 'linux'>('macos');
  useEffect(() => {
    const p = (navigator.platform || navigator.userAgent || '').toLowerCase();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p.includes('win')) setOs('windows');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else if (p.includes('linux') || p.includes('android')) setOs('linux');
  }, []);
  return os;
}

export const NODE_INSTALL = {
  macos: 'brew install node',
  windows: 'winget install OpenJS.NodeJS',
  linux: 'sudo apt install -y nodejs npm',
} as const;
