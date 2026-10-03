'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnonGateModal from '@/components/AnonGateModal';
import SiteNav from '@/components/SiteNav';
import LifecycleScroll from '@/components/home/LifecycleScroll';
import HeroBlock from '@/components/home/HeroBlock';
import Doors from '@/components/home/Doors';
import SiteFooter from '@/components/SiteFooter';
import { useAuth } from '@/hooks/useAuth';

// Key for passing prompt to user page
const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';
// Signed anonymous-visitor token (lets new users run free prompts without login)
const ANON_TOKEN_KEY = 'c0mpute_anon_token';
// Referral attribution: code from /r/<code>, stored 30 days, bound at signup
const REF_KEY = 'c0mpute_ref';

export default function Home() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [anonModalOpen, setAnonModalOpen] = useState(false);
  // How many free prompts we advertise. Server-configured (ANON_FREE_PROMPT_LIMIT);
  // /api/anon carries it back, and this only stands in until it answers.
  const [anonFreeLimit, setAnonFreeLimit] = useState(5);

  // Capture referral code from /r/<code> redirects (?ref=...). Last click
  // wins; binding happens server-side at signup, new accounts only.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[a-z0-9]{4,12}$/.test(ref)) {
      localStorage.setItem(REF_KEY, JSON.stringify({ code: ref, at: Date.now() }));
      // Drop ?ref from the URL so it doesn't linger in shares/bookmarks
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const { isLoading, isAuthenticated, login } = useAuth();
  
  // Post-login routing moved to /login (?next=). If an authenticated user
  // lands here, just drop any stale abandoned hero prompt: it's written on
  // every keystroke-submit and survives in localStorage if the chat page
  // never got to consume it, which made later visits ghost-inject it.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      localStorage.removeItem(PENDING_PROMPT_KEY);
    }
  }, [isLoading, isAuthenticated]);
  
  
  const TOKEN_CA = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // Replace with actual CA
  
  const copyCA = () => {
    navigator.clipboard.writeText(TOKEN_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (prompt: string) => {
    if (!prompt.trim()) return;

    // Store the prompt for the user page to pick up
    localStorage.setItem(PENDING_PROMPT_KEY, prompt.trim());

    if (isAuthenticated) {
      // Already logged in — go straight to chat
      router.push('/chat');
      return;
    }

    // Not logged in — get an anonymous free-prompt session so they can try it
    // WITHOUT signing in. Only fall back to the sign-in prompt if the daily free
    // budget is spent (capReached) or the request fails.
    try {
      const existing = localStorage.getItem(ANON_TOKEN_KEY);
      const res = await fetch('/api/anon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: existing || undefined }),
      });
      const data = await res.json();
      if (typeof data.limit === 'number') setAnonFreeLimit(data.limit);
      if (data.capReached || !data.token) {
        setAnonModalOpen(true);
        return;
      }
      localStorage.setItem(ANON_TOKEN_KEY, data.token);
      router.push('/chat');
    } catch {
      setAnonModalOpen(true);
    }
  };

  return (
    <div className="relative bg-background" style={{ overflow: 'visible' }}>
      {anonModalOpen && (
        <AnonGateModal
          mode="softlogin"
          freePromptLimit={anonFreeLimit}
          onClose={() => setAnonModalOpen(false)}
          onSignIn={() => { login(); setAnonModalOpen(false); }}
        />
      )}
      {/* Header — homepage mode: transparent, scrubs away over the hero */}
      <SiteNav overHero />

      {/* Hero + the scroll story: one continuous globe stage */}
      <LifecycleScroll hero={<HeroBlock onSubmit={handleSubmit} />} />



      {/* Doors */}
      <Doors />


      {/* Footer — full sitemap so the header doesn't have to be one */}
      <SiteFooter />
    </div>
  );
}
