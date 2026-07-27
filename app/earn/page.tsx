'use client';

// Earn: two ways to supply the network, side by side.
//
// The browser worker is the on-ramp and the native worker is where the supply
// actually comes from (roughly fifteen native workers for every browser one),
// so neither is a footnote to the other. Each door carries its own state and
// its own control, and the swarm is not a third door: it is what the native
// worker becomes when the new network launches.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from './engine/useWorkerEngine';

const STEEL = '#80a0c1';

/* ---------- pieces ---------- */

function Eyebrow({ children, tone }: { children: React.ReactNode; tone?: 'steel' }) {
  return (
    <span
      className="text-[10px] uppercase tracking-[0.14em]"
      style={{ color: tone === 'steel' ? STEEL : 'rgba(255,255,255,0.4)' }}
    >
      {children}
    </span>
  );
}

function Door({ eyebrow, aside, title, children }: {
  eyebrow: React.ReactNode;
  aside?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-white/[0.07] bg-white/[0.02] p-7 md:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        {eyebrow}
        {aside}
      </div>
      <h2 className="pixel-serif text-[26px] leading-tight text-white">{title}</h2>
      {children}
    </section>
  );
}

/** A live figure. Three at most in a door, and only once there is work to show. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[19px] tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-[12px] text-white/40">{label}</div>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full align-middle"
      style={{ background: on ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.25)' }}
    />
  );
}

function Button({ onClick, disabled, kind = 'solid', children }: {
  onClick: () => void;
  disabled?: boolean;
  kind?: 'solid' | 'quiet';
  children: React.ReactNode;
}) {
  const solid = 'bg-white text-black hover:bg-white/90';
  const quiet = 'border border-white/15 text-white/80 hover:bg-white/[0.06] hover:text-white';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded-xl px-6 py-3 text-[15px] transition-colors disabled:cursor-default disabled:opacity-40 ${kind === 'solid' ? solid : quiet}`}
    >
      {children}
    </button>
  );
}

function Mono({ children }: { children: string }) {
  return (
    <code className="whitespace-nowrap font-mono text-[13px]" style={{ color: STEEL }}>{children}</code>
  );
}

/* ---------- the browser door ---------- */

const PHASE: Record<string, string> = {
  initializing: 'Starting up.',
  downloading: 'Downloading the model.',
  connecting: 'Registering with the network.',
  ready: 'Waiting for the next job.',
  working: 'Serving a job.',
};

