'use client';

// Concept 1 — "The Instrument". A chat you play, not an app you navigate:
// one conversation in focus, a composer, a thin status line of truth, and a
// command palette (Cmd/Ctrl+K) as the entire control surface. Persistent
// chrome is one hairline header. Typing anywhere lands in the composer.

import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInstrument } from './useInstrument';
import Palette from './Palette';
import Transcript from './Transcript';
import Composer from './Composer';
import StatusLine from './StatusLine';

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`pixel-serif ${className ?? ''}`}>
      c<span>0</span>mpute
    </span>
  );
}

// Client-only platform detection without hydration mismatch: the server
// snapshot says non-Mac, the client snapshot corrects it right after hydration.
const noSubscription = () => () => {};
const isMacClient = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const isMacServer = () => false;

export default function ConceptOne() {
  const router = useRouter();
  const inst = useInstrument();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const isMac = useSyncExternalStore(noSubscription, isMacClient, isMacServer);
  const modKey = isMac ? '⌘' : 'ctrl+';

  const openPalette = useCallback((query = '') => {
    setPaletteQuery(query);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const navigate = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  // Latest instrument for the global key handler without rebinding per render.
  const instRef = useRef(inst);
  useEffect(() => { instRef.current = inst; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette('');
        return;
      }
      if (paletteOpen) return; // the palette owns the keyboard while open
      if (e.key === 'Escape') {
        if (instRef.current.turn) instRef.current.cancel();
        return;
      }
      // Keyboard-first: printable keys land in the composer from anywhere.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        const el = document.activeElement;
        const typing = el instanceof HTMLElement &&
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (!typing) composerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, openPalette, closePalette]);

  // Keep the composer focused across thread switches.
  const activeThreadId = inst.activeThread?.id ?? null;
  useEffect(() => {
    const t = setTimeout(() => composerRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [activeThreadId]);

  const { engine } = inst;

  if (engine.authLoading || !engine.anonReady) {
    return (
      <div className="ui-readable flex h-dvh flex-col items-center justify-center gap-3 bg-[#0c0a09]">
        <Wordmark className="text-2xl text-white/80" />
        <div className="pixel-sans animate-pulse text-xs text-white/35">connecting</div>
      </div>
    );
  }

  // Signed out and the free lane could not issue a session: the engine's hard
  // gate. Sign-in is the only path forward.
  if (!engine.isAuthenticated && engine.anonCapReached) {
    return (
      <div className="ui-readable flex h-dvh items-center justify-center bg-[#0c0a09] px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Wordmark className="text-xl text-white/60" />
          <h1 className="pixel-serif mt-4 text-3xl text-white">Sign in to continue.</h1>
          <p className="pixel-sans mt-3 text-sm leading-relaxed text-white/50">
            The free lane is fully used for now. Sign in to keep prompting the network.
          </p>
          <button
            onClick={() => engine.login()}
            className="pixel-sans mt-6 cursor-pointer rounded-xl bg-white px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            Sign in
          </button>
          <div className="mt-4">
            <Link href="/" className="pixel-sans cursor-pointer text-xs text-white/40 transition-colors hover:text-white">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-readable flex h-dvh flex-col bg-[#0c0a09] text-white">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-4 sm:px-5">
        <Link href="/" className="cursor-pointer transition-opacity hover:opacity-100">
          <Wordmark className="text-[15px] text-white/70" />
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => openPalette('')}
            title="Conversations and commands"
            className="pixel-sans max-w-[45vw] cursor-pointer truncate text-xs text-white/40 transition-colors hover:text-white/80"
          >
            {inst.activeThread ? inst.activeThread.title : 'new conversation'}
          </button>
          <button
            onClick={() => openPalette('')}
            className="pixel-sans cursor-pointer rounded border border-white/15 px-2 py-1 text-xs text-white/60 sm:hidden"
          >
            menu
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Transcript inst={inst} modKey={modKey} />
      </main>

      <footer className="shrink-0 border-t border-white/10">
        <div className="mx-auto w-full max-w-[44rem] px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 sm:px-6">
          <Composer inst={inst} inputRef={composerRef} />
          <StatusLine inst={inst} modKey={modKey} openPalette={openPalette} navigate={navigate} />
        </div>
      </footer>

      {paletteOpen && (
        <Palette
          initialQuery={paletteQuery}
          modKey={modKey}
          onClose={closePalette}
          inst={inst}
          navigate={navigate}
        />
      )}
    </div>
  );
}
