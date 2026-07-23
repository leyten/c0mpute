'use client';

// V2 header: no sidebar, so this slim row carries everything — wordmark,
// history and new-chat buttons, credit chips, sign-in. Chip logic mirrors
// the V1 HeaderBar exactly (same thresholds, same destinations).

import Link from 'next/link';

interface GalleryHeaderProps {
  isAuthenticated: boolean;
  freePromptsRemaining: number;
  stakeAllowanceLeft: number;
  creditBalance: number;
  anonRemaining: number | null;
  onLogin: () => void;
  onOpenUsage: () => void;
  onOpenStaking: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
}

export default function GalleryHeader({
  isAuthenticated, freePromptsRemaining, stakeAllowanceLeft, creditBalance,
  anonRemaining, onLogin, onOpenUsage, onOpenStaking, onOpenHistory, onNewChat,
}: GalleryHeaderProps) {
  return (
    <header className="h-14 shrink-0 flex items-center gap-2 px-4 md:px-6 border-b border-white/5">
      <Link href="/" className="cursor-pointer pixel-serif-logo text-white text-lg whitespace-nowrap">
        c<span>0</span>mpute
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        <button
          onClick={onOpenHistory}
          title="History"
          aria-label="Open conversation history"
          className="cursor-pointer p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </button>
        <button
          onClick={onNewChat}
          title="New chat"
          aria-label="New chat"
          className="cursor-pointer p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <span className="w-px h-5 bg-white/10 mx-1 hidden md:block" />

        {isAuthenticated ? (
          <>
            {/* Free prompts left — shown while the onboarding allowance lasts */}
            {freePromptsRemaining > 0 && (
              <button
                onClick={onOpenUsage}
                className="cursor-pointer pixel-sans text-xs px-2.5 md:px-3 py-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300/90 hover:bg-emerald-400/[0.1] transition-colors whitespace-nowrap"
              >
                <span className="md:hidden">{freePromptsRemaining} free</span>
                <span className="hidden md:inline">{freePromptsRemaining} free {freePromptsRemaining === 1 ? 'prompt' : 'prompts'} left</span>
              </button>
            )}
            {/* Staker inference allowance — free credits from staked $ZERO, drawn before paid credits */}
            {stakeAllowanceLeft > 0 && (
              <button
                onClick={onOpenStaking}
                title="Free daily inference from your staked $ZERO, used before your paid credits. Refreshes 00:00 UTC."
                className="cursor-pointer pixel-sans text-xs px-2.5 md:px-3 py-1.5 rounded-lg border border-[#80a0c1]/30 bg-[#80a0c1]/[0.06] text-[#80a0c1] hover:bg-[#80a0c1]/[0.1] transition-colors whitespace-nowrap"
              >
                <span className="md:hidden">{stakeAllowanceLeft.toFixed(0)} free</span>
                <span className="hidden md:inline">{stakeAllowanceLeft.toFixed(0)} free credits today</span>
              </button>
            )}
            {/* Credit balance — always visible */}
            <button
              onClick={onOpenUsage}
              className={`cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                creditBalance === 0
                  ? 'border-red-500/20 bg-red-500/[0.04] text-red-400/70 hover:bg-red-500/[0.08]'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
              }`}
            >
              {creditBalance.toFixed(0)} credits
            </button>
          </>
        ) : (
          <>
            {/* Anonymous visitor: free prompts left + a sign-in CTA */}
            {anonRemaining !== null && (
              <span className="pixel-sans text-xs px-2.5 md:px-3 py-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300/90 whitespace-nowrap">
                <span className="md:hidden">{anonRemaining} free</span>
                <span className="hidden md:inline">{anonRemaining} free {anonRemaining === 1 ? 'prompt' : 'prompts'} left</span>
              </span>
            )}
            <button
              onClick={onLogin}
              className="cursor-pointer pixel-sans text-xs font-medium px-4 py-1.5 rounded-lg bg-white text-black hover:bg-white/90 transition-colors whitespace-nowrap"
            >
              Sign in
            </button>
          </>
        )}
      </div>
    </header>
  );
}
