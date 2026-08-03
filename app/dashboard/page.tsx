'use client';

import { useState, useEffect, useCallback } from 'react';

interface Overview {
  totalUsers: number;
  totalJobs: number;
  totalTokensGenerated: number;
  totalEarningsPaid: number;
  totalCreditsDeposited: number;
  totalCreditsSpent: number;
  activeWorkerTokens: number;
  recentJobs: any[];
  recentPayouts: any[];
}

interface UserRow {
  privy_id: string;
  x_username: string | null;
  wallet_address: string | null;
  created_at: string;
  credit_balance: number;
  credits_deposited: number;
  credits_spent: number;
  worker_jobs: number;
  worker_tokens_generated: number;
  worker_earnings_usd: number;
}

interface RepRow {
  privy_id: string;
  x_username: string | null;
  canary_passed: number;
  canary_failed: number;
  coherence_failed: number;
  speed_strikes: number;
  total_strikes: number;
  banned: number;
  ban_reason: string | null;
  banned_at: string | null;
  updated_at: string;
}

type AdminTab = 'overview' | 'users' | 'reputation';
const TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'reputation', label: 'Reputation' },
];

/* ---------- shared button styles ---------- */
const btnPrimary = 'cursor-pointer pixel-sans text-[13px] font-medium px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary = 'cursor-pointer pixel-sans text-[13px] px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhostSmall = 'cursor-pointer pixel-sans text-[11px] px-2.5 py-1 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap';

/* ---------- primitives ---------- */

