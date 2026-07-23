'use client';

// Top bar of the chat column: sidebar toggle, wordmark (when the sidebar is
// hidden), active chat title, and the credit chips / sign-in entry points.

import Link from 'next/link';

interface HeaderBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeChatTitle: string | null;
  isAuthenticated: boolean;
  freePromptsRemaining: number;
  stakeAllowanceLeft: number;
  creditBalance: number;
  anonRemaining: number | null;
  onLogin: () => void;
  onOpenUsage: () => void;
  onOpenStaking: () => void;
}

export default function HeaderBar({
  sidebarOpen, onToggleSidebar, activeChatTitle,
  isAuthenticated, freePromptsRemaining, stakeAllowanceLeft, creditBalance,
  anonRemaining, onLogin, onOpenUsage, onOpenStaking,
}: HeaderBarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-white/10 flex items-center gap-2 px-3 md:px-4">
      <button
        onClick={onToggleSidebar}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
        className="p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer shrink-0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      </button>

      {/* Wordmark appears here whenever the sidebar (which carries it) is hidden */}
      <Link
        href="/"
        className={`cursor-pointer pixel-serif-logo text-white text-lg whitespace-nowrap ${sidebarOpen ? 'md:hidden' : ''}`}
      >
        c<span>0</span>mpute
      </Link>

      <div className="flex-1 min-w-0 px-2 hidden md:block">
        {activeChatTitle && (
          <p className="pixel-sans text-white/45 text-sm truncate">{activeChatTitle}</p>
        )}
      </div>
      <div className="flex-1 md:hidden" />

      <div className="flex items-center gap-2 shrink-0">
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
