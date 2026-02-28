'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type Tab = 'account' | 'wallet' | 'worker' | 'usage';

export default function SettingsPage() {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [linkingTwitter, setLinkingTwitter] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  const {
    isLoading,
    isAuthenticated,
    user,
    logout,
    profile,
    walletAddress,
    xUsername,
    hasWallet,
    hasTwitter,
    linkWallet,
    linkTwitter,
    unlinkWallet,
    deleteAccount,
    refreshProfile,
    getAccessToken,
  } = useAuth();

  // Tab from URL hash
  const [activeTab, setActiveTab] = useState<Tab>('account');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as Tab;
      if (['account', 'wallet', 'worker', 'usage'].includes(hash)) {
        setActiveTab(hash);
      }
    }
  }, []);

  // Worker tab state
  const [activeTokens, setActiveTokens] = useState<{id: string; name: string; created_at: string; last_used_at: string | null}[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenGenerating, setTokenGenerating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<{pendingBalance: number; todayEarnings: number; totalEarnings: number; dailyCap: number; wallet: string | null} | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);

  // Usage tab state
  const [credits, setCredits] = useState<{balance: number; totalDeposited?: number; totalSpent?: number; depositWallet?: string; recentTransactions?: {date: string; type: string; amount: number; description: string}[]} | null>(null);
  const [checkingDeposit, setCheckingDeposit] = useState(false);
  const [depositResult, setDepositResult] = useState<string | null>(null);
  const [copiedDeposit, setCopiedDeposit] = useState(false);

  // Check if wallet is embedded (created by Privy) vs external
  const isEmbeddedWallet = user?.wallet?.walletClientType === 'privy';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Redirect to home if not authenticated
  if (!isLoading && !isAuthenticated) {
    router.push('/');
    return null;
  }

  // Fetch worker tokens
  const fetchTokens = async () => {
    setLoadingTokens(true);
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/worker-token', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        const data = await res.json();
        setActiveTokens(data.tokens || []);
      }
    } catch {} finally { setLoadingTokens(false); }
  };

  // Fetch earnings
  const fetchEarnings = async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/worker-earnings', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        const data = await res.json();
        setEarnings(data);
      }
    } catch {}
  };

  // Fetch credits
  const fetchCredits = async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/credits', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
      }
    } catch {}
  };

  // Fetch data when tab changes
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'worker') {
      fetchTokens();
      fetchEarnings();
    } else if (activeTab === 'usage') {
      fetchCredits();
    }
  }, [activeTab, isAuthenticated]);

  const generateToken = async () => {
    setTokenGenerating(true);
    setTokenError(null);
    try {
      const t = await getAccessToken();
      if (!t) { setTokenError('Please log in first.'); return; }
      const res = await fetch('/api/worker-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'cli' }),
      });
      const data = await res.json();
      if (!res.ok) { setTokenError(data.error || 'Failed to generate token.'); return; }
      setNewToken(data.token);
      fetchTokens();
    } catch { setTokenError('Failed to generate token.'); }
    finally { setTokenGenerating(false); }
  };

  const revokeToken = async (tokenId: string) => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/worker-token', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });
      if (res.ok) setActiveTokens(prev => prev.filter(tk => tk.id !== tokenId));
    } catch {}
  };

  const claimEarnings = async () => {
    setClaimLoading(true);
    setEarningsError(null);
    try {
      const t = await getAccessToken();
      const res = await fetch('/api/worker-earnings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      const d = await res.json();
      if (res.ok) {
        setEarnings(prev => prev ? { ...prev, pendingBalance: 0 } : prev);
      } else {
        setEarningsError(d.error || 'Claim failed');
      }
    } catch { setEarningsError('Claim failed'); }
    finally { setClaimLoading(false); }
  };

  const handleLinkWallet = async () => {
    setLinkingWallet(true);
    try {
      await linkWallet();
      setTimeout(() => { refreshProfile(); setLinkingWallet(false); }, 1000);
    } catch (error) {
      console.error('Failed to link wallet:', error);
      setLinkingWallet(false);
    }
  };

  const handleLinkTwitter = async () => {
    setLinkingTwitter(true);
    try {
      await linkTwitter();
      setTimeout(() => { refreshProfile(); setLinkingTwitter(false); }, 1000);
    } catch (error) {
      console.error('Failed to link Twitter:', error);
      setLinkingTwitter(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    const success = await deleteAccount();
    if (success) {
      router.push('/');
    } else {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'wallet', label: 'Wallet' },
    { id: 'worker', label: 'Worker' },
    { id: 'usage', label: 'Usage' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="pixel-sans text-white/50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex-1">
              <a href="/" className="pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
              </a>
            </div>
            <button 
              onClick={() => router.push('/')}
              className="pixel-sans text-sm text-white/70 hover:text-white transition-colors"
            >
              ← Back
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="pixel-serif text-white text-3xl md:text-4xl mb-8">Settings</h1>
          
          {/* Tabs */}
          <div className="flex gap-1 mb-8 border-b border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pixel-sans text-sm px-4 py-3 transition-colors relative ${
                  activeTab === tab.id ? 'text-white' : 'text-white/50 hover:text-white/70'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-white" />
                )}
              </button>
            ))}
          </div>

          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="space-y-8">
              {/* Connected Accounts Section */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-6">Connected Accounts</h2>
                <div className="space-y-4">
                  {/* Wallet Connection */}
                  <div className="flex items-center justify-between py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
                          <rect x="2" y="6" width="20" height="14" rx="2" />
                          <path d="M16 14h2" />
                          <path d="M2 10h20" />
                        </svg>
                      </div>
                      <div>
                        <div className="pixel-sans text-white text-sm flex items-center gap-2">
                          Solana Wallet
                          {hasWallet && isEmbeddedWallet && (
                            <span className="text-white/30 text-xs">(Privy)</span>
                          )}
                        </div>
                        {hasWallet ? (
                          <button 
                            onClick={() => walletAddress && copyToClipboard(walletAddress, 'wallet')}
                            className="pixel-sans text-white/50 hover:text-white/70 text-xs mt-1 flex items-center gap-1 transition-colors"
                          >
                            {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-8)}
                            {copied === 'wallet' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                            )}
                          </button>
                        ) : (
                          <div className="pixel-sans text-white/30 text-xs mt-1">Not connected</div>
                        )}
                      </div>
                    </div>
                    {!hasWallet && (
                      <button onClick={handleLinkWallet} disabled={linkingWallet} className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                        {linkingWallet ? '...' : 'Link Wallet'}
                      </button>
                    )}
                    {hasWallet && !isEmbeddedWallet && (
                      <div className="flex items-center gap-2">
                        <span className="pixel-sans text-xs text-green-400">Connected</span>
                        <button
                          onClick={async () => {
                            if (!walletAddress) return;
                            if (!confirm('Disconnecting your wallet will prevent you from receiving worker payouts. Continue?')) return;
                            try { await unlinkWallet(walletAddress); refreshProfile(); } catch (err) { console.error('Failed to disconnect wallet:', err); }
                          }}
                          className="pixel-sans text-xs px-3 py-1.5 border border-red-500/30 text-red-400/70 hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                    {hasWallet && isEmbeddedWallet && (
                      <button onClick={handleLinkWallet} disabled={linkingWallet} className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                        {linkingWallet ? '...' : 'Link External'}
                      </button>
                    )}
                  </div>

                  {/* X (Twitter) Connection */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white/70">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </div>
                      <div>
                        <div className="pixel-sans text-white text-sm">X (Twitter)</div>
                        {hasTwitter ? (
                          <div className="pixel-sans text-white/50 text-xs mt-1">@{xUsername}</div>
                        ) : (
                          <div className="pixel-sans text-white/30 text-xs mt-1">Not connected</div>
                        )}
                      </div>
                    </div>
                    {!hasTwitter && (
                      <button onClick={handleLinkTwitter} disabled={linkingTwitter} className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                        {linkingTwitter ? '...' : 'Link X'}
                      </button>
                    )}
                    {hasTwitter && (
                      <div className="pixel-sans text-xs text-white/30">Connected</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Account Info Section */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-6">Account Info</h2>
                <div className="space-y-4">
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/50 text-sm">Privy ID</span>
                    <button 
                      onClick={() => user?.id && copyToClipboard(user.id, 'privy')}
                      className="pixel-sans text-white/70 hover:text-white text-sm font-mono flex items-center gap-1 transition-colors"
                    >
                      {user?.id?.slice(0, 12)}...
                      {copied === 'privy' ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><path d="M20 6L9 17l-5-5" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                      )}
                    </button>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/50 text-sm">Member Since</span>
                    <span className="pixel-sans text-white/70 text-sm">
                      {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/50 text-sm">Prompts Sent</span>
                    <span className="pixel-sans text-white/70 text-sm">{profile?.prompts_sent ?? 0}</span>
                  </div>
                </div>
              </section>

              {/* Danger Zone */}
              <section className="border border-red-500/20 bg-red-500/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-red-400/80 text-xl mb-4">Danger Zone</h2>
                <p className="pixel-sans text-white/50 text-sm mb-6">
                  Once you delete your account, there is no going back. This will permanently delete your profile and all associated data.
                </p>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)} className="pixel-sans text-sm px-4 py-2 border border-red-500/30 text-red-400/80 hover:bg-red-500/10 transition-colors">
                    Delete Account
                  </button>
                ) : (
                  <div className="space-y-4">
                    <p className="pixel-sans text-red-400/80 text-sm">Are you sure? This action cannot be undone.</p>
                    <div className="flex gap-3">
                      <button onClick={handleDeleteAccount} disabled={deleteLoading} className="pixel-sans text-sm px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50">
                        {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading} className="pixel-sans text-sm px-4 py-2 border border-white/20 text-white/70 hover:bg-white/5 transition-colors disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Wallet Tab */}
          {activeTab === 'wallet' && (
            <div className="space-y-8">
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-6">Solana Wallet</h2>
                <p className="pixel-sans text-white/40 text-sm mb-6">This wallet receives SOL payouts from worker earnings.</p>
                
                {hasWallet ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
                      <code className="font-mono text-[#80a0c1] text-sm flex-1 break-all select-all">{walletAddress}</code>
                      <button
                        onClick={() => walletAddress && copyToClipboard(walletAddress, 'wallet-tab')}
                        className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                      >
                        {copied === 'wallet-tab' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {isEmbeddedWallet && (
                      <p className="pixel-sans text-white/30 text-xs">This is a Privy-managed wallet.</p>
                    )}
                    <div className="flex gap-3">
                      {!isEmbeddedWallet && (
                        <button
                          onClick={async () => {
                            if (!walletAddress) return;
                            if (!confirm('Disconnect this wallet?')) return;
                            try { await unlinkWallet(walletAddress); refreshProfile(); } catch {}
                          }}
                          className="pixel-sans text-xs px-4 py-2 border border-red-500/30 text-red-400/70 hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          Disconnect
                        </button>
                      )}
                      <button onClick={handleLinkWallet} disabled={linkingWallet} className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50">
                        {linkingWallet ? '...' : 'Link Different Wallet'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="pixel-sans text-white/50 text-sm">Connect a Solana wallet to receive worker payouts.</p>
                    <button onClick={handleLinkWallet} disabled={linkingWallet} className="pixel-sans text-sm px-6 py-3 rounded-xl bg-[#80a0c1]/15 border border-[#80a0c1]/30 text-[#80a0c1] hover:bg-[#80a0c1]/25 transition-colors disabled:opacity-50">
                      {linkingWallet ? '...' : 'Link Wallet'}
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Worker Tab */}
          {activeTab === 'worker' && (
            <div className="space-y-8">
              {/* Worker Tokens */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Worker Tokens</h2>
                <p className="pixel-sans text-white/40 text-sm mb-4">Max 5 tokens. Use them to run a native worker:</p>
                
                {tokenError && (
                  <div className="mb-3 p-2 border border-red-500/30 bg-red-500/10 rounded-lg">
                    <p className="pixel-sans text-red-400 text-xs">{tokenError}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3 mb-4">
                  <code className="font-mono text-sm flex-1 whitespace-nowrap overflow-x-auto select-all" style={{color: newToken ? '#80a0c1' : 'rgba(255,255,255,0.35)'}}>
                    npx @c0mpute/worker --token {newToken || '<token>'}
                  </code>
                  <button
                    onClick={() => {
                      const cmd = `npx @c0mpute/worker --token ${newToken || '<token>'}`;
                      navigator.clipboard.writeText(cmd);
                      setCopied('cmd');
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                  >
                    {copied === 'cmd' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {newToken && (
                  <p className="pixel-sans text-white/30 text-xs mb-4">
                    Token generated — save the command above. It won&apos;t be shown again.
                  </p>
                )}

                <button onClick={generateToken} disabled={tokenGenerating} className="pixel-sans text-sm px-6 py-3 rounded-xl bg-[#80a0c1]/15 border border-[#80a0c1]/30 text-[#80a0c1] hover:bg-[#80a0c1]/25 transition-colors disabled:opacity-50 mb-4">
                  {tokenGenerating ? 'Generating...' : 'Generate New Token'}
                </button>

                {loadingTokens ? (
                  <p className="pixel-sans text-white/30 text-xs">Loading tokens...</p>
                ) : activeTokens.length > 0 ? (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="pixel-sans text-white/30 text-[11px] uppercase tracking-wider mb-2">Active tokens ({activeTokens.length}/5)</div>
                    <div className="space-y-2">
                      {activeTokens.map(t => (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                          <div>
                            <span className="pixel-sans text-white/50 text-xs font-mono">{t.id.slice(0, 8)}...</span>
                            <span className="pixel-sans text-white/25 text-[10px] ml-2">created {new Date(t.created_at).toLocaleDateString()}</span>
                            {t.last_used_at && (
                              <span className="pixel-sans text-white/25 text-[10px] ml-2">last used {new Date(t.last_used_at).toLocaleDateString()}</span>
                            )}
                          </div>
                          <button onClick={() => revokeToken(t.id)} className="pixel-sans text-xs text-red-400/60 hover:text-red-400 transition-colors">Revoke</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Earnings */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Earnings</h2>
                <p className="pixel-sans text-white/30 text-xs mb-4"><span className="dollar">$</span>20/day Free · <span className="dollar">$</span>50/day Pro · <span className="dollar">$</span>100/day Max</p>

                {earnings ? (
                  <div>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-green-400 text-xl"><span className="dollar">$</span>{earnings.pendingBalance.toFixed(2)}</div>
                        <div className="pixel-sans text-white/40 text-[11px] mt-1">Pending</div>
                      </div>
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-white/70 text-lg"><span className="dollar">$</span>{earnings.todayEarnings.toFixed(2)} <span className="text-white/30 text-sm">/ <span className="dollar">$</span>{earnings.dailyCap}</span></div>
                        <div className="pixel-sans text-white/40 text-[11px] mt-1">Today</div>
                      </div>
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-white/70 text-lg"><span className="dollar">$</span>{earnings.totalEarnings.toFixed(2)}</div>
                        <div className="pixel-sans text-white/40 text-[11px] mt-1">All Time</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={claimEarnings}
                        disabled={claimLoading || earnings.pendingBalance < 1.0 || !hasWallet}
                        className="pixel-serif px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {claimLoading ? 'Claiming...' : 'Claim'} <span className="dollar">$</span>SOL
                      </button>
                      {earnings.pendingBalance < 1.0 && earnings.pendingBalance > 0 && (
                        <span className="pixel-sans text-white/30 text-xs">Min <span className="dollar">$</span>1.00</span>
                      )}
                    </div>
                    {earningsError && <p className="pixel-sans text-red-400 text-xs mt-2">{earningsError}</p>}
                    {!hasWallet && (
                      <p className="pixel-sans text-amber-400/70 text-xs mt-3">
                        Link a wallet in the <button onClick={() => setActiveTab('wallet')} className="underline hover:text-amber-300">Wallet tab</button> to claim payouts.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="pixel-sans text-white/30 text-sm">Loading earnings...</p>
                )}
              </section>
            </div>
          )}

          {/* Usage Tab */}
          {activeTab === 'usage' && (
            <div className="space-y-8">
              {/* Credit Balance */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Credit Balance</h2>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl">{credits?.balance?.toFixed(0) ?? '0'}</div>
                    <div className="pixel-sans text-white/40 text-xs mt-1">Balance</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl">{credits?.totalDeposited?.toFixed(0) ?? '0'}</div>
                    <div className="pixel-sans text-white/40 text-xs mt-1">Deposited</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl">{credits?.totalSpent?.toFixed(0) ?? '0'}</div>
                    <div className="pixel-sans text-white/40 text-xs mt-1">Spent</div>
                  </div>
                </div>
                <p className="pixel-sans text-white/30 text-xs">1 <span className="dollar">$</span>ZERO = 1 credit</p>
              </section>

              {/* Prompt Costs */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Prompt Costs</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="pixel-sans text-white/70 text-sm">Qwen 1.5B</span>
                    <span className="pixel-sans text-green-400 text-sm">Free</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="pixel-sans text-white/70 text-sm">Dolphin 7B</span>
                    <span className="pixel-sans text-white/50 text-sm">10 credits</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="pixel-sans text-white/70 text-sm">Qwen 14B + search</span>
                    <span className="pixel-sans text-white/50 text-sm">50 credits</span>
                  </div>
                </div>
              </section>

              {/* Top Up */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Top Up</h2>
                <div className="mb-4">
                  <div className="pixel-sans text-white/30 text-[11px] uppercase tracking-wider mb-2">Your deposit address</div>
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
                    <code className="font-mono text-[#80a0c1] text-xs flex-1 break-all select-all">{credits?.depositWallet || 'Loading...'}</code>
                    <button
                      onClick={() => {
                        if (credits?.depositWallet) {
                          navigator.clipboard.writeText(credits.depositWallet);
                          setCopiedDeposit(true);
                          setTimeout(() => setCopiedDeposit(false), 2000);
                        }
                      }}
                      className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                    >
                      {copiedDeposit ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="pixel-sans text-white/20 text-[11px] mt-1.5">Only send <span className="dollar">$</span>ZERO (SPL token) to this address. Other tokens will be lost.</p>
                </div>

                <button
                  onClick={async () => {
                    setCheckingDeposit(true);
                    setDepositResult(null);
                    try {
                      const t = await getAccessToken();
                      const res = await fetch('/api/credits/check-deposit', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'check' }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        if (data.credited > 0) {
                          setCredits(prev => prev ? { ...prev, balance: data.newBalance } : prev);
                          setDepositResult(`+${data.credited} credits added`);
                        } else {
                          setDepositResult(data.message || 'No new deposits found');
                        }
                      } else {
                        setDepositResult(data.error || 'Check failed');
                      }
                    } catch { setDepositResult('Failed to check'); }
                    finally { setCheckingDeposit(false); }
                  }}
                  disabled={checkingDeposit}
                  className="w-full pixel-sans text-sm py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
                >
                  {checkingDeposit ? 'Checking...' : 'Check for deposit'}
                </button>
                {depositResult && (
                  <p className={`pixel-sans text-xs text-center mt-2.5 ${depositResult.includes('added') ? 'text-green-400/80' : 'text-white/40'}`}>{depositResult}</p>
                )}
              </section>

              {/* Transaction History */}
              {credits?.recentTransactions && credits.recentTransactions.length > 0 && (
                <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                  <h2 className="pixel-serif text-white text-xl mb-4">Transaction History</h2>
                  <div className="space-y-2">
                    {credits.recentTransactions.map((tx, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`pixel-sans text-xs px-2 py-0.5 rounded ${
                            tx.type === 'deposit' ? 'bg-green-500/15 text-green-400' :
                            tx.type === 'refund' ? 'bg-blue-500/15 text-blue-400' :
                            'bg-white/5 text-white/40'
                          }`}>{tx.type}</span>
                          <span className="pixel-sans text-white/50 text-xs">{tx.description}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`pixel-sans text-sm ${tx.type === 'spend' ? 'text-red-400/70' : 'text-green-400/70'}`}>
                            {tx.type === 'spend' ? '-' : '+'}{tx.amount}
                          </span>
                          <span className="pixel-sans text-white/20 text-[10px]">{new Date(tx.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
