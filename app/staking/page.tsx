'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface StakingStatus {
  launched: boolean;
  stakingAddress?: string;
  stakedAmount?: number;
  matureAmount?: number;
  stakedSince?: string | number | null;
  nextMatureAt?: string | null;
  eligible?: boolean;
  minAgeMs?: number;
  minUnstake?: number;
  workerThreshold?: number;
  claimableUsd?: number;
  totalEarnedUsd?: number;
  totalStaked?: number;
  nextEpochAt?: string | null;
  stakerPoolUsd?: number;
  projectedRewardUsd?: number;
}

function zero(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function countdownTo(when: string | null | undefined): string {
  if (!when) return '';
  const remaining = Date.parse(when) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return '';
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export default function StakingPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, getAccessToken } = useAuth();

  const [status, setStatus] = useState<StakingStatus | null>(null);
  const [copied, setCopied] = useState(false);

  const [unstakeAddress, setUnstakeAddress] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [unstakeLoading, setUnstakeLoading] = useState(false);
  const [unstakeError, setUnstakeError] = useState<string | null>(null);
  const [unstakeSuccess, setUnstakeSuccess] = useState<string | null>(null);

  const [claimAddress, setClaimAddress] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const res = await fetch('/api/staking/status', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, [getAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [isAuthenticated, fetchStatus]);

  if (!isLoading && !isAuthenticated) {
    router.push('/');
    return null;
  }

  const submitUnstake = async () => {
    setUnstakeLoading(true);
    setUnstakeError(null);
    setUnstakeSuccess(null);
    try {
      const t = await getAccessToken();
      const res = await fetch('/api/staking/unstake', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: unstakeAddress.trim(), amount: parseFloat(unstakeAmount) }),
      });
      const d = await res.json();
      if (res.ok) {
        setUnstakeSuccess(`Unstaked ${zero(parseFloat(unstakeAmount))} ZERO`);
        setUnstakeAmount('');
        fetchStatus();
      } else {
        setUnstakeError(d.error || 'Unstake failed');
      }
    } catch { setUnstakeError('Unstake failed'); }
    finally { setUnstakeLoading(false); }
  };

  const submitClaim = async () => {
    setClaimLoading(true);
    setClaimError(null);
    setClaimSuccess(null);
    try {
      const t = await getAccessToken();
      const res = await fetch('/api/staking/claim-rewards', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: claimAddress.trim(), amount: parseFloat(claimAmount) }),
      });
      const d = await res.json();
      if (res.ok) {
        setClaimSuccess(`Claimed ${d.amount.toFixed(2)} USDC`);
        setClaimAmount('');
        fetchStatus();
      } else {
        setClaimError(d.error || 'Claim failed');
      }
    } catch { setClaimError('Claim failed'); }
    finally { setClaimLoading(false); }
  };

  const staked = status?.stakedAmount ?? 0;
  const mature = status?.matureAmount ?? 0;
  const cooling = Math.max(0, staked - mature);
  const threshold = status?.workerThreshold ?? 0;
  const boostActive = mature >= threshold;
  const maturityCountdown = countdownTo(status?.nextMatureAt);
  const epochCountdown = countdownTo(status?.nextEpochAt);
  const minUnstake = status?.minUnstake ?? 0;
  const unstakeAmt = parseFloat(unstakeAmount);
  const isFullUnstake = Number.isFinite(unstakeAmt) && unstakeAmt >= staked - 1e-9;
  const partialBelowMin = Number.isFinite(unstakeAmt) && unstakeAmt > 0 && !isFullUnstake && unstakeAmt < minUnstake;

  return (
    <div className="min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex-1">
              <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
              </a>
            </div>
            <button onClick={() => router.push('/')} className="pixel-sans text-sm text-white/70 hover:text-white transition-colors">
              ← Back
            </button>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="pixel-serif text-white text-3xl md:text-4xl mb-3">Stake <span className="dollar">$</span>ZERO</h1>
          <p className="pixel-sans text-white/70 text-sm mb-8 max-w-xl">
            Stake <span className="dollar">$</span>ZERO to earn a share of protocol revenue, paid in USDC. Workers who stake also earn a higher revenue share on jobs they complete.
          </p>

          {isLoading || !status ? (
            <p className="pixel-sans text-white/60 text-sm">Loading…</p>
          ) : !status.launched ? (
            <div className="border border-[#80a0c1]/30 bg-[#80a0c1]/10 rounded-2xl p-6">
              <p className="pixel-sans text-[#80a0c1] text-sm">
<span className="dollar">$</span>ZERO has not launched yet. Staking activates the moment the token goes live.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Your stake */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Your stake</h2>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl">{zero(staked)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">ZERO staked</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-green-400 text-2xl">{zero(mature)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">earning</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl">{zero(cooling)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">
                      {cooling > 0 && maturityCountdown ? `matures in ${maturityCountdown}` : 'cooling down'}
                    </div>
                  </div>
                </div>

                {threshold > 0 && (
                  <div className={`rounded-xl p-3 mb-5 border ${boostActive ? 'border-green-500/25 bg-green-500/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
                    <p className="pixel-sans text-xs text-white/70">
                      {boostActive ? (
                        <span className="text-green-400/90">Worker boost active</span>
                      ) : (
                        <>Hold {zero(threshold)} ZERO staked for 24h to boost your worker revenue share to 80%.</>
                      )}{' '}
                      {!boostActive && mature > 0 && (
                        <span className="text-white/55">({zero(threshold - mature)} more matured)</span>
                      )}
                    </p>
                  </div>
                )}

                <div>
                  <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-2">Your staking address</div>
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
                    <code className="font-mono text-[#80a0c1] text-xs flex-1 break-all select-all">{status.stakingAddress}</code>
                    <button
                      onClick={() => {
                        if (status.stakingAddress) {
                          navigator.clipboard.writeText(status.stakingAddress);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="pixel-sans text-white/55 text-[11px] mt-1.5">
                    Send <span className="dollar">$</span>ZERO to this address to stake. Only send <span className="dollar">$</span>ZERO — other tokens will be lost. Rewards require 24h staked.
                  </p>
                </div>
              </section>

              {/* Unstake */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Unstake</h2>
                <div className="space-y-3">
                  <div>
                    <label className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-1.5 block">Send ZERO to Solana address</label>
                    <input
                      type="text"
                      value={unstakeAddress}
                      onChange={(e) => setUnstakeAddress(e.target.value)}
                      placeholder="Your wallet address"
                      spellCheck={false}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-3 font-mono text-[#80a0c1] text-xs outline-none focus:border-white/25 placeholder-white/40"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={unstakeAmount}
                      onChange={(e) => setUnstakeAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-transparent outline-none pixel-serif text-white text-lg placeholder-white/40"
                    />
                    <span className="pixel-sans text-white/60 text-xs">ZERO</span>
                    <button
                      onClick={() => setUnstakeAmount(String(staked))}
                      className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                    >
                      Max
                    </button>
                  </div>
                  <button
                    onClick={submitUnstake}
                    disabled={
                      unstakeLoading ||
                      !unstakeAddress.trim() ||
                      !(parseFloat(unstakeAmount) > 0) ||
                      parseFloat(unstakeAmount) > staked ||
                      partialBelowMin
                    }
                    className="w-full pixel-serif px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {unstakeLoading ? 'Sending…' : 'Unstake'}
                  </button>
                  <p className="pixel-sans text-white/55 text-[11px]">
                    Pulls from your most recent deposits first, so stake aged past 24h keeps earning.
                    {minUnstake > 0 && <> Partial unstakes are min {zero(minUnstake)} ZERO; use Max to withdraw everything.</>}
                  </p>
                  {partialBelowMin && (
                    <p className="pixel-sans text-red-400 text-xs">Minimum partial unstake is {zero(minUnstake)} ZERO — or hit Max to withdraw your full balance.</p>
                  )}
                  {unstakeError && <p className="pixel-sans text-red-400 text-xs">{unstakeError}</p>}
                  {unstakeSuccess && <p className="pixel-sans text-green-400/80 text-xs">{unstakeSuccess}</p>}
                </div>
              </section>

              {/* Rewards */}
              <section className="border border-white/10 bg-white/[0.02] p-6 rounded-2xl">
                <h2 className="pixel-serif text-white text-xl mb-4">Rewards</h2>

                {/* Next payout: projected USDC share of the staker pool, paid at the daily epoch */}
                <div className="p-4 mb-4 bg-[#80a0c1]/[0.06] border border-[#80a0c1]/20 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <div className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-1">Next payout</div>
                    {status.eligible ? (
                      <div className="pixel-serif text-[#80a0c1] text-2xl">~<span className="dollar">$</span>{(status.projectedRewardUsd ?? 0).toFixed(2)}</div>
                    ) : (
                      <div className="pixel-serif text-white/70 text-lg">Starts after maturity</div>
                    )}
                  </div>
                  <div className="text-right">
                    {status.eligible ? (
                      <>
                        <div className="pixel-sans text-white/70 text-sm">in {epochCountdown || 'soon'}</div>
                        <div className="pixel-sans text-white/45 text-[11px] mt-0.5">share of <span className="dollar">$</span>{(status.stakerPoolUsd ?? 0).toFixed(2)} pool</div>
                      </>
                    ) : (
                      <div className="pixel-sans text-white/70 text-sm">matures in {maturityCountdown || 'soon'}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-green-400 text-2xl"><span className="dollar">$</span>{(status.claimableUsd ?? 0).toFixed(2)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">Claimable</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl"><span className="dollar">$</span>{(status.totalEarnedUsd ?? 0).toFixed(2)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">All time</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="pixel-sans text-white/60 text-[11px] uppercase tracking-wider mb-1.5 block">Withdraw to Solana address</label>
                    <input
                      type="text"
                      value={claimAddress}
                      onChange={(e) => setClaimAddress(e.target.value)}
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
                      value={claimAmount}
                      onChange={(e) => setClaimAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent outline-none pixel-serif text-white text-lg placeholder-white/40"
                    />
                    <button
                      onClick={() => setClaimAmount((status.claimableUsd ?? 0).toFixed(2))}
                      className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                    >
                      Max
                    </button>
                  </div>
                  <button
                    onClick={submitClaim}
                    disabled={
                      claimLoading ||
                      !claimAddress.trim() ||
                      !(parseFloat(claimAmount) >= 1.0) ||
                      parseFloat(claimAmount) > (status.claimableUsd ?? 0)
                    }
                    className="w-full pixel-serif px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {claimLoading ? 'Sending…' : <>Claim <span className="dollar">$</span>USDC</>}
                  </button>
                  <p className="pixel-sans text-white/55 text-[11px]">Minimum <span className="dollar">$</span>1.00. Sent as USDC on Solana, no signature needed.</p>
                  {claimError && <p className="pixel-sans text-red-400 text-xs">{claimError}</p>}
                  {claimSuccess && <p className="pixel-sans text-green-400/80 text-xs">{claimSuccess}</p>}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
