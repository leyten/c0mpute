'use client';

// Native worker onboarding card. Functionality is unchanged from the original
// earn page: token generation via POST /api/worker-token, the npx run command
// with copy, and the per-OS Node.js install helper.

import { useState, useEffect } from 'react';

export default function NativeWorkerCard({ getAccessToken }: { getAccessToken: () => Promise<string | null> }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [os, setOs] = useState<'macos' | 'windows' | 'linux'>('macos');

  useEffect(() => {
    const p = (navigator.platform || navigator.userAgent || '').toLowerCase();
    if (p.includes('win')) setOs('windows');
    else if (p.includes('linux') || p.includes('android')) setOs('linux');
    else setOs('macos');
  }, []);

  const generateToken = async () => {
    setGenerating(true);
    setTokenError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setTokenError('Please log in first.');
        return;
      }
      const res = await fetch('/api/worker-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'cli' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTokenError(data.error || 'Failed to generate token.');
        return;
      }
      setToken(data.token);
    } catch {
      setTokenError('Failed to generate token.');
    } finally {
      setGenerating(false);
    }
  };

  const runCommand = token ? `npx @c0mpute/worker --token ${token}` : 'npx @c0mpute/worker --token YOUR_TOKEN';
  const copyCommand = () => {
    navigator.clipboard.writeText(runCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nodeInstall: Record<typeof os, string> = {
    macos: 'brew install node',
    windows: 'winget install OpenJS.NodeJS',
    linux: 'sudo apt install -y nodejs npm',
  };

  return (
    <div className="relative border border-[#80a0c1]/30 bg-[#80a0c1]/[0.05] rounded-2xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Pitch + command */}
        <div className="lg:col-span-3 p-7 md:p-9">
          <div className="flex items-center gap-3 mb-4">
            <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-md bg-[#80a0c1]/15 text-[#80a0c1] border border-[#80a0c1]/30">
              Recommended
            </span>
            <span className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em]">Runs in the background</span>
          </div>

          <h2 className="pixel-serif text-white text-2xl md:text-3xl mb-2">Native worker</h2>

          <div className="flex items-baseline gap-2 mb-1">
            <span className="pixel-serif text-white text-3xl">
              <span className="dollar">$</span>0.10-0.14
            </span>
            <span className="pixel-sans text-white/60 text-sm">per job</span>
          </div>
          <p className="pixel-sans text-[#80a0c1] text-sm mb-4">Up to 10x browser earnings</p>

          <p className="pixel-sans text-white/70 text-sm mb-6 max-w-lg">
            Runs the Max-tier 27B model on your own GPU as a background process, so there is nothing to keep open.
            Native jobs are the highest paying on the network.
          </p>

          <ol className="space-y-1.5 mb-6">
            <li className="pixel-sans text-white/70 text-sm">1. Generate your command below.</li>
            <li className="pixel-sans text-white/70 text-sm">2. Paste it into your terminal.</li>
            <li className="pixel-sans text-white/70 text-sm">3. It connects and starts earning automatically.</li>
          </ol>

          {tokenError && (
            <div className="mb-3 p-2.5 border border-red-500/30 bg-red-500/10 rounded-lg">
              <p className="pixel-sans text-red-400 text-xs">{tokenError}</p>
            </div>
          )}

          {!token ? (
            <button
              onClick={generateToken}
              disabled={generating}
              className="cursor-pointer pixel-serif text-base px-7 py-3.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Get my command'}
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-black/30 border border-[#80a0c1]/20 rounded-lg p-3 font-mono text-sm overflow-x-auto">
              <code className="text-[#80a0c1] whitespace-nowrap flex-1">{runCommand}</code>
              <button
                onClick={copyCommand}
                className="cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {/* Requirements helper */}
        <div className="lg:col-span-2 p-7 md:p-9 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/20">
          <div className="pixel-sans text-white/45 text-[10px] uppercase tracking-[0.14em] mb-4">Requirements</div>

          <p className="pixel-sans text-white/70 text-sm mb-5">
            A compatible GPU (NVIDIA, AMD, or Apple Silicon) and Node.js 18 or newer.
          </p>

          <p className="pixel-sans text-white/55 text-xs mb-2">Install Node.js:</p>
          <div className="flex gap-1.5 mb-2">
            {(['macos', 'windows', 'linux'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOs(o)}
                className={`cursor-pointer pixel-sans text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  os === o ? 'border-[#80a0c1]/40 bg-[#80a0c1]/15 text-[#80a0c1]' : 'border-white/10 text-white/50 hover:text-white/70'
                }`}
              >
                {o === 'macos' ? 'macOS' : o === 'windows' ? 'Windows' : 'Linux'}
              </button>
            ))}
          </div>
          <div className="bg-black/30 border border-white/10 rounded-lg p-2.5 font-mono text-xs text-white/70 overflow-x-auto">
            <code className="whitespace-nowrap">{nodeInstall[os]}</code>
          </div>

          <p className="pixel-sans text-white/55 text-xs mt-5">
            Your token is shown once, save it somewhere safe.{' '}
            <a href="/settings#worker" className="cursor-pointer text-[#80a0c1]/70 hover:text-[#80a0c1] underline">
              Manage tokens
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
