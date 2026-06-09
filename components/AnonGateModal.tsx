'use client';

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
    body: 'Make a free account to keep going. Sign in with X — no card, no crypto — and top up only when you want more.',
    primary: 'Make an account',
    secondary: 'Use my last one',
  },
  empty: {
    title: "You're out of free prompts",
    body: 'Sign in with X to create your account and top up to keep chatting. No card or crypto needed to sign in.',
    primary: 'Sign in & top up',
    secondary: 'Maybe later',
  },
  softlogin: {
    title: 'Try c0mpute free',
    body: 'Sign in with X to get free prompts — no card, no crypto needed.',
    primary: 'Sign in with X',
    secondary: 'Not now',
  },
} as const;

export default function AnonGateModal({ mode, freePromptLimit, onClose, onSignIn }: AnonGateModalProps) {
  const c = COPY[mode];
  const body = mode === 'softlogin'
    ? `Sign in with X to get ${freePromptLimit} free prompts — no card, no crypto needed.`
    : c.body;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0a] p-7 shadow-2xl">
        <div className="pixel-sans text-white text-xl font-bold mb-3">{c.title}</div>
        <p className="pixel-sans text-white/70 text-sm leading-relaxed mb-6">{body}</p>
        <button
          onClick={onSignIn}
          className="w-full pixel-serif py-3 rounded-xl bg-white text-black hover:bg-white/90 transition-colors cursor-pointer mb-2"
        >
          {c.primary}
        </button>
        <button
          onClick={onClose}
          className="w-full pixel-sans py-2 text-white/40 hover:text-white/70 text-sm transition-colors cursor-pointer"
        >
          {c.secondary}
        </button>
      </div>
    </div>
  );
}