function BrowserDoor({ engine }: { engine: ReturnType<typeof useWorkerEngine> }) {
  const { status, device, model, modelFits, loadProgress, error, session, todayEarnings } = engine;
  const running = status !== 'offline' && status !== 'error';
  const blocked = device.webGPUSupported === false;

  const note = blocked
    ? 'This browser cannot run a worker. It needs WebGPU, which Chrome and Edge support on a discrete GPU.'
    : !modelFits && device.detectedVRAM !== null
      ? `This browser estimates ${device.detectedVRAM} GB of video memory, below the ${model.vram} the model needs.`
      : `${model.name}, ${model.size} downloaded once. The tab has to stay open while it serves.`;

  return (
    <Door
      eyebrow={<Eyebrow>In this browser</Eyebrow>}
      aside={running ? <span className="text-[12px] text-white/45"><Dot on={status === 'working' || status === 'ready'} /> {PHASE[status] ?? ''}</span> : null}
      title="Start in a tab"
    >
      <p className="mt-2 text-[15px] leading-relaxed text-white/60">{note}</p>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* the engine states the rate as '$0.07/job'; split it rather than restate it */}
        <span className="pixel-serif text-[28px] text-white">{model.payout.split('/')[0]}</span>
        <span className="text-[13px] text-white/45">per job</span>
      </div>

      {status === 'downloading' && (
        <div className="mt-5">
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(loadProgress * 100)}%`, background: STEEL }} />
          </div>
          <div className="mt-2 text-[12px] tabular-nums text-white/40">{Math.round(loadProgress * 100)}%</div>
        </div>
      )}

      {(status === 'ready' || status === 'working') && (
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
          <Stat label="Jobs this session" value={String(session.jobsCompleted)} />
          <Stat label="Tokens served" value={session.tokensGenerated.toLocaleString()} />
          <Stat label="Earned today" value={todayEarnings === null ? '—' : `$${todayEarnings.toFixed(2)}`} />
        </div>
      )}

      {error && <p className="mt-5 text-[13px]" style={{ color: '#fca5a5' }}>{error}</p>}

      <div className="mt-7 pt-1">
        {!engine.isAuthenticated ? (
          <Button onClick={engine.login}>Sign in to start</Button>
        ) : running ? (
          <Button kind="quiet" onClick={engine.stop}>Stop</Button>
        ) : (
          <Button onClick={engine.start} disabled={blocked}>Start earning</Button>
        )}
      </div>
    </Door>
  );
}

/* ---------- the native door ---------- */

const NODE_INSTALL = {
  macos: 'brew install node',
  windows: 'winget install OpenJS.NodeJS',
  linux: 'sudo apt install -y nodejs npm',
} as const;

type Os = keyof typeof NODE_INSTALL;

function NativeDoor({ engine }: { engine: ReturnType<typeof useWorkerEngine> }) {
  const { nativeStatus } = engine;
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [os, setOs] = useState<Os>('macos');

  useEffect(() => {
    const p = (navigator.platform || navigator.userAgent || '').toLowerCase();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p.includes('win')) setOs('windows');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else if (p.includes('linux') || p.includes('android')) setOs('linux');
  }, []);

  const getCommand = useCallback(async () => {
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

  const command = `npx @c0mpute/worker --token ${token ?? 'YOUR_TOKEN'}`;
  const online = nativeStatus?.online === true;

  return (
    <Door
      eyebrow={<Eyebrow tone="steel">On your machine</Eyebrow>}
      aside={online
        ? <span className="text-[12px] text-white/45"><Dot on /> Connected</span>
        : <span className="text-[12px] text-white/35">Runs in the background</span>}
      title="Run a node"
    >
      <p className="mt-2 text-[15px] leading-relaxed text-white/60">
        Serves a 27B model on your own GPU as a background process, so nothing has to stay open.
        Needs Node.js 18 or newer and an NVIDIA, AMD or Apple Silicon GPU.
      </p>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="pixel-serif text-[28px] text-white">$0.10–0.14</span>
        <span className="text-[13px] text-white/45">per job, up to 10x a browser worker</span>
      </div>

      {online && nativeStatus && (
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
          <Stat label="Jobs completed" value={nativeStatus.jobsCompleted.toLocaleString()} />
          <Stat label="Tokens served" value={nativeStatus.tokensGenerated.toLocaleString()} />
          <Stat label="Speed" value={`${nativeStatus.tokPerSec.toFixed(1)} tok/s`} />
        </div>
      )}

      {failed && <p className="mt-5 text-[13px]" style={{ color: '#fca5a5' }}>{failed}</p>}

      <div className="mt-7">
        {!engine.isAuthenticated ? (
          <Button onClick={engine.login}>Sign in to get a command</Button>
        ) : token ? (
          <div className="flex items-center gap-3 overflow-x-auto rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <Mono>{command}</Mono>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(command);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="ml-auto shrink-0 cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <Button onClick={() => void getCommand()} disabled={busy}>
            {busy ? 'Issuing…' : 'Get my command'}
          </Button>
        )}
      </div>

      {token && (
        <p className="mt-3 text-[12px] text-white/35">
          Shown once. Paste it into a terminal.{' '}
          <Link href="/settings#worker" className="underline underline-offset-2 hover:text-white/60">Manage tokens</Link>
        </p>
      )}

      {!token && engine.isAuthenticated && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/35">
          <span>No Node.js?</span>
          {(Object.keys(NODE_INSTALL) as Os[]).map(o => (
            <button
              key={o}
              onClick={() => setOs(o)}
              className={`cursor-pointer rounded-md px-2 py-0.5 transition-colors ${os === o ? 'bg-white/[0.08] text-white/70' : 'hover:text-white/60'}`}
            >
              {o === 'macos' ? 'macOS' : o === 'windows' ? 'Windows' : 'Linux'}
            </button>
          ))}
          <code className="font-mono text-white/45">{NODE_INSTALL[os]}</code>
        </div>
      )}

      {/* The swarm is this same worker, later. Never described as running. */}
      <p className="mt-auto pt-7 text-[13px] leading-relaxed text-white/40">
        When the new network launches, this same worker can join a swarm and serve part of a far
        larger model alongside other machines. Nothing extra to install.
      </p>
    </Door>
  );
}

/* ---------- the page ---------- */

export default function Earn() {
  const engine = useWorkerEngine();

  if (engine.authLoading) {
    return <main className="min-h-dvh" style={{ background: '#0c0a09' }} />;
  }

  return (
    <main className="min-h-dvh px-5 py-16 md:py-24" style={{ background: '#0c0a09' }}>
      <div className="mx-auto w-full max-w-[64rem]">
        <header className="cu-fade max-w-[34rem]">
          <h1 className="pixel-serif text-[34px] leading-[1.15] tracking-[-0.01em] text-white md:text-[42px]">
            Put your GPU to work.
          </h1>
          <p className="mt-3 text-[15px] text-white/55">
            c0mpute runs on machines people own. Lend yours and you are paid in USDC for every job it finishes.
          </p>
        </header>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <BrowserDoor engine={engine} />
          <NativeDoor engine={engine} />
        </div>

        {engine.lifetimeEarned > 0 && (
          <p className="mt-8 text-[13px] text-white/35">
            Earned on this account to date: <span className="tabular-nums text-white/55">${engine.lifetimeEarned.toFixed(2)}</span>
          </p>
        )}
      </div>
    </main>
  );
}
