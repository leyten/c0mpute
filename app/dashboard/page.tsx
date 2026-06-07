'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'overview' | 'users' | 'reputation'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reputation, setReputation] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setActionResult(`Credits set: ${result.previousBalance} → ${result.newBalance}`);
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

  if (!authed) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-8 max-w-sm w-full mx-4">
          <h1 className="pixel-serif text-white text-2xl mb-2">Admin</h1>
          <p className="pixel-sans text-white/70 text-sm mb-6">Enter admin key to continue.</p>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Admin key"
            className="w-full bg-black border border-white/10 rounded-xl text-white px-4 py-3 mb-4 text-sm focus:outline-none focus:border-white/20"
          />
          <button onClick={handleLogin} className="cursor-pointer w-full pixel-serif text-sm py-3 rounded-xl bg-white text-black hover:bg-white/90 transition-colors">
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="pixel-serif text-white text-xl">c0mpute admin</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
              {(['overview', 'users', 'reputation'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`pixel-sans text-xs px-4 py-2 transition-colors ${tab === t ? 'bg-[#80a0c1]/20 text-[#80a0c1]' : 'text-white/70 hover:text-white/60'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={() => { sessionStorage.removeItem('admin_token'); setAuthed(false); }} className="pixel-sans text-xs text-white/60 hover:text-white/60">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Action result banner */}
        {actionResult && (
          <div className="mb-6 p-3 border border-[#80a0c1]/30 bg-[#80a0c1]/10 rounded-lg flex justify-between items-center">
            <span className="pixel-sans text-[#80a0c1] text-sm">{actionResult}</span>
            <button onClick={() => setActionResult(null)} className="pixel-sans text-[#80a0c1]/50 text-xs">✕</button>
          </div>
        )}

        {loading && <p className="pixel-sans text-white/60 text-sm">Loading...</p>}

        {/* Overview */}
        {tab === 'overview' && overview && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Users', value: overview.totalUsers },
                { label: 'Jobs', value: overview.totalJobs.toLocaleString() },
                { label: 'Tokens Generated', value: overview.totalTokensGenerated.toLocaleString() },
                { label: 'Worker Tokens', value: overview.activeWorkerTokens },
              ].map((s, i) => (
                <div key={i} className="border border-white/10 bg-white/[0.02] rounded-2xl p-5 text-center">
                  <div className="pixel-serif text-white text-2xl">{s.value}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Earnings Paid', value: <><span className="dollar">$</span>{overview.totalEarningsPaid.toFixed(2)}</> },
                { label: 'Credits Deposited', value: overview.totalCreditsDeposited.toLocaleString() },
                { label: 'Credits Spent', value: overview.totalCreditsSpent.toLocaleString() },
              ].map((s, i) => (
                <div key={i} className="border border-white/5 bg-white/[0.01] rounded-xl p-4 text-center">
                  <div className="pixel-serif text-white/70 text-xl">{s.value}</div>
                  <div className="pixel-sans text-white/60 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent jobs */}
            <section className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h2 className="pixel-serif text-white text-lg mb-4">Recent Jobs</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['ID', 'Worker', 'Tier', 'Tokens', 'Duration', 'Time'].map(h => (
                        <th key={h} className="pixel-sans text-white/60 text-[10px] uppercase tracking-wider pb-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentJobs.map((j: any) => (
                      <tr key={j.id} className="border-b border-white/[0.03]">
                        <td className="pixel-sans text-white/70 text-xs py-2 pr-4 font-mono">{j.id?.slice(0, 8)}</td>
                        <td className="pixel-sans text-white/50 text-xs py-2 pr-4 font-mono">{j.worker_privy_id?.slice(-8)}</td>
                        <td className="pixel-sans text-white/50 text-xs py-2 pr-4">{j.tier}</td>
                        <td className="pixel-sans text-white/60 text-xs py-2 pr-4">{j.tokens_generated}</td>
                        <td className="pixel-sans text-white/70 text-xs py-2 pr-4">{j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                        <td className="pixel-sans text-white/60 text-xs py-2">{j.completed_at ? new Date(j.completed_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent payouts */}
            {overview.recentPayouts.length > 0 && (
              <section className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
                <h2 className="pixel-serif text-white text-lg mb-4">Recent Payouts</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5">
                        {['Worker', 'Amount', 'Wallet', 'Status', 'Time'].map(h => (
                          <th key={h} className="pixel-sans text-white/60 text-[10px] uppercase tracking-wider pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentPayouts.map((p: any) => (
                        <tr key={p.id} className="border-b border-white/[0.03]">
                          <td className="pixel-sans text-white/50 text-xs py-2 pr-4 font-mono">{p.privy_id?.slice(-8)}</td>
                          <td className="pixel-sans text-white/60 text-xs py-2 pr-4"><span className="dollar">$</span>{p.amount_usd?.toFixed(2)}</td>
                          <td className="pixel-sans text-white/70 text-xs py-2 pr-4 font-mono">{p.wallet_address?.slice(0, 8)}...</td>
                          <td className="pixel-sans text-xs py-2 pr-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              p.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                              p.status === 'pending_transfer' ? 'bg-[#80a0c1]/15 text-[#80a0c1]' :
                              'bg-red-500/15 text-red-400'
                            }`}>{p.status}</span>
                          </td>
                          <td className="pixel-sans text-white/60 text-xs py-2">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (() => {
          const filtered = search.trim()
            ? users.filter(u =>
                (u.x_username || '').toLowerCase().includes(search.toLowerCase()) ||
                u.privy_id.toLowerCase().includes(search.toLowerCase()) ||
                (u.wallet_address || '').toLowerCase().includes(search.toLowerCase())
              )
            : users;
          return (
          <section className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="pixel-serif text-white text-lg">Users ({filtered.length})</h2>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, wallet, ID..."
                className="pixel-sans text-sm bg-black border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-white/45 focus:outline-none focus:border-white/20 w-64"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    {['User', 'Wallet', 'Credits', 'Worker Jobs', 'Worker Earned', 'Actions'].map(h => (
                      <th key={h} className="pixel-sans text-white/60 text-[10px] uppercase tracking-wider pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.privy_id} className="border-b border-white/[0.03]">
                      <td className="py-3 pr-4">
                        {u.x_username && <div className="pixel-sans text-white text-xs">@{u.x_username}</div>}
                        <div className="pixel-sans text-white/55 text-[10px] font-mono">{u.privy_id.slice(-16)}</div>
                      </td>
                      <td className="pixel-sans text-white/70 text-xs py-3 pr-4 font-mono">{u.wallet_address ? `${u.wallet_address.slice(0, 4)}...${u.wallet_address.slice(-4)}` : '—'}</td>
                      <td className="py-3 pr-4">
                        <span className="pixel-sans text-white/70 text-xs">{u.credit_balance.toFixed(0)}</span>
                        <span className="pixel-sans text-white/55 text-[10px] ml-1">({u.credits_spent.toFixed(0)} spent)</span>
                      </td>
                      <td className="pixel-sans text-white/50 text-xs py-3 pr-4">{u.worker_jobs}</td>
                      <td className="pixel-sans text-white/50 text-xs py-3 pr-4"><span className="dollar">$</span>{u.worker_earnings_usd.toFixed(2)}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleSetCredits(u.privy_id)} className="pixel-sans text-[10px] px-2 py-1 rounded border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                            Set Credits
                          </button>
                          <button onClick={() => handleAddCredits(u.privy_id)} className="pixel-sans text-[10px] px-2 py-1 rounded border border-[#80a0c1]/30 text-[#80a0c1]/60 hover:text-[#80a0c1] hover:bg-[#80a0c1]/10 transition-colors">
                            + Credits
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          );
        })()}

        {/* Reputation */}
        {tab === 'reputation' && (
          <section className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="pixel-serif text-white text-lg">Worker Reputation ({reputation.length})</h2>
              <span className="pixel-sans text-white/50 text-xs">Auto-ban at 5 strikes</span>
            </div>
            {reputation.length === 0 ? (
              <p className="pixel-sans text-white/50 text-sm">No flagged workers yet. Strikes appear here when a worker fails a canary, coherence check, or returns output at impossible speed.</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Worker', 'Canary ✓/✗', 'Coherence ✗', 'Speed ✗', 'Total Strikes', 'Status', 'Last Activity', 'Actions'].map(h => (
                      <th key={h} className="pixel-sans text-white/60 text-[10px] uppercase tracking-wider pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reputation.map(r => (
                    <tr key={r.privy_id} className="border-b border-white/[0.03]">
                      <td className="py-3 pr-4">
                        {r.x_username && <div className="pixel-sans text-white text-xs">@{r.x_username}</div>}
                        <div className="pixel-sans text-white/55 text-[10px] font-mono">{r.privy_id.slice(-16)}</div>
                      </td>
                      <td className="pixel-sans text-xs py-3 pr-4">
                        <span className="text-green-400">{r.canary_passed}</span>
                        <span className="text-white/40"> / </span>
                        <span className={r.canary_failed > 0 ? 'text-red-400' : 'text-white/50'}>{r.canary_failed}</span>
                      </td>
                      <td className={`pixel-sans text-xs py-3 pr-4 ${r.coherence_failed > 0 ? 'text-red-400' : 'text-white/50'}`}>{r.coherence_failed}</td>
                      <td className={`pixel-sans text-xs py-3 pr-4 ${r.speed_strikes > 0 ? 'text-red-400' : 'text-white/50'}`}>{r.speed_strikes}</td>
                      <td className="pixel-sans text-xs py-3 pr-4">
                        <span className={r.total_strikes >= 3 ? 'text-red-400' : r.total_strikes > 0 ? 'text-yellow-400' : 'text-white/50'}>{r.total_strikes}</span>
                      </td>
                      <td className="pixel-sans text-xs py-3 pr-4">
                        {r.banned ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400" title={r.ban_reason || undefined}>banned</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400">ok</span>
                        )}
                      </td>
                      <td className="pixel-sans text-white/60 text-xs py-3 pr-4">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                      <td className="py-3">
                        {r.banned ? (
                          <button onClick={() => handleUnban(r.privy_id)} className="cursor-pointer pixel-sans text-[10px] px-2 py-1 rounded border border-[#80a0c1]/30 text-[#80a0c1]/60 hover:text-[#80a0c1] hover:bg-[#80a0c1]/10 transition-colors">
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
          </section>
        )}
      </main>
    </div>
  );
}
