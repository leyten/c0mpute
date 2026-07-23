'use client';

// The thin line of truth under the composer: connection, model + workers,
// thinking state, activity, cost, credits or the anon allowance, and the
// palette hint. Every chip is a control; each opens the palette or navigates.

import type { Instrument } from './useInstrument';

function Chip({ onClick, title, children }: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!onClick) return <span title={title} className="flex items-center gap-1.5">{children}</span>;
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-white/85"
    >
      {children}
    </button>
  );
}

export default function StatusLine({ inst, modKey, openPalette, navigate }: {
  inst: Instrument;
  modKey: string;
  openPalette: (query?: string) => void;
  navigate: (path: string) => void;
}) {
  const { engine, currentPlan, currentThink, turn, activeThread } = inst;
  const workers = engine.workerCount(currentPlan);
  const { balance, freePrompts, freeLimit, stakerAllowance } = engine.credits;

  const generatingElsewhere = turn && turn.threadId !== (activeThread?.id ?? '');
  const elsewhereTitle = generatingElsewhere
    ? inst.threads.find(t => t.id === turn.threadId)?.title ?? 'another conversation'
    : null;

  return (
    <div className="pixel-sans mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/40">
      <Chip title={engine.demo ? 'Preview demo network' : engine.live ? 'Connected to the network' : 'Not connected'}>
        <span className={`h-1.5 w-1.5 rounded-full ${engine.live ? 'bg-emerald-400/90' : engine.connected ? 'bg-white/40' : 'bg-white/20'}`} />
        {engine.live ? 'live' : engine.demo ? 'demo' : 'offline'}
      </Chip>

      <Chip onClick={() => openPalette('model')} title="Switch model">
        {currentPlan.name.toLowerCase()}
        <span className="text-white/25">{workers} worker{workers === 1 ? '' : 's'}</span>
      </Chip>

      {currentPlan.thinking && (
        <Chip onClick={inst.toggleThink} title="Toggle deep thinking">
          thinking {currentThink ? 'on' : 'off'}
        </Chip>
      )}

      {turn && (
        <span className="flex items-center gap-1.5 text-white/55">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
          {turn.queuePos !== null && turn.queuePos > 0
            ? `queue position ${turn.queuePos}`
            : generatingElsewhere
              ? `generating in "${elsewhereTitle}"`
              : 'generating'}
        </span>
      )}

      <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <span title="Cost per prompt on this model">{currentPlan.costLabel} / prompt</span>

        {engine.isAuthenticated ? (
          <>
            <Chip onClick={() => navigate('/settings#usage')} title="Usage and credits">
              {freePrompts !== null && freePrompts > 0
                ? `${freePrompts}${freeLimit !== null ? `/${freeLimit}` : ''} free left`
                : balance !== null
                  ? `${balance} cr`
                  : 'credits'}
            </Chip>
            {stakerAllowance > 0 && (
              <Chip onClick={() => navigate('/staking')} title="Staker inference allowance">
                +{stakerAllowance} staked
              </Chip>
            )}
          </>
        ) : (
          <>
            {engine.anonRemaining !== null && (
              <span title="Free prompts before sign-in">{engine.anonRemaining} free left</span>
            )}
            <Chip onClick={() => engine.login()} title="Sign in">sign in</Chip>
          </>
        )}

        <button
          onClick={() => openPalette()}
          title="Command palette"
          className="hidden cursor-pointer items-center gap-1 transition-colors hover:text-white/85 sm:flex"
        >
          <kbd className="rounded border border-white/15 px-1 py-px text-[10px]">{modKey}K</kbd>
        </button>
      </span>
    </div>
  );
}
