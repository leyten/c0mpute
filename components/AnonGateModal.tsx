'use client';

import { useBrand } from '@/components/BrandProvider';

// Popup shown to anonymous (not-logged-in) visitors at the three free-prompt
// boundaries:
//   nudge     — they have 1 free prompt left (dismissible, gentle).
//   empty     — they've used all free prompts; sign in + top up to continue.
//   softlogin — free prompts are unavailable right now (daily budget reached),
//               or the homepage is steering them to sign in.
interface AnonGateModalProps {
  mode: 'nudge' | 'empty' | 'softlogin';
  freePromptLimit: number;
  onClose: () => void;
  onSignIn: () => void;
}

const COPY = {
  nudge: {
    title: '1 free prompt left',
    body: 'Make a free account to keep going. Sign in with X and top up only when you want more.',
    primary: 'Make an account',
    secondary: 'Use my last one',
  },
  empty: {
    title: "You're out of free prompts",
    body: 'Sign in with X to create your account and top up to keep chatting. Signing in is free.',
    primary: 'Sign in & top up',
    secondary: 'Maybe later',
  },
  softlogin: {
    title: 'Try c0mpute free',
    body: 'Sign in with X to get your free prompts.',
    primary: 'Sign in with X',
    secondary: 'Not now',
  },
} as const;

export default function AnonGateModal({ mode, freePromptLimit, onClose, onSignIn }: AnonGateModalProps) {
  const brand = useBrand();
  const c = COPY[mode];
  const title = mode === 'softlogin' ? `Try ${brand.short} free` : c.title;
  const body = mode === 'softlogin'
    ? `Sign in with X to get ${freePromptLimit} free prompts.`
    : c.body;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim-strong backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-fg/10 bg-raise p-7 shadow-2xl">
        <div className="pixel-serif text-fg text-2xl mb-3">{title}</div>
        <p className="pixel-sans text-fg-70 text-sm leading-relaxed mb-6">{body}</p>
        <button
          onClick={onSignIn}
          className="w-full pixel-serif py-3 rounded-xl bg-fg text-on-fg hover:bg-fg/90 transition-colors cursor-pointer mb-2"
        >
          {c.primary}
        </button>
        <button
          onClick={onClose}
          className="w-full pixel-sans py-2 text-fg-40 hover:text-fg-70 text-sm transition-colors cursor-pointer"
        >
          {c.secondary}
        </button>
      </div>
    </div>
  );
}
