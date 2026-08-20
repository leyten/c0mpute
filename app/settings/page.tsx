'use client';

import SiteNav from '@/components/SiteNav';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useBrand } from '@/components/BrandProvider';

type Tab = 'account' | 'worker' | 'developer' | 'usage' | 'referrals';

/* The ledger's own words for a transaction type. The subsidized kinds cost 0
   credits and are there so a free prompt still shows up in the history. */
const TX_LABELS: Record<string, string> = { free_prompt: 'welcome', staker_allowance: 'staking' };
const txLabel = (type: string): string => TX_LABELS[type] ?? type;

/* ---------- shared button styles ---------- */
const btnPrimary = 'cursor-pointer pixel-sans text-[13px] font-medium px-4 py-2 rounded-lg bg-fg text-on-fg hover:bg-fg/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary = 'cursor-pointer pixel-sans text-[13px] px-4 py-2 rounded-lg border border-fg/20 text-fg hover:bg-fg/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnDanger = 'cursor-pointer pixel-sans text-[13px] px-4 py-2 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhostSmall = 'cursor-pointer pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-fg/10 text-fg-70 hover:text-fg hover:bg-fg/5 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed';

/* ---------- icons ---------- */
function IconCopy({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconCheck({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/* ---------- primitives ---------- */

// Sectioned card: title + quiet description, body, optional action footer.
function Card({ title, description, children, footer }: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="border border-fg/10 bg-fg/[0.02] rounded-2xl overflow-hidden">
      <div className="p-5 md:p-6">
        <h2 className="pixel-serif text-fg text-xl">{title}</h2>
        {description && <p className="pixel-sans text-fg-50 text-[13px] leading-relaxed mt-1.5">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && (
        <div className="px-5 md:px-6 py-3.5 border-t border-fg/[0.06] bg-fg/[0.015] flex flex-wrap items-center justify-between gap-3">
          {footer}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone = 'default' }: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'dim' | 'positive';
}) {
  const color = tone === 'positive' ? 'text-emerald-400' : tone === 'dim' ? 'text-fg-70' : 'text-fg';
  return (
    <div className="border border-fg/[0.06] bg-fg/[0.02] rounded-xl px-4 py-3.5 min-w-0">
      <div className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] whitespace-nowrap">{label}</div>
      <div className={`pixel-serif text-2xl mt-1.5 tabular-nums truncate ${color}`}>{value}</div>
    </div>
  );
}

// Inline copyable value (ids, addresses).
function CopyValue({ text, display }: { text: string; display: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="cursor-pointer pixel-sans font-mono text-sm text-fg-70 hover:text-fg inline-flex items-center gap-1.5 transition-colors"
    >
      {display}
      <span className={copied ? 'text-emerald-400' : 'text-fg-40'}>{copied ? <IconCheck /> : <IconCopy />}</span>
    </button>
  );
}

// Boxed monospace field with a copy action (commands, keys, addresses, links).
function CopyField({ text, display, accent = false, wrap = false }: {
  text: string | null;      // null disables copying
  display: string;
  accent?: boolean;         // steel highlight for freshly generated values
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-fg/[0.03] border border-fg/10 rounded-xl p-3">
      <code
        className={`font-mono text-xs flex-1 select-all ${wrap ? 'break-all' : 'whitespace-nowrap overflow-x-auto'} ${accent ? 'text-steel' : 'text-fg-35'}`}
      >
        {display}
      </code>
      <button
        onClick={() => {
          if (text === null) return;
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        disabled={text === null}
        className={btnGhostSmall}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const cls =
    tone === 'error' ? 'border-danger/25 bg-danger/[0.06] text-danger' :
    tone === 'success' ? 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-400' :
    'border-fg/10 bg-fg/[0.03] text-fg-60';
  return (
    <div className={`border rounded-lg px-3 py-2 ${cls}`}>
      <p className="pixel-sans text-xs leading-relaxed">{children}</p>
    </div>
  );
}

export default function SettingsPage() {
  const brand = useBrand();
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [linkingTwitter, setLinkingTwitter] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [unlinkingWallet, setUnlinkingWallet] = useState(false);

  const {
    isLoading,
    isAuthenticated,
    user,
    profile,
    xUsername,
    hasTwitter,
    linkTwitter,
    linkWallet,
    unlinkWallet,
    hasWallet,
    walletAddress,
    displayName,
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
  const [apiKeys, setApiKeys] = useState<{id: string; name: string; created_at: string; last_used_at: string | null; free_only?: number; key_prefix?: string | null; requests_today?: number}[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  // Staking allowance — gates the resale-key card (only shown to stakers who
  // actually have a daily allowance to resell).
  const [allowance, setAllowance] = useState<{ enabled: boolean; dailyAllowance: number; usedToday: number; remaining: number } | null>(null);
  const [newResaleKey, setNewResaleKey] = useState<string | null>(null);
  const [resaleKeyGenerating, setResaleKeyGenerating] = useState(false);
  const [earnings, setEarnings] = useState<{pendingBalance: number; todayEarnings: number; totalEarnings: number; wallet: string | null} | null>(null);
  const [referrals, setReferrals] = useState<{code: string; link: string; referredCount: number; earnedUsd: number; earnedUsdThisMonth: number; recent: {tier: string; usd: number; created_at: string}[]} | null>(null);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  // Usage tab state
  const [credits, setCredits] = useState<{balance: number; totalDeposited?: number; totalSpent?: number; depositWallet?: string; recentTransactions?: {created_at: string; type: string; amount: number; description: string}[]; config?: {creditsPerUsd: number}} | null>(null);
  const [usage, setUsage] = useState<{totalRequests: number; totalTokens: number; byModel: {model: string; requests: number; tokens: number}[]} | null>(null);
  const [checkingDeposit, setCheckingDeposit] = useState(false);
  const [depositResult, setDepositResult] = useState<string | null>(null);
  const [topUpUsd, setTopUpUsd] = useState('');

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
      // wide enough that free prompts (0-credit rows) can't push the deposits
      // and spends out of the history card below
      const res = await fetch('/api/credits?tx=100', { headers: { Authorization: `Bearer ${t}` } });
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
      fetchAllowance();
    } else if (activeTab === 'referrals') {
      fetchReferrals();
    } else if (activeTab === 'usage') {
      fetchCredits();
      fetchUsage();
    }
  }, [activeTab, isAuthenticated]);

  // Signed-out visitors go home. This has to be an effect placed after every
  // other hook: it used to redirect during render and return early, which
  // skipped the hook above and crashed the page with a hook-count mismatch
  // (React #300/#310) for anyone who opened /settings without a session.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/');
  }, [isLoading, isAuthenticated, router]);

  const signedOut = !isLoading && !isAuthenticated;

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

  const generateApiKey = async (freeOnly = false) => {
    if (freeOnly) setResaleKeyGenerating(true); else setApiKeyGenerating(true);
    setApiKeyError(null);
    try {
      const t = await getAccessToken();
      if (!t) { setApiKeyError('Please log in first.'); return; }
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: freeOnly ? 'resale' : 'default', free_only: freeOnly }),
      });
      const data = await res.json();
      if (!res.ok) { setApiKeyError(data.error || 'Failed to generate key.'); return; }
      if (freeOnly) setNewResaleKey(data.key); else setNewApiKey(data.key);
      fetchApiKeys();
    } catch { setApiKeyError('Failed to generate key.'); }
    finally { if (freeOnly) setResaleKeyGenerating(false); else setApiKeyGenerating(false); }
  };

  const fetchAllowance = async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/staking/onchain-status', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) { const d = await res.json(); setAllowance(d.allowance ?? null); }
    } catch {}
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

  const checkDeposit = async () => {
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
          setDepositResult(`+${data.credited} credits added` + (data.message ? `. ${data.message}` : ''));
        } else {
          setDepositResult(data.message || 'No new deposits found');
        }
      } else {
        setDepositResult(data.error || 'Check failed');
      }
    } catch { setDepositResult('Failed to check'); }
    finally { setCheckingDeposit(false); }
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="pixel-sans text-fg-50 text-sm">Loading</div>
      </div>
    );
  }

  // Zero-state fallbacks: preview builds and failing APIs leave these null.
  const e = earnings ?? { pendingBalance: 0, todayEarnings: 0, totalEarnings: 0, wallet: null };
  const CREDITS_PER_USD = credits?.config?.creditsPerUsd ?? 100; // 1 credit = $0.01
  const topUpCredits = Math.round(Math.max(0, parseFloat(topUpUsd) || 0) * CREDITS_PER_USD);

  // every hook above has run by now, so bailing here is safe
  if (signedOut) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <SiteNav />

      {/* Main Content */}
      <main className="pt-32 pb-24 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="pixel-serif text-fg text-3xl md:text-4xl">Settings</h1>
          <p className="pixel-sans text-fg-50 text-sm mt-2">Manage your account, keys, and usage.</p>

          <div className="mt-8 md:mt-10 md:grid md:grid-cols-[164px_minmax(0,1fr)] md:gap-10">
            {/* Section nav */}
            <nav className="flex md:flex-col gap-1 mb-6 md:mb-0 overflow-x-auto pb-2 md:pb-0 border-b border-fg/[0.06] md:border-b-0 md:sticky md:top-32 md:self-start">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    window.history.replaceState(null, '', `#${tab.id === 'developer' ? 'api' : tab.id}`);
                  }}
                  className={`cursor-pointer pixel-sans text-sm px-3 py-2 rounded-lg text-left whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? 'text-fg bg-fg/[0.06]' : 'text-fg-50 hover:text-fg-80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Content */}
            <div className="space-y-6 min-w-0">

              {/* ── Account ── */}
              {activeTab === 'account' && (
                <>
                  <Card title="Account" description="Your identity on the network.">
                    <div className="divide-y divide-fg/[0.06]">
                      <div className="flex items-center justify-between gap-4 py-3">
                        <span className="pixel-sans text-fg-60 text-sm">Signed in as</span>
                        <span className="pixel-sans text-fg text-sm">{displayName ?? 'Anonymous'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-3">
                        <span className="pixel-sans text-fg-60 text-sm">Privy ID</span>
                        {user?.id ? (
                          <CopyValue text={user.id} display={`${user.id.slice(0, 12)}...`} />
                        ) : (
                          <span className="pixel-sans text-fg-40 text-sm">—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-4 py-3">
                        <span className="pixel-sans text-fg-60 text-sm">Member since</span>
                        <span className="pixel-sans text-fg-80 text-sm tabular-nums">
                          {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-3">
                        <span className="pixel-sans text-fg-60 text-sm">Prompts sent</span>
                        <span className="pixel-sans text-fg-80 text-sm tabular-nums">{profile?.prompts_sent ?? 0}</span>
                      </div>
                    </div>
                  </Card>

                  <Card
                    title="Connected accounts"
                    description="Sign-in methods and wallets linked to this account."
                    footer={
                      <p className="pixel-sans text-fg-40 text-[11px] leading-relaxed">
                        A Solana wallet (Phantom, Solflare, Backpack) is required for staking $ZERO and on-chain withdrawals.
                      </p>
                    }
                  >
                    <div className="divide-y divide-fg/[0.06]">
                      {/* X (Twitter) */}
                      <div className="flex items-center justify-between gap-4 py-3.5">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg border border-fg/10 bg-fg/[0.03] flex items-center justify-center flex-shrink-0">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-fg-70" aria-hidden>
                              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="pixel-sans text-fg text-sm">X (Twitter)</div>
                            <div className={`pixel-sans text-xs mt-0.5 truncate ${hasTwitter ? 'text-fg-60' : 'text-fg-40'}`}>
                              {hasTwitter ? `@${xUsername}` : 'Not connected'}
                            </div>
                          </div>
                        </div>
                        {hasTwitter ? (
                          <span className="pixel-sans text-xs text-fg-40 flex items-center gap-1.5">
                            <span className="text-emerald-400"><IconCheck size={12} /></span>
                            Connected
                          </span>
                        ) : (
                          <button onClick={handleLinkTwitter} disabled={linkingTwitter} className={btnSecondary}>
                            {linkingTwitter ? 'Linking' : 'Link X'}
                          </button>
                        )}
                      </div>

                      {/* Solana wallet */}
                      <div className="flex items-center justify-between gap-4 py-3.5">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg border border-fg/10 bg-fg/[0.03] flex items-center justify-center flex-shrink-0">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fg-70" aria-hidden>
                              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="pixel-sans text-fg text-sm">Solana wallet</div>
                            {hasWallet && walletAddress ? (
                              <div className="mt-0.5 [&>button]:text-xs">
                                <CopyValue text={walletAddress} display={`${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`} />
                              </div>
                            ) : (
                              <div className="pixel-sans text-fg-40 text-xs mt-0.5">Not connected</div>
                            )}
                          </div>
                        </div>
                        {!hasWallet ? (
                          <button onClick={handleLinkWallet} disabled={linkingWallet} className={btnSecondary}>
                            {linkingWallet ? 'Connecting' : 'Connect wallet'}
                          </button>
                        ) : hasTwitter ? (
                          <button onClick={handleUnlinkWallet} disabled={unlinkingWallet} className="cursor-pointer pixel-sans text-xs text-danger/70 hover:text-danger transition-colors disabled:opacity-50">
                            {unlinkingWallet ? 'Disconnecting' : 'Disconnect'}
                          </button>
                        ) : (
                          <span className="pixel-sans text-xs text-fg-40 flex items-center gap-1.5">
                            <span className="text-emerald-400"><IconCheck size={12} /></span>
                            Connected
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* Danger zone */}
                  <section className="border border-danger/20 bg-danger/[0.03] rounded-2xl p-5 md:p-6">
                    <h2 className="pixel-serif text-danger text-xl">Danger zone</h2>
                    <p className="pixel-sans text-fg-60 text-[13px] leading-relaxed mt-1.5">
                      Deleting your account permanently removes your profile and all associated data. This cannot be undone.
                    </p>
                    {!showDeleteConfirm ? (
                      <button onClick={() => setShowDeleteConfirm(true)} className={`${btnDanger} mt-5`}>
                        Delete account
                      </button>
                    ) : (
                      <div className="mt-5 border border-danger/25 bg-danger/[0.05] rounded-xl p-4 space-y-3">
                        <p className="pixel-sans text-danger text-sm">This will permanently delete your account. Are you sure?</p>
                        {deleteError && <p className="pixel-sans text-danger text-xs">{deleteError}</p>}
                        <div className="flex flex-wrap gap-3">
                          <button onClick={handleDeleteAccount} disabled={deleteLoading} className={btnDanger}>
                            {deleteLoading ? 'Deleting' : 'Yes, delete my account'}
                          </button>
                          <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }} disabled={deleteLoading} className={btnSecondary}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* ── Worker ── */}
              {activeTab === 'worker' && (
                <>
                  <Card
                    title="Worker tokens"
                    description="Authenticate a native worker on your machine with a token."
                    footer={
                      <>
                        <p className="pixel-sans text-fg-40 text-[11px]">Up to 5 active tokens. Each token is shown once at creation.</p>
                        <button onClick={generateToken} disabled={tokenGenerating} className={btnPrimary}>
                          {tokenGenerating ? 'Generating' : 'Generate token'}
                        </button>
                      </>
                    }
                  >
                    <div className="space-y-3">
                      {tokenError && <Notice tone="error">{tokenError}</Notice>}

                      <CopyField
                        text={`npx @c0mpute/worker --token ${newToken || '<token>'}`}
                        display={`npx @c0mpute/worker --token ${newToken || '<token>'}`}
                        accent={!!newToken}
                      />
                      {newToken && (
                        <Notice tone="info">Token created. Save the command above, it will not be shown again.</Notice>
                      )}

                      <div className="pt-2">
                        <div className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] mb-2">
                          Active tokens ({activeTokens.length}/5)
                        </div>
                        {loadingTokens ? (
                          <p className="pixel-sans text-fg-40 text-xs">Loading tokens</p>
                        ) : activeTokens.length > 0 ? (
                          <div className="divide-y divide-fg/[0.05] border border-fg/[0.06] rounded-xl px-3">
                            {activeTokens.map(t => (
                              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
                                  <span className="pixel-sans text-fg-80 text-xs font-mono">{t.id.slice(0, 8)}...</span>
                                  <span className="pixel-sans text-fg-40 text-[11px]">created {new Date(t.created_at).toLocaleDateString()}</span>
                                  {t.last_used_at && (
                                    <span className="pixel-sans text-fg-40 text-[11px]">last used {new Date(t.last_used_at).toLocaleDateString()}</span>
                                  )}
                                </div>
                                <button onClick={() => revokeToken(t.id)} className="cursor-pointer pixel-sans text-xs text-danger/70 hover:text-danger transition-colors flex-shrink-0">
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="pixel-sans text-fg-40 text-xs">No active tokens.</p>
                        )}
                      </div>
                    </div>
                  </Card>

                  <Card
                    title="Earnings"
                    description="You earn 70% of the USDC value of credits spent on jobs your worker completes."
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Stat label="Pending" value={<>${e.pendingBalance.toFixed(2)}</>} tone="positive" />
                      <Stat label="Today" value={<>${e.todayEarnings.toFixed(2)}</>} tone="dim" />
                      <Stat label="All time" value={<>${e.totalEarnings.toFixed(2)}</>} tone="dim" />
                    </div>

                    <div className="mt-5 pt-5 border-t border-fg/[0.06] space-y-3">
                      <div>
                        <label className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] mb-1.5 block">
                          Withdraw to Solana address
                        </label>
                        <input
                          type="text"
                          value={withdrawAddress}
                          onChange={(ev) => setWithdrawAddress(ev.target.value)}
                          placeholder="Your USDC wallet address"
                          spellCheck={false}
                          className="w-full bg-fg/[0.03] border border-fg/10 rounded-xl p-3 font-mono text-fg-80 text-xs outline-none focus:border-field-focus placeholder:text-fg-30 transition-colors"
                        />
                      </div>
                      <div className="flex items-center gap-2 bg-fg/[0.03] border border-fg/10 rounded-xl p-3 focus-within:border-field-focus transition-colors">
                        <span className="pixel-sans text-fg-50 text-base">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={withdrawAmount}
                          onChange={(ev) => setWithdrawAmount(ev.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent outline-none pixel-serif text-fg text-lg tabular-nums placeholder:text-fg-30 min-w-0"
                        />
                        <button
                          onClick={() => setWithdrawAmount(e.pendingBalance.toFixed(2))}
                          className={btnGhostSmall}
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
                          parseFloat(withdrawAmount) > Math.round(e.pendingBalance * 100) / 100 + 1e-9
                        }
                        className={`${btnPrimary} w-full py-2.5`}
                      >
                        {withdrawLoading ? 'Sending' : 'Withdraw USDC'}
                      </button>
                      {withdrawError && <Notice tone="error">{withdrawError}</Notice>}
                      {withdrawSuccess && <Notice tone="success">{withdrawSuccess}</Notice>}
                      <p className="pixel-sans text-fg-40 text-[11px]">
                        Minimum withdrawal is $1.00. Sent as USDC on Solana, no signature needed.
                      </p>
                    </div>
                  </Card>
                </>
              )}

              {/* ── API ── */}
              {activeTab === 'developer' && (
                <>
                  <Card
                    title="API keys"
                    description="OpenAI-compatible inference API. Point any SDK at the endpoint below by changing only the base URL and key."
                    footer={
                      <>
                        <p className="pixel-sans text-fg-40 text-[11px]">Up to 5 active keys. Each key is shown once at creation.</p>
                        <button onClick={() => generateApiKey(false)} disabled={apiKeyGenerating} className={btnPrimary}>
                          {apiKeyGenerating ? 'Generating' : 'Generate key'}
                        </button>
                      </>
                    }
                  >
                    <div className="space-y-3">
                      {apiKeyError && <Notice tone="error">{apiKeyError}</Notice>}

                      <CopyField
                        text={newApiKey}
                        display={newApiKey || 'sk-c0mpute-...'}
                        accent={!!newApiKey}
                      />
                      {newApiKey && (
                        <Notice tone="info">Key created. Copy it now, it will not be shown again.</Notice>
                      )}

                      <div className="bg-fg/[0.03] border border-fg/10 rounded-xl p-3 space-y-1.5">
                        <div className="flex items-baseline gap-3">
                          <span className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] w-16 flex-shrink-0">base url</span>
                          <code className="font-mono text-xs text-fg-70 select-all overflow-x-auto whitespace-nowrap">{brand.urls.api}</code>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] w-16 flex-shrink-0">models</span>
                          <code className="font-mono text-xs text-fg-70 select-all overflow-x-auto whitespace-nowrap">qwen3.8-27b-uncensored · qwen3.8-27b-uncensored-think · c0mpute-pro</code>
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] mb-2">
                          Active keys ({apiKeys.length}/5)
                        </div>
                        {loadingApiKeys ? (
                          <p className="pixel-sans text-fg-40 text-xs">Loading keys</p>
                        ) : apiKeys.length > 0 ? (
                          <div className="divide-y divide-fg/[0.05] border border-fg/[0.06] rounded-xl px-3">
                            {apiKeys.map(k => (
                              <div key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
                                  <span className="pixel-sans text-fg-80 text-xs font-mono">{k.key_prefix ? `${k.key_prefix}...` : 'sk-c0mpute-...'}</span>
                                  {k.free_only ? (
                                    <span className="pixel-sans text-steel text-[10px] px-1.5 py-0.5 rounded border border-steel/30">resale</span>
                                  ) : null}
                                  <span className="pixel-sans text-fg-40 text-[11px]">created {new Date(k.created_at).toLocaleDateString()}</span>
                                  {k.last_used_at && (
                                    <span className="pixel-sans text-fg-40 text-[11px]">last used {new Date(k.last_used_at).toLocaleDateString()}</span>
                                  )}
                                </div>
                                <button onClick={() => revokeApiKey(k.id)} className="cursor-pointer pixel-sans text-xs text-danger/70 hover:text-danger transition-colors flex-shrink-0">
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="pixel-sans text-fg-40 text-xs">No active keys.</p>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* Resale key: only for stakers who actually have a daily
                      allowance to resell. Spends allowance only, never deposited USDC. */}
                  {allowance?.enabled && allowance.dailyAllowance > 0 && (
                    <section className="border border-steel/30 bg-steel/[0.04] rounded-2xl p-5 md:p-6">
                      <h2 className="pixel-serif text-fg text-xl">Resale key</h2>
                      <p className="pixel-sans text-fg-60 text-[13px] leading-relaxed mt-1.5">
                        You have <span className="text-steel tabular-nums">{allowance.dailyAllowance}</span> credits per day of staking allowance ({allowance.remaining} left today). A resale key lets a marketplace spend only this daily allowance, never your deposited balance, so you can sell your unused inference. Safe to share.
                      </p>
                      <div className="mt-5 space-y-3">
                        <CopyField
                          text={newResaleKey}
                          display={newResaleKey || 'sk-c0mpute-...'}
                          accent={!!newResaleKey}
                        />
                        {newResaleKey && (
                          <Notice tone="info">Resale key created. Copy it now, it will not be shown again.</Notice>
                        )}
                        <button onClick={() => generateApiKey(true)} disabled={resaleKeyGenerating} className={btnPrimary}>
                          {resaleKeyGenerating ? 'Generating' : 'Generate resale key'}
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* ── Usage ── */}
              {activeTab === 'usage' && (
                <>
                  <Card
                    title="Credits"
                    description="Credits pay for prompts and API usage."
                    footer={<p className="pixel-sans text-fg-40 text-[11px]">1 credit = $0.01 USD.</p>}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Stat label="Balance" value={(credits?.balance ?? 0).toFixed(0)} />
                      <Stat label="Deposited" value={(credits?.totalDeposited ?? 0).toFixed(0)} tone="dim" />
                      <Stat label="Spent" value={(credits?.totalSpent ?? 0).toFixed(0)} tone="dim" />
                    </div>
                  </Card>

                  <Card title="Usage" description="Requests and tokens across chat and the API.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Stat label="Requests" value={(usage?.totalRequests ?? 0).toLocaleString()} />
                      <Stat label="Tokens generated" value={(usage?.totalTokens ?? 0).toLocaleString()} />
                    </div>
                    <div className="mt-5 pt-4 border-t border-fg/[0.06]">
                      <div className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] mb-2">By model</div>
                      {usage && usage.byModel.length > 0 ? (
                        <div className="divide-y divide-fg/[0.05] border border-fg/[0.06] rounded-xl px-3">
                          {usage.byModel.map((m) => (
                            <div key={m.model} className="flex items-center justify-between gap-3 py-2.5">
                              <span className="pixel-sans text-fg-80 text-xs font-mono truncate">{m.model}</span>
                              <span className="pixel-sans text-fg-50 text-xs tabular-nums whitespace-nowrap">
                                {m.requests.toLocaleString()} req · {m.tokens.toLocaleString()} tok
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="pixel-sans text-fg-40 text-xs">No usage recorded yet.</p>
                      )}
                    </div>
                  </Card>

                  <Card
                    title="Top up"
                    description="Deposit USDC on Solana to add credits."
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center gap-2 bg-fg/[0.03] border border-fg/10 rounded-xl p-3 focus-within:border-field-focus transition-colors">
                          <span className="pixel-sans text-fg-50 text-base">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={topUpUsd}
                            onChange={(ev) => setTopUpUsd(ev.target.value)}
                            placeholder="0"
                            className="flex-1 bg-transparent outline-none pixel-serif text-fg text-lg tabular-nums placeholder:text-fg-30 min-w-0"
                          />
                          <span className="pixel-sans text-fg-50 text-xs whitespace-nowrap">USDC</span>
                        </div>
                        <div className="flex items-baseline justify-between mt-2.5">
                          <span className="pixel-serif text-fg text-xl tabular-nums">
                            {topUpCredits.toLocaleString()} <span className="text-fg-50 text-sm">credits</span>
                          </span>
                          <span className="pixel-sans text-fg-40 text-[11px] tabular-nums">$1 = {CREDITS_PER_USD} credits</span>
                        </div>
                      </div>

                      <div>
                        <div className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] mb-2">Your deposit address</div>
                        <CopyField
                          text={credits?.depositWallet ?? null}
                          display={credits?.depositWallet || 'Deposit address unavailable'}
                          accent={!!credits?.depositWallet}
                          wrap
                        />
                        <p className="pixel-sans text-fg-40 text-[11px] mt-1.5">
                          Send only USDC (SPL token) to this address. Other tokens will be lost.
                        </p>
                      </div>

                      <button onClick={checkDeposit} disabled={checkingDeposit} className={`${btnSecondary} w-full py-2.5`}>
                        {checkingDeposit ? 'Checking' : 'Check for deposit'}
                      </button>
                      {depositResult && (
                        <Notice tone={depositResult.includes('added') ? 'success' : 'info'}>{depositResult}</Notice>
                      )}
                    </div>
                  </Card>

                  {credits?.recentTransactions && credits.recentTransactions.length > 0 && (
                    <Card title="Transaction history" description="Recent credit activity on your account.">
                      <div className="divide-y divide-fg/[0.05] border border-fg/[0.06] rounded-xl px-3">
                        {credits.recentTransactions.map((tx, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`pixel-sans text-[10px] px-2 py-0.5 rounded flex-shrink-0 ${
                                tx.type === 'deposit' ? 'bg-emerald-400/10 text-emerald-400' :
                                tx.type === 'refund' ? 'bg-steel/10 text-steel' :
                                'bg-fg/5 text-fg-60'
                              }`}>{txLabel(tx.type)}</span>
                              <span className="pixel-sans text-fg-60 text-xs truncate">{tx.description}</span>
                            </div>
                            <div className="flex items-baseline gap-3 flex-shrink-0">
                              <span className={`pixel-sans text-sm tabular-nums ${tx.amount === 0 || tx.type === 'spend' ? 'text-fg-60' : 'text-emerald-400'}`}>
                                {tx.amount === 0 ? '0' : `${tx.type === 'spend' ? '-' : '+'}${tx.amount}`}
                              </span>
                              <span className="pixel-sans text-fg-40 text-[11px] tabular-nums">{new Date(tx.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                </>
              )}

              {/* ── Referrals ── */}
              {activeTab === 'referrals' && (
                <Card
                  title="Referrals"
                  description={<>Share your link. You earn <span className="text-fg">5%</span> of the USDC value of every prompt your referrals pay for, forever.</>}
                  footer={
                    <p className="pixel-sans text-fg-40 text-[11px] leading-relaxed">
                      Referrals bind when someone signs up within 30 days of using your link. Free prompts and staking allowance usage do not pay referral fees. Earnings are withdrawable as USDC (rolling out).
                    </p>
                  }
                >
                  <div className="space-y-4">
                    <CopyField
                      text={referrals?.link ?? null}
                      display={referrals?.link || 'Referral link unavailable'}
                      accent={!!referrals?.link}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Stat label="Referred" value={referrals?.referredCount ?? 0} />
                      <Stat label="This month" value={<>${(referrals?.earnedUsdThisMonth ?? 0).toFixed(2)}</>} tone="positive" />
                      <Stat label="All time" value={<>${(referrals?.earnedUsd ?? 0).toFixed(2)}</>} tone="dim" />
                    </div>

                    <div className="pt-2">
                      <div className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em] mb-2">Recent earnings</div>
                      {referrals && referrals.recent.length > 0 ? (
                        <div className="divide-y divide-fg/[0.05] border border-fg/[0.06] rounded-xl px-3">
                          {referrals.recent.map((r, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                              <span className="pixel-sans text-fg-50 text-xs">
                                {new Date(r.created_at).toLocaleDateString()} · {r.tier}
                              </span>
                              <span className="pixel-sans text-emerald-400 text-xs tabular-nums">${r.usd.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="pixel-sans text-fg-40 text-xs">Earnings appear here when a referral pays for a prompt.</p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
