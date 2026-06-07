'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface GalleryItem {
  id: string;
  url: string;
  prompt: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export default function CreatePage() {
  const router = useRouter();
  const { isAuthenticated, login, getAccessToken } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<GalleryItem | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);

  const loadGallery = useCallback(async () => {
    try {
      const res = await fetch('/api/images/gallery?limit=60', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGallery(data.images || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const generate = async () => {
    setError(null);
    if (!prompt.trim()) return;
    if (!isAuthenticated) {
      login();
      return;
    }
    setLoading(true);
    setCurrent(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Please log in first.');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), negative_prompt: negative.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setError(data.error || 'Not enough credits. Top up in settings.');
        else setError(data.error || 'Generation failed.');
        return;
      }
      const item: GalleryItem = {
        id: data.id,
        url: data.url,
        prompt: prompt.trim(),
        width: data.width,
        height: data.height,
        created_at: new Date().toISOString(),
      };
      setCurrent(item);
      setGallery((prev) => [item, ...prev]);
    } catch {
      setError('Generation failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => router.push('/')} className="text-white/50 hover:text-white text-sm">
            &larr; c0mpute
          </button>
          <h1 className="text-lg font-semibold tracking-tight">Create</h1>
          <button onClick={() => router.push('/settings')} className="text-white/50 hover:text-white text-sm">
            Settings
          </button>
        </div>

        <p className="text-white/50 text-sm mb-4">
          Uncensored image generation on the c0mpute network. One hard limit: no sexual content involving minors.
        </p>

        <div className="space-y-3 mb-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
            placeholder="Describe the image you want..."
            rows={3}
            className="w-full bg-white/5 border border-white/15 rounded-lg p-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 resize-none"
          />
          <input
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="Negative prompt (optional)"
            className="w-full bg-white/5 border border-white/15 rounded-lg p-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40"
          />
          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className="w-full bg-white text-black font-medium rounded-lg py-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/90 transition"
          >
            {loading ? 'Generating...' : isAuthenticated ? 'Generate' : 'Log in to generate'}
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {loading && (
          <div className="aspect-square w-full max-w-md mx-auto rounded-lg border border-white/10 bg-white/5 animate-pulse mb-10" />
        )}

        {current && !loading && (
          <div className="mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.prompt} className="w-full max-w-md mx-auto rounded-lg border border-white/10" />
          </div>
        )}

        <h2 className="text-sm font-semibold text-white/70 mb-3">Latest from the network</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {gallery.map((g) => (
            <div key={g.id} className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt={g.prompt} loading="lazy" className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition">
                <p className="text-[10px] text-white/80 line-clamp-2">{g.prompt}</p>
              </div>
            </div>
          ))}
          {gallery.length === 0 && (
            <p className="text-white/30 text-sm col-span-full py-8 text-center">Nothing generated yet. Be the first.</p>
          )}
        </div>
      </div>
    </div>
  );
}