function Stat({ label, value, tone = 'default' }: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'dim';
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-2xl px-5 py-4 min-w-0">
      <div className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em] whitespace-nowrap">{label}</div>
      <div className={`pixel-serif text-2xl mt-1.5 tabular-nums truncate ${tone === 'dim' ? 'text-white/70' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function Chip({ tone = 'neutral', title, children }: {
  tone?: 'positive' | 'negative' | 'accent' | 'neutral';
  title?: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'positive' ? 'bg-emerald-400/10 text-emerald-400' :
    tone === 'negative' ? 'bg-red-400/10 text-red-400' :
    tone === 'accent' ? 'bg-[#80a0c1]/10 text-[#80a0c1]' :
    'bg-white/5 text-white/60';
  return (
    <span title={title} className={`pixel-sans inline-block px-2 py-0.5 rounded text-[10px] ${cls}`}>
      {children}
    </span>
  );
}

function TableCard({ title, meta, action, children }: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/10 bg-white/[0.02] rounded-2xl overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="pixel-serif text-white text-lg">{title}</h2>
          {meta !== undefined && <span className="pixel-sans text-white/40 text-xs tabular-nums">{meta}</span>}
        </div>
        {action}
      </div>
      <div className="px-6 pb-5">{children}</div>
    </section>
  );
}

const thCls = 'pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em] font-normal pb-2.5 pr-4 whitespace-nowrap';
const thNumCls = `${thCls} text-right`;

export default function DashboardPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reputation, setReputation] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Persist token in sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('admin_token');
    if (stored) { setToken(stored); setAuthed(true); }
  }, []);

  const apiGet = useCallback(async (action: string) => {
    const res = await fetch(`/api/admin?action=${action}`, { headers: { 'x-admin-token': token } });
    if (!res.ok) { if (res.status === 401) { setAuthed(false); sessionStorage.removeItem('admin_token'); } throw new Error('Failed'); }
    return res.json();
  }, [token]);

  const apiPost = useCallback(async (body: any) => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { if (res.status === 401) { setAuthed(false); sessionStorage.removeItem('admin_token'); } const data = await res.json(); throw new Error(data.error || 'Failed'); }
    return res.json();
  }, [token]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try { setOverview(await apiGet('overview')); } catch {} finally { setLoading(false); }
  }, [apiGet]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try { const data = await apiGet('users'); setUsers(data.users); } catch {} finally { setLoading(false); }
  }, [apiGet]);

  const loadReputation = useCallback(async () => {
    setLoading(true);
    try { const data = await apiGet('reputation'); setReputation(data.reputation); } catch {} finally { setLoading(false); }
  }, [apiGet]);

  useEffect(() => {
    if (!authed) return;
    if (tab === 'overview') loadOverview();
    if (tab === 'users') loadUsers();
    if (tab === 'reputation') loadReputation();
  }, [authed, tab, loadOverview, loadUsers, loadReputation]);

  const handleLogin = () => {
    sessionStorage.setItem('admin_token', token);
    setAuthed(true);
  };

  const handleSetCredits = async (privyId: string) => {
    const amount = prompt('Set credit balance to:');
    if (amount === null) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) { setActionResult('Invalid amount'); return; }
    try {
      const result = await apiPost({ action: 'set_credits', privyId, amount: num });
      setActionResult(`Credits set: ${result.previousBalance} to ${result.newBalance}`);
      loadUsers();
    } catch (e: any) { setActionResult(`Error: ${e.message}`); }
  };

  const handleAddCredits = async (privyId: string) => {
    const amount = prompt('Add credits:');
    if (amount === null) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setActionResult('Invalid amount'); return; }
    try {
      const result = await apiPost({ action: 'add_credits', privyId, amount: num });
      setActionResult(`Added ${num} credits. New balance: ${result.newBalance}`);
      loadUsers();
    } catch (e: any) { setActionResult(`Error: ${e.message}`); }
  };

  const handleUnban = async (privyId: string) => {
    if (!confirm('Unban this worker and reset its strikes to 0?')) return;
    try {
      await apiPost({ action: 'unban_worker', privyId });
      setActionResult('Worker unbanned and strikes reset.');
      loadReputation();
    } catch (e: any) { setActionResult(`Error: ${e.message}`); }
  };

  /* ── Gate ── */
  if (!authed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-8 max-w-sm w-full">
          <div className="pixel-serif-logo text-white/40 text-sm mb-6">c0mpute</div>
          <h1 className="pixel-serif text-white text-2xl">Admin console</h1>
          <p className="pixel-sans text-white/50 text-sm mt-1.5 mb-6">Enter the admin key to continue.</p>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Admin key"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl text-white px-4 py-3 mb-4 pixel-sans text-sm focus:outline-none focus:border-white/25 placeholder:text-white/30 transition-colors"
          />
          <button onClick={handleLogin} className={`${btnPrimary} w-full py-2.5`}>
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = search.trim()
    ? users.filter(u =>
        (u.x_username || '').toLowerCase().includes(search.toLowerCase()) ||
        u.privy_id.toLowerCase().includes(search.toLowerCase()) ||
        (u.wallet_address || '').toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/[0.08] sticky top-0 z-50 bg-black/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg flex items-center flex-shrink-0">
              c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
            </a>
            <span className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em] border border-white/10 rounded px-1.5 py-0.5">
              admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-0.5 border border-white/10 bg-white/[0.02] rounded-lg p-0.5">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`cursor-pointer pixel-sans text-xs px-3 py-1.5 rounded-md transition-colors ${
                    tab === t.id ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { sessionStorage.removeItem('admin_token'); setAuthed(false); }}
              className="cursor-pointer pixel-sans text-xs text-white/40 hover:text-white transition-colors whitespace-nowrap"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Action result banner */}
        {actionResult && (
          <div className="mb-6 flex items-center justify-between gap-4 border border-[#80a0c1]/25 bg-[#80a0c1]/[0.07] rounded-xl px-4 py-3">
            <span className="pixel-sans text-[#80a0c1] text-sm">{actionResult}</span>
            <button
              onClick={() => setActionResult(null)}
              aria-label="Dismiss"
              className="cursor-pointer text-[#80a0c1]/60 hover:text-[#80a0c1] transition-colors flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {loading && <p className="pixel-sans text-white/40 text-xs mb-4">Loading</p>}

        {/* ── Overview ── */}
        {tab === 'overview' && overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Users" value={overview.totalUsers} />
              <Stat label="Jobs" value={overview.totalJobs.toLocaleString()} />
              <Stat label="Tokens generated" value={overview.totalTokensGenerated.toLocaleString()} />
              <Stat label="Worker tokens" value={overview.activeWorkerTokens} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="Earnings paid" value={<>${overview.totalEarningsPaid.toFixed(2)}</>} tone="dim" />
              <Stat label="Credits deposited" value={overview.totalCreditsDeposited.toLocaleString()} tone="dim" />
              <Stat label="Credits spent" value={overview.totalCreditsSpent.toLocaleString()} tone="dim" />
            </div>

            {/* Recent jobs */}
            <TableCard title="Recent jobs">
              {overview.recentJobs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={thCls}>ID</th>
                        <th className={thCls}>Worker</th>
                        <th className={thCls}>Tier</th>
                        <th className={thNumCls}>Tokens</th>
                        <th className={thNumCls}>Duration</th>
                        <th className={`${thCls} pr-0`}>Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {overview.recentJobs.map((j: any) => (
                        <tr key={j.id}>
                          <td className="pixel-sans text-white/70 text-xs py-2.5 pr-4 font-mono">{j.id?.slice(0, 8)}</td>
                          <td className="pixel-sans text-white/50 text-xs py-2.5 pr-4 font-mono">{j.worker_privy_id?.slice(-8)}</td>
                          <td className="pixel-sans text-white/50 text-xs py-2.5 pr-4">{j.tier}</td>
                          <td className="pixel-sans text-white/70 text-xs py-2.5 pr-4 text-right tabular-nums">{j.tokens_generated}</td>
                          <td className="pixel-sans text-white/70 text-xs py-2.5 pr-4 text-right tabular-nums">{j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                          <td className="pixel-sans text-white/50 text-xs py-2.5 tabular-nums">{j.completed_at ? new Date(j.completed_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="pixel-sans text-white/40 text-xs">No jobs recorded yet.</p>
              )}
            </TableCard>

            {/* Recent payouts */}
            {overview.recentPayouts.length > 0 && (
              <TableCard title="Recent payouts">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={thCls}>Worker</th>
                        <th className={thNumCls}>Amount</th>
                        <th className={thCls}>Wallet</th>
                        <th className={thCls}>Status</th>
                        <th className={`${thCls} pr-0`}>Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {overview.recentPayouts.map((p: any) => (
                        <tr key={p.id}>
                          <td className="pixel-sans text-white/50 text-xs py-2.5 pr-4 font-mono">{p.privy_id?.slice(-8)}</td>
                          <td className="pixel-sans text-white/80 text-xs py-2.5 pr-4 text-right tabular-nums">${p.amount_usd?.toFixed(2)}</td>
                          <td className="pixel-sans text-white/70 text-xs py-2.5 pr-4 font-mono">{p.wallet_address?.slice(0, 8)}...</td>
                          <td className="py-2.5 pr-4">
                            <Chip tone={
                              p.status === 'completed' ? 'positive' :
                              p.status === 'pending_transfer' ? 'accent' :
                              'negative'
                            }>{p.status}</Chip>
                          </td>
                          <td className="pixel-sans text-white/50 text-xs py-2.5 tabular-nums">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TableCard>
            )}
          </div>
        )}

        {/* Overview zero state (API unreachable or empty response) */}
        {tab === 'overview' && !overview && !loading && (
          <section className="border border-white/10 bg-white/[0.02] rounded-2xl p-10 text-center">
            <h2 className="pixel-serif text-white text-lg">Overview unavailable</h2>
            <p className="pixel-sans text-white/50 text-sm mt-1.5 mb-5">The admin API did not return any data.</p>
            <button onClick={loadOverview} className={btnSecondary}>Retry</button>
          </section>
        )}

        {/* ── Users ── */}
        {tab === 'users' && (
          <TableCard
            title="Users"
            meta={filteredUsers.length}
            action={
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, wallet, or ID"
                className="pixel-sans text-[13px] bg-white/[0.03] border border-white/10 rounded-lg px-3.5 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 w-full sm:w-64 transition-colors"
              />
            }
          >
            {filteredUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className={thCls}>User</th>
                      <th className={thCls}>Wallet</th>
                      <th className={thNumCls}>Credits</th>
                      <th className={thNumCls}>Worker jobs</th>
                      <th className={thNumCls}>Worker earned</th>
                      <th className={`${thCls} pr-0 text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredUsers.map(u => (
                      <tr key={u.privy_id}>
                        <td className="py-3 pr-4">
                          {u.x_username && <div className="pixel-sans text-white text-xs">@{u.x_username}</div>}
                          <div className="pixel-sans text-white/40 text-[10px] font-mono">{u.privy_id.slice(-16)}</div>
                        </td>
                        <td className="pixel-sans text-white/70 text-xs py-3 pr-4 font-mono">
                          {u.wallet_address ? `${u.wallet_address.slice(0, 4)}...${u.wallet_address.slice(-4)}` : '—'}
                        </td>
                        <td className="py-3 pr-4 text-right whitespace-nowrap">
                          <span className="pixel-sans text-white/80 text-xs tabular-nums">{u.credit_balance.toFixed(0)}</span>
                          <span className="pixel-sans text-white/40 text-[10px] ml-1.5 tabular-nums">{u.credits_spent.toFixed(0)} spent</span>
                        </td>
                        <td className="pixel-sans text-white/60 text-xs py-3 pr-4 text-right tabular-nums">{u.worker_jobs}</td>
                        <td className="pixel-sans text-white/60 text-xs py-3 pr-4 text-right tabular-nums">${u.worker_earnings_usd.toFixed(2)}</td>
                        <td className="py-3">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => handleSetCredits(u.privy_id)} className={btnGhostSmall}>
                              Set credits
                            </button>
                            <button onClick={() => handleAddCredits(u.privy_id)} className="cursor-pointer pixel-sans text-[11px] px-2.5 py-1 rounded-md border border-[#80a0c1]/30 text-[#80a0c1]/80 hover:text-[#80a0c1] hover:bg-[#80a0c1]/10 transition-colors whitespace-nowrap">
                              Add credits
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pixel-sans text-white/40 text-xs">
                {search.trim() ? 'No users match this search.' : 'No users loaded.'}
              </p>
            )}
          </TableCard>
        )}

        {/* ── Reputation ── */}
        {tab === 'reputation' && (
          <TableCard
            title="Worker reputation"
            meta={reputation.length}
            action={<span className="pixel-sans text-white/40 text-xs">Workers are banned automatically at 5 strikes</span>}
          >
            {reputation.length === 0 ? (
              <p className="pixel-sans text-white/40 text-xs leading-relaxed">
                No flagged workers yet. Strikes appear here when a worker fails a canary, fails a coherence check, or returns output at impossible speed.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className={thCls}>Worker</th>
                      <th className={thNumCls}>Canary pass / fail</th>
                      <th className={thNumCls}>Coherence fails</th>
                      <th className={thNumCls}>Speed strikes</th>
                      <th className={thNumCls}>Total strikes</th>
                      <th className={thCls}>Status</th>
                      <th className={thCls}>Last activity</th>
                      <th className={`${thCls} pr-0 text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {reputation.map(r => (
                      <tr key={r.privy_id}>
                        <td className="py-3 pr-4">
                          {r.x_username && <div className="pixel-sans text-white text-xs">@{r.x_username}</div>}
                          <div className="pixel-sans text-white/40 text-[10px] font-mono">{r.privy_id.slice(-16)}</div>
                        </td>
                        <td className="pixel-sans text-xs py-3 pr-4 text-right tabular-nums whitespace-nowrap">
                          <span className="text-emerald-400">{r.canary_passed}</span>
                          <span className="text-white/30"> / </span>
                          <span className={r.canary_failed > 0 ? 'text-red-400' : 'text-white/50'}>{r.canary_failed}</span>
                        </td>
                        <td className={`pixel-sans text-xs py-3 pr-4 text-right tabular-nums ${r.coherence_failed > 0 ? 'text-red-400' : 'text-white/50'}`}>{r.coherence_failed}</td>
                        <td className={`pixel-sans text-xs py-3 pr-4 text-right tabular-nums ${r.speed_strikes > 0 ? 'text-red-400' : 'text-white/50'}`}>{r.speed_strikes}</td>
                        <td className={`pixel-sans text-xs py-3 pr-4 text-right tabular-nums ${r.total_strikes >= 3 ? 'text-red-400' : r.total_strikes > 0 ? 'text-amber-400' : 'text-white/50'}`}>{r.total_strikes}</td>
                        <td className="py-3 pr-4">
                          {r.banned ? (
                            <Chip tone="negative" title={r.ban_reason || undefined}>banned</Chip>
                          ) : (
                            <Chip tone="positive">ok</Chip>
                          )}
                        </td>
                        <td className="pixel-sans text-white/50 text-xs py-3 pr-4 tabular-nums">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                        <td className="py-3 text-right">
                          {r.banned ? (
                            <button onClick={() => handleUnban(r.privy_id)} className="cursor-pointer pixel-sans text-[11px] px-2.5 py-1 rounded-md border border-[#80a0c1]/30 text-[#80a0c1]/80 hover:text-[#80a0c1] hover:bg-[#80a0c1]/10 transition-colors whitespace-nowrap">
                              Unban
                            </button>
                          ) : (
                            <span className="pixel-sans text-white/30 text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableCard>
        )}
      </main>
    </div>
  );
}
