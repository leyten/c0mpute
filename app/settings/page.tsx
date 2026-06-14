'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type Tab = 'account' | 'worker' | 'developer' | 'usage' | 'referrals';

// Selectable models (must mirror the chat composer + orchestrator catalog).
type PlanId = 'pro' | 'max' | 'max-sg';
const PLAN_OPTIONS: { id: PlanId; name: string; cost: string; features: string[] }[] = [
  { id: 'pro', name: 'Pro', cost: '10 cr', features: ['Qwen3 8B', 'Browser-powered', 'Uncensored'] },
  { id: 'max', name: 'Qwen3.5 27B', cost: '15 cr', features: ['Qwen3.5 27B', 'Native inference', 'Uncensored', 'Web search', 'Vision'] },
  { id: 'max-sg', name: 'SuperGemma4 26B', cost: '15 cr', features: ['SuperGemma4 26B (MoE)', 'Native inference', 'Uncensored', 'Web search', 'Thinking'] },
];
const planName = (id: PlanId): string => PLAN_OPTIONS.find(p => p.id === id)?.name ?? id;

export default function SettingsPage() {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [linkingTwitter, setLinkingTwitter] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [unlinkingWallet, setUnlinkingWallet] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const {
    isLoading,
    isAuthenticated,
    user,
    logout,
    profile,
    xUsername,
    hasTwitter,
    linkTwitter,
    linkWallet,
    unlinkWallet,
    hasWallet,
    walletAddress,
    deleteAccount,
    refreshProfile,
    getAccessToken,
  } = useAuth();

  // Tab from URL hash
  const [activeTab, setActiveTab] = useState<Tab>('account');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = window.location.hash.replace('#', '');
      const hash = (raw === 'api' ? 'developer' : raw) as Tab;
      if (['account', 'worker', 'developer', 'usage', 'referrals'].includes(hash)) {
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
  // API keys (public inference API)
  const [apiKeys, setApiKeys] = useState<{id: string; name: string; created_at: string; last_used_at: string | null}[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<{pendingBalance: number; todayEarnings: number; totalEarnings: number; wallet: string | null} | null>(null);
  const [referrals, setReferrals] = useState<{code: string; link: string; referredCount: number; earnedUsd: number; earnedUsdThisMonth: number; recent: {tier: string; usd: number; created_at: string}[]} | null>(null);
  const [refCopied, setRefCopied] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  // Usage tab state
  const [credits, setCredits] = useState<{balance: number; totalDeposited?: number; totalSpent?: number; depositWallet?: string; recentTransactions?: {created_at: string; type: string; amount: number; description: string}[]; config?: {creditsPerUsd: number}} | null>(null);
  const [usage, setUsage] = useState<{totalRequests: number; totalTokens: number; byModel: {model: string; requests: number; tokens: number}[]} | null>(null);
  const [activePlan, setActivePlan] = useState<PlanId>('pro');
  const [planConfirm, setPlanConfirm] = useState<PlanId | null>(null);
  const [planSwitching, setPlanSwitching] = useState(false);
  const [checkingDeposit, setCheckingDeposit] = useState(false);
  const [depositResult, setDepositResult] = useState<string | null>(null);
  const [copiedDeposit, setCopiedDeposit] = useState(false);
  const [topUpUsd, setTopUpUsd] = useState('');

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
        if (data.wallet) setWithdrawAddress(prev => prev || data.wallet);
      }
    } catch {}
  };

  // Fetch referral stats
  const fetchReferrals = async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/referrals', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setReferrals(await res.json());
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

  // Fetch usage (requests + tokens)
  const fetchUsage = async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/usage', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setUsage(await res.json());
    } catch {}
  };

  // Fetch data when tab changes
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'worker') {
      fetchTokens();
      fetchEarnings();
    } else if (activeTab === 'developer') {
      fetchApiKeys();
    } else if (activeTab === 'referrals') {
      fetchReferrals();
    } else if (activeTab === 'usage') {
      fetchCredits();
      fetchUsage();
      // Fetch active plan
      getAccessToken().then(t => {
        if (!t) return;
        fetch('/api/plan', { headers: { Authorization: `Bearer ${t}` } })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.plan) setActivePlan(data.plan); })
          .catch(() => {});
      });
    }
  }, [activeTab, isAuthenticated]);

  const switchPlan = async (plan: PlanId) => {
    setPlanSwitching(true);
    try {
      const t = await getAccessToken();
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        setActivePlan(plan);
        setPlanConfirm(null);
      }
    } catch {}
    finally { setPlanSwitching(false); }
  };

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

  // ── API keys ──
  const fetchApiKeys = async () => {
    setLoadingApiKeys(true);
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/api-keys', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch {} finally { setLoadingApiKeys(false); }
  };

  const generateApiKey = async () => {
    setApiKeyGenerating(true);
    setApiKeyError(null);
    try {
      const t = await getAccessToken();
      if (!t) { setApiKeyError('Please log in first.'); return; }
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'default' }),
      });
      const data = await res.json();
      if (!res.ok) { setApiKeyError(data.error || 'Failed to generate key.'); return; }
      setNewApiKey(data.key);
      fetchApiKeys();
    } catch { setApiKeyError('Failed to generate key.'); }
    finally { setApiKeyGenerating(false); }
  };

  const revokeApiKey = async (keyId: string) => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/api-keys', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      if (res.ok) setApiKeys(prev => prev.filter(k => k.id !== keyId));
    } catch {}
  };

  const submitWithdraw = async () => {
    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);
    try {
      const t = await getAccessToken();
      const res = await fetch('/api/worker-payout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: withdrawAddress.trim(), amount: parseFloat(withdrawAmount) }),
      });
      const d = await res.json();
      if (res.ok) {
        setWithdrawSuccess(`Sent $${d.amount.toFixed(2)} USDC`);
        setWithdrawAmount('');
        fetchEarnings();
      } else {
        setWithdrawError(d.error || 'Withdrawal failed');
      }
    } catch { setWithdrawError('Withdrawal failed'); }
    finally { setWithdrawLoading(false); }
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

  const handleUnlinkWallet = async () => {
    if (!walletAddress) return;
    setUnlinkingWallet(true);
    try {
      await unlinkWallet(walletAddress);
      setTimeout(() => { refreshProfile(); setUnlinkingWallet(false); }, 1000);
    } catch (error) {
      console.error('Failed to unlink wallet:', error);
      setUnlinkingWallet(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deleteAccount();
    if (result.ok) {
      router.push('/');
    } else {
      setDeleteLoading(false);
      setDeleteError(result.error || 'Failed to delete account.');
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'worker', label: 'Worker' },
    { id: 'developer', label: 'API' },
    { id: 'usage', label: 'Usage' },
    { id: 'referrals', label: 'Referrals' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="pixel-sans text-white/70">Loading...</div>
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
              <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
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
                onClick={() => {
                  setActiveTab(tab.id);
                  window.history.replaceState(null, '', `#${tab.id === 'developer' ? 'api' : tab.id}`);
                }}
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
                          <div className="pixel-sans text-white/70 text-xs mt-1">@{xUsername}</div>
                        ) : (
                          <div className="pixel-sans text-white/60 text-xs mt-1">Not connected</div>
                        )}
                      </div>
                    </div>
                    {!hasTwitter && (
                      <button onClick={handleLinkTwitter} disabled={linkingTwitter} className="cursor-pointer pixel-serif text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                        {linkingTwitter ? '...' : 'Link X'}
                      </button>
                    )}
                    {hasTwitter && (
                      <div className="pixel-sans text-xs text-white/60">Connected</div>
                    )}
                  </div>

                  {/* Solana Wallet Connection */}
                  <div className="flex items-center justify-between py-3 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                        </svg>
                      </div>
                      <div>
                        <div className="pixel-sans text-white text-sm">Solana Wallet</div>
                        {hasWallet && walletAddress ? (
                          <button
                            onClick={() => copyToClipboard(walletAddress, 'wallet')}
                            className="pixel-sans text-white/70 hover:text-white text-xs mt-1 font-mono flex items-center gap-1 transition-colors"
                          >
                            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                            {copied === 'wallet' ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                            )}
                          </button>
                        ) : (
                          <div className="pixel-sans text-white/60 text-xs mt-1">Not connected</div>
                        )}
                      </div>
                    </div>
                    {!hasWallet ? (
                      <button onClick={handleLinkWallet} disabled={linkingWallet} className="cursor-pointer pixel-serif text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                        {linkingWallet ? '...' : 'Connect Wallet'}
                      </button>
                    ) : hasTwitter ? (
                      <button onClick={handleUnlinkWallet} disabled={unlinkingWallet} className="cursor-pointer pixel-sans text-xs text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50">
                        {unlinkingWallet ? '...' : 'Disconnect'}
                      </button>
                    ) : (
                      <div className="pixel-sans text-xs text-white/60">Connected</div>
                    )}
                  </div>
                </div>
                <p className="pixel-sans text-white/45 text-[11px] mt-4">Connect a Solana wallet (Phantom, Solflare, Backpack) to stake $ZERO and manage on-chain actions yourself. Required for staking and on-chain withdrawals.</p>
              </section>

              {/* Account Info Section */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-6">Account Info</h2>
                <div className="space-y-4">
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/70 text-sm">Privy ID</span>
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
                    <span className="pixel-sans text-white/70 text-sm">Member Since</span>
                    <span className="pixel-sans text-white/70 text-sm">
                      {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/70 text-sm">Prompts Sent</span>
                    <span className="pixel-sans text-white/70 text-sm">{profile?.prompts_sent ?? 0}</span>
                  </div>
                </div>
              </section>

              {/* Danger Zone */}
              <section className="border border-red-500/20 bg-red-500/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-red-400/80 text-xl mb-4">Danger Zone</h2>
                <p className="pixel-sans text-white/70 text-sm mb-6">
                  Once you delete your account, there is no going back. This will permanently delete your profile and all associated data.
                </p>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)} className="cursor-pointer pixel-serif text-sm px-4 py-2 border border-red-500/30 text-red-400/80 hover:bg-red-500/10 transition-colors">
                    Delete Account
                  </button>
                ) : (
                  <div className="space-y-4">
                    <p className="pixel-sans text-red-400/80 text-sm">Are you sure? This action cannot be undone.</p>
                    {deleteError && (
                      <p className="pixel-sans text-red-400 text-sm">{deleteError}</p>
                    )}
                    <div className="flex gap-3">
                      <button onClick={handleDeleteAccount} disabled={deleteLoading} className="cursor-pointer pixel-serif text-sm px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50">
                        {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
                      </button>
                      <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }} disabled={deleteLoading} className="cursor-pointer pixel-serif text-sm px-4 py-2 border border-white/20 text-white/70 hover:bg-white/5 transition-colors disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
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
                <p className="pixel-sans text-white/70 text-sm mb-4">Max 5 tokens. Use them to run a native worker:</p>
                
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
                    className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                  >
                    {copied === 'cmd' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {newToken && (
                  <p className="pixel-sans text-white/60 text-xs mb-4">
                    Token generated — save the command above. It won&apos;t be shown again.
                  </p>
                )}

                <button onClick={generateToken} disabled={tokenGenerating} className="cursor-pointer pixel-serif text-sm px-6 py-3 rounded-xl bg-[#80a0c1]/15 border border-[#80a0c1]/30 text-[#80a0c1] hover:bg-[#80a0c1]/25 transition-colors disabled:opacity-50 mb-4">
                  {tokenGenerating ? 'Generating...' : 'Generate New Token'}
                </button>

                {loadingTokens ? (
                  <p className="pixel-sans text-white/60 text-xs">Loading tokens...</p>
                ) : activeTokens.length > 0 ? (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-2">Active tokens ({activeTokens.length}/5)</div>
                    <div className="space-y-2">
                      {activeTokens.map(t => (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                          <div>
                            <span className="pixel-sans text-white/70 text-xs font-mono">{t.id.slice(0, 8)}...</span>
                            <span className="pixel-sans text-white/55 text-[10px] ml-2">created {new Date(t.created_at).toLocaleDateString()}</span>
                            {t.last_used_at && (
                              <span className="pixel-sans text-white/55 text-[10px] ml-2">last used {new Date(t.last_used_at).toLocaleDateString()}</span>
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
                <p className="pixel-sans text-white/60 text-xs mb-4">You earn 70% of the <span className="dollar">$</span>USDC value of credits spent on jobs you complete.</p>

                {earnings ? (
                  <div>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-green-400 text-xl"><span className="dollar">$</span>{earnings.pendingBalance.toFixed(2)}</div>
                        <div className="pixel-sans text-white/70 text-[11px] mt-1">Pending</div>
                      </div>
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-white/70 text-lg"><span className="dollar">$</span>{earnings.todayEarnings.toFixed(2)}</div>
                        <div className="pixel-sans text-white/70 text-[11px] mt-1">Today</div>
                      </div>
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-white/70 text-lg"><span className="dollar">$</span>{earnings.totalEarnings.toFixed(2)}</div>
                        <div className="pixel-sans text-white/70 text-[11px] mt-1">All Time</div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-white/5">
                      <div>
                        <label className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-1.5 block">Withdraw to Solana address</label>
                        <input
                          type="text"
                          value={withdrawAddress}
                          onChange={(e) => setWithdrawAddress(e.target.value)}
                          placeholder="Your USDC wallet address"
                          spellCheck={false}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-3 font-mono text-[#80a0c1] text-xs outline-none focus:border-white/25 placeholder-white/40"
                        />
                      </div>
                      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
                        <span className="dollar text-white/70 text-lg">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent outline-none pixel-serif text-white text-lg placeholder-white/40"
                        />
                        <button
                          onClick={() => setWithdrawAmount(earnings.pendingBalance.toFixed(2))}
                          className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                        >
                          Max
                        </button>
                      </div>
                      <button
                        onClick={submitWithdraw}
                        disabled={
                          withdrawLoading ||
                          !withdrawAddress.trim() ||
                          !(parseFloat(withdrawAmount) >= 1.0) ||
                          parseFloat(withdrawAmount) > Math.round(earnings.pendingBalance * 100) / 100 + 1e-9
                        }
                        className="w-full pixel-serif px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {withdrawLoading ? 'Sending...' : <>Withdraw <span className="dollar">$</span>USDC</>}
                      </button>
                      <p className="pixel-sans text-white/55 text-[11px]">Minimum <span className="dollar">$</span>1.00. Sent as USDC on Solana, no signature needed.</p>
                    </div>
                    {withdrawError && <p className="pixel-sans text-red-400 text-xs mt-2">{withdrawError}</p>}
                    {withdrawSuccess && <p className="pixel-sans text-green-400/80 text-xs mt-2">{withdrawSuccess}</p>}
                  </div>
                ) : (
                  <p className="pixel-sans text-white/60 text-sm">Loading earnings...</p>
                )}
              </section>
            </div>
          )}

          {/* Developer / API Tab */}
          {activeTab === 'developer' && (
            <div className="space-y-8">
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">API Keys</h2>
                <p className="pixel-sans text-white/70 text-sm mb-4">Max 5 keys. OpenAI-compatible — point any SDK at the endpoint by changing only base_url + api_key.</p>

                {apiKeyError && (
                  <div className="mb-3 p-2 border border-red-500/30 bg-red-500/10 rounded-lg">
                    <p className="pixel-sans text-red-400 text-xs">{apiKeyError}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3 mb-2">
                  <code className="font-mono text-sm flex-1 whitespace-nowrap overflow-x-auto select-all" style={{color: newApiKey ? '#80a0c1' : 'rgba(255,255,255,0.35)'}}>
                    {newApiKey || 'sk-c0mpute-...'}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newApiKey || '');
                      setCopied('apikey');
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    disabled={!newApiKey}
                    className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0 disabled:opacity-40"
                  >
                    {copied === 'apikey' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {newApiKey && (
                  <p className="pixel-sans text-white/60 text-xs mb-4">
                    Key generated — copy it now. It won&apos;t be shown again.
                  </p>
                )}

                <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 mb-4">
                  <code className="font-mono text-xs text-white/50 whitespace-pre overflow-x-auto block">{`base_url:  https://c0mpute.ai/api/v1
models:    c0mpute-pro  ·  c0mpute-max  ·  c0mpute-max-think`}</code>
                </div>

                <button onClick={generateApiKey} disabled={apiKeyGenerating} className="cursor-pointer pixel-serif text-sm px-6 py-3 rounded-xl bg-[#80a0c1]/15 border border-[#80a0c1]/30 text-[#80a0c1] hover:bg-[#80a0c1]/25 transition-colors disabled:opacity-50 mb-4">
                  {apiKeyGenerating ? 'Generating...' : 'Generate New Key'}
                </button>

                {loadingApiKeys ? (
                  <p className="pixel-sans text-white/60 text-xs">Loading keys...</p>
                ) : apiKeys.length > 0 ? (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-2">Active keys ({apiKeys.length}/5)</div>
                    <div className="space-y-2">
                      {apiKeys.map(k => (
                        <div key={k.id} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                          <div>
                            <span className="pixel-sans text-white/70 text-xs font-mono">{k.id.slice(0, 8)}...</span>
                            <span className="pixel-sans text-white/55 text-[10px] ml-2">created {new Date(k.created_at).toLocaleDateString()}</span>
                            {k.last_used_at && (
                              <span className="pixel-sans text-white/55 text-[10px] ml-2">last used {new Date(k.last_used_at).toLocaleDateString()}</span>
                            )}
                          </div>
                          <button onClick={() => revokeApiKey(k.id)} className="pixel-sans text-xs text-red-400/60 hover:text-red-400 transition-colors">Revoke</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          )}

          {/* Referrals Tab */}
          {activeTab === 'referrals' && (
            <div className="space-y-8">
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Referrals</h2>
                <p className="pixel-sans text-white/60 text-xs mb-4">Share your link. You earn <span className="text-white">5%</span> of the <span className="dollar">$</span>USDC value of every prompt your referrals pay for. Forever.</p>
                {referrals ? (
                  <div>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg p-3 font-mono text-[#80a0c1] text-xs overflow-x-auto whitespace-nowrap">{referrals.link}</div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(referrals.link); setRefCopied(true); setTimeout(() => setRefCopied(false), 2000); }}
                        className="pixel-sans text-xs px-3 py-3 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                      >
                        {refCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-white text-xl">{referrals.referredCount}</div>
                        <div className="pixel-sans text-white/70 text-[11px] mt-1">Referred</div>
                      </div>
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-green-400 text-xl"><span className="dollar">$</span>{referrals.earnedUsdThisMonth.toFixed(2)}</div>
                        <div className="pixel-sans text-white/70 text-[11px] mt-1">This Month</div>
                      </div>
                      <div className="text-center p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div className="pixel-serif text-white/70 text-lg"><span className="dollar">$</span>{referrals.earnedUsd.toFixed(2)}</div>
                        <div className="pixel-sans text-white/70 text-[11px] mt-1">All Time</div>
                      </div>
                    </div>
                    {referrals.recent.length > 0 ? (
                      <div className="pt-2 border-t border-white/5">
                        <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-2">Recent earnings</div>
                        <div className="space-y-1.5">
                          {referrals.recent.map((r, i) => (
                            <div key={i} className="flex items-center justify-between pixel-sans text-xs">
                              <span className="text-white/50">{new Date(r.created_at).toLocaleDateString()} · {r.tier}</span>
                              <span className="text-green-400/90"><span className="dollar">$</span>{r.usd.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="pixel-sans text-white/50 text-xs pt-2 border-t border-white/5">No earnings yet — they show up here the moment a referral pays for a prompt.</p>
                    )}
                    <p className="pixel-sans text-white/55 text-[11px] mt-4">Referrals bind when someone signs up after using your link (valid 30 days from click). Free prompts and staking allowance usage do not pay referral fees. Earnings are withdrawable as <span className="dollar">$</span>USDC (rolling out).</p>
                  </div>
                ) : (
                  <div className="pixel-sans text-white/50 text-xs">Loading...</div>
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
                    <div className="pixel-sans text-white/70 text-xs mt-1">Balance</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl">{credits?.totalDeposited?.toFixed(0) ?? '0'}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">Deposited</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl">{credits?.totalSpent?.toFixed(0) ?? '0'}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">Spent</div>
                  </div>
                </div>
                <p className="pixel-sans text-white/60 text-xs">1 credit = <span className="dollar">$</span>0.01 USD</p>
              </section>

              {/* API / Inference Usage */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Usage</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl">{(usage?.totalRequests ?? 0).toLocaleString()}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">Requests</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl">{(usage?.totalTokens ?? 0).toLocaleString()}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">Tokens generated</div>
                  </div>
                </div>
                {usage && usage.byModel.length > 0 ? (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-1">By model</div>
                    {usage.byModel.map((m) => (
                      <div key={m.model} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                        <span className="pixel-sans text-white/80 text-xs font-mono">{m.model}</span>
                        <span className="pixel-sans text-white/60 text-xs">{m.requests.toLocaleString()} req · {m.tokens.toLocaleString()} tok</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pixel-sans text-white/55 text-xs">No usage yet.</p>
                )}
              </section>

              {/* Plan Selection */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Plan</h2>
                <div className="grid grid-cols-3 gap-3">
                  {PLAN_OPTIONS.map((plan) => {
                    const isActive = activePlan === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className={`relative p-4 rounded-xl border transition-colors cursor-pointer ${
                          isActive
                            ? 'border-[#80a0c1]/40 bg-[#80a0c1]/[0.06]'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                        onClick={() => {
                          if (plan.id !== activePlan) setPlanConfirm(plan.id);
                        }}
                      >
                        {isActive && (
                          <div className="absolute top-2 right-2">
                            <span className="pixel-sans text-[10px] px-1.5 py-0.5 bg-[#80a0c1]/20 text-[#80a0c1] rounded">Active</span>
                          </div>
                        )}
                        <div className="pixel-serif text-white text-lg mb-1">{plan.name}</div>
                        <div className="pixel-sans text-white/70 text-xs mb-3">{plan.cost} / message</div>
                        <ul className="space-y-1.5">
                          {plan.features.map((f, i) => (
                            <li key={i} className="pixel-sans text-white/70 text-xs flex items-center gap-1.5">
                              <span className="text-[#80a0c1]">✓</span> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Plan Switch Confirmation */}
              {planConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setPlanConfirm(null)}>
                  <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                    <h3 className="pixel-serif text-white text-lg mb-2">Switch to {planName(planConfirm)}?</h3>
                    <p className="pixel-sans text-white/70 text-sm mb-5">
                      This will change the model used for all future messages.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={() => setPlanConfirm(null)} className="cursor-pointer flex-1 pixel-serif text-sm py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-colors">Cancel</button>
                      <button onClick={() => switchPlan(planConfirm)} className="cursor-pointer flex-1 pixel-serif text-sm py-2.5 rounded-xl bg-[#80a0c1]/20 border border-[#80a0c1]/30 text-[#80a0c1] hover:bg-[#80a0c1]/30 transition-colors">
                        {planSwitching ? 'Switching...' : 'Switch'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Up */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Top Up</h2>

                {/* Amount calculator: user enters USD, sees credits + conversion */}
                {(() => {
                  const CREDITS_PER_USD = credits?.config?.creditsPerUsd ?? 100; // 1 credit = $0.01
                  const usd = Math.max(0, parseFloat(topUpUsd) || 0);
                  const creditsOut = Math.round(usd * CREDITS_PER_USD);
                  return (
                    <div className="mb-5">
                      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
                        <span className="dollar text-white/70 text-lg">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={topUpUsd}
                          onChange={(e) => setTopUpUsd(e.target.value)}
                          placeholder="0"
                          className="flex-1 bg-transparent outline-none pixel-serif text-white text-lg placeholder-white/45"
                        />
                        <span className="pixel-sans text-white/60 text-xs whitespace-nowrap">USDC</span>
                      </div>
                      <div className="flex items-baseline justify-between mt-2.5">
                        <span className="pixel-serif text-white text-xl">{creditsOut.toLocaleString()} <span className="text-white/70 text-sm">credits</span></span>
                        <span className="pixel-sans text-white/55 text-[11px]"><span className="dollar">$</span>1 = {CREDITS_PER_USD} credits</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="mb-4">
                  <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-2">Your deposit address</div>
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
                      className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                    >
                      {copiedDeposit ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="pixel-sans text-white/55 text-[11px] mt-1.5">Only send USDC (SPL token) to this address. Other tokens will be lost.</p>
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
                          setDepositResult(`+${data.credited} credits added` + (data.message ? ` — ${data.message}` : ''));
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
                  className="cursor-pointer w-full pixel-serif text-sm py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
                >
                  {checkingDeposit ? 'Checking...' : 'Check for deposit'}
                </button>
                {depositResult && (
                  <p className={`pixel-sans text-xs text-center mt-2.5 ${depositResult.includes('added') ? 'text-green-400/80' : 'text-white/70'}`}>{depositResult}</p>
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
                            'bg-white/5 text-white/70'
                          }`}>{tx.type}</span>
                          <span className="pixel-sans text-white/70 text-xs">{tx.description}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`pixel-sans text-sm ${tx.type === 'spend' ? 'text-red-400/70' : 'text-green-400/70'}`}>
                            {tx.type === 'spend' ? '-' : '+'}{tx.amount}
                          </span>
                          <span className="pixel-sans text-white/55 text-[10px]">{new Date(tx.created_at).toLocaleDateString()}</span>
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
