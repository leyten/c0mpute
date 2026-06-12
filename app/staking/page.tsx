'use client';

// $ZERO staking — self-custody. One page for everyone: brand-new users get the clean
// on-chain stake/unstake/claim flow; anyone still holding a legacy custodial position
// sees a "migrate to self-custody" banner until they've moved over. Funds live in
// on-chain vaults only the user controls — no server key can move them.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useLinkAccount, useConnectWallet } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import {
  buildStakeTx, buildUnstakeTx, buildClaimTx,
  mintsConfigured, SOLANA_CHAIN, RPC_URL, type StakeChunks,
  readStakeChunks, readClaimable, readWalletZero, stakeVault, ZERO_MINT,
} from '@/lib/onchain-staking';

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });
const intnum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
function countdown(ts: number | null, now: number): string {
  if (!ts) return '';
  const r = ts - now;
  if (r <= 0) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(r / 3_600_000);
  const m = Math.floor((r % 3_600_000) / 60_000);
  const s = Math.floor((r % 60_000) / 1000);
  return `${p(h)}:${p(m)}:${p(s)}`;
}
function legacyLine(zero: number, usd: number): string {
  const parts: string[] = [];
  if (zero > 0) parts.push(`${intnum(zero)} ZERO staked`);
  if (usd > 0) parts.push(`$${usd.toFixed(2)} in rewards`);
  return parts.join(' and ');
}

export default function StakingPage() {
  const router = useRouter();
  const { ready, authenticated, login, user, getAccessToken } = usePrivy();
  const { linkWallet } = useLinkAccount();
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const wallet = wallets?.[0];
  const owner = wallet ? new PublicKey(wallet.address) : null;

  const linkedWallet = (user?.linkedAccounts ?? []).find(
    (a): a is typeof a & { address: string } =>
      a.type === 'wallet' && (a as { chainType?: string }).chainType === 'solana');

  const [chunks, setChunks] = useState<StakeChunks>({ staked: 0, mature: 0, cooling: 0, nextMatureAt: null });
  const [claimable, setClaimable] = useState(0);
  const [autoTried, setAutoTried] = useState(false);
  const [custodial, setCustodial] = useState(0);
  const [custodialRewards, setCustodialRewards] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);
  const [boost, setBoost] = useState<{ active: boolean; threshold: number; mature: number }>({ active: false, threshold: 0, mature: 0 });
  const [allowance, setAllowance] = useState<{ enabled: boolean; dailyAllowance: number; usedToday: number; remaining: number } | null>(null);
  const [stakeAmt, setStakeAmt] = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [autoCompound, setAutoCompound] = useState<boolean | null>(null);
  const [acHistory, setAcHistory] = useState<{ usd: number; zeroUi: number; createdAt: string }[]>([]);
  const [acBusy, setAcBusy] = useState(false);
  const [walletZero, setWalletZero] = useState<number | null>(null);
  const [vaultAddr, setVaultAddr] = useState<string | null>(null);
  const [copiedVault, setCopiedVault] = useState(false);
  const [syncedAddr, setSyncedAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Works with just the Privy session (no wallet needed), so legacy holders see their
  // custodial position + the migrate prompt before they've connected a wallet.
  const refresh = useCallback(async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      // Server view: preserves migrated stake's original 24h clock, plus boost +
      // allowance. Keyed on the wallet saved to the profile (set at login).
      let serverStaked = 0;
      const r = await fetch('/api/staking/onchain-status', { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) {
        const d = await r.json();
        serverStaked = d.staked ?? 0;
        if (serverStaked > 0) {
          setChunks({ staked: d.staked ?? 0, mature: d.mature ?? 0, cooling: d.cooling ?? 0, nextMatureAt: d.nextMatureAt ?? null });
          setClaimable(d.claimable ?? 0);
        }
        setBoost({ active: !!d.workerBoostActive, threshold: d.workerThreshold ?? 0, mature: d.matureForBoost ?? 0 });
        setAllowance(d.allowance ?? null);
      }
      // Live on-chain view from the CONNECTED wallet — the reliable source for the
      // staked amount + wallet balance + vault, and the ONLY one that works when the
      // wallet isn't synced to the profile yet (X-login + connect-on-this-page).
      const w = wallets?.[0];
      if (w && ZERO_MINT) {
        const ownerPk = new PublicKey(w.address);
        setVaultAddr(stakeVault(ownerPk, new PublicKey(ZERO_MINT)).toBase58());
        try {
          const [ch, wz, cl] = await Promise.all([readStakeChunks(ownerPk), readWalletZero(ownerPk), readClaimable(ownerPk)]);
          setWalletZero(wz);
          // Trust the live read for the position when the server doesn't have it
          // (un-synced wallet). When it does, keep the server's maturity dates.
          if (serverStaked <= 0) { setChunks(ch); setClaimable(cl); }
        } catch {}
      }
      const rc = await fetch('/api/staking/status', { headers: { Authorization: `Bearer ${t}` } });
      if (rc.ok) { const dc = await rc.json(); setCustodial(dc.stakedAmount ?? 0); setCustodialRewards(dc.claimableUsd ?? 0); }
      const ra = await fetch('/api/staking/autocompound', { headers: { Authorization: `Bearer ${t}` } });
      if (ra.ok) { const da = await ra.json(); setAutoCompound(!!da.enabled); setAcHistory(da.history ?? []); }
    } catch {}
  }, [getAccessToken, wallets]);

  const toggleAutoCompound = async () => {
    if (autoCompound === null || acBusy) return;
    setAcBusy(true);
    try {
      const t = await getAccessToken();
      const r = await fetch('/api/staking/autocompound', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoCompound }),
      });
      if (r.ok) { const d = await r.json(); setAutoCompound(!!d.enabled); }
    } catch {}
    finally { setAcBusy(false); }
  };

  const handleMigrate = async () => {
    setMigrating(true); setMigrateMsg(null);
    try {
      const t = await getAccessToken();
      const r = await fetch('/api/staking/migrate', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (r.ok) {
        const parts = [];
        if (d.migrated > 0) parts.push(`${intnum(d.migrated)} ZERO`);
        if (d.migratedRewards > 0) parts.push(`$${d.migratedRewards.toFixed(2)} USDC rewards`);
        setMigrateMsg(parts.length ? `Migrated ${parts.join(' + ')} to self-custody` : 'Nothing left to migrate');
        setCustodial(0); setCustodialRewards(0); setTimeout(refresh, 2500);
      } else setMigrateMsg(d.error || 'Migration failed');
    } catch (e) { setMigrateMsg(e instanceof Error ? e.message : 'Migration failed'); }
    finally { setMigrating(false); }
  };

  useEffect(() => { refresh(); }, [refresh]);

  // Live countdown for cooling-down stake: tick every second while a lot is still
  // maturing; once it matures, stop and pull the fresh mature/cooling split.
  useEffect(() => {
    if (!(chunks.cooling > 0 && chunks.nextMatureAt)) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (chunks.nextMatureAt && Date.now() >= chunks.nextMatureAt) {
        clearInterval(id);
        refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [chunks.cooling, chunks.nextMatureAt, refresh]);

  useEffect(() => {
    if (ready && authenticated && !wallet && linkedWallet && !autoTried) {
      setAutoTried(true);
      try { connectWallet({ walletChainType: 'solana-only' }); } catch {}
    }
  }, [ready, authenticated, wallet, linkedWallet, autoTried, connectWallet]);

  // Sync the connected wallet to the profile (once per address) so the server-side
  // checks — worker boost + daily free-credit allowance — recognise a stake made
  // from a wallet linked here rather than at login. The endpoint only accepts a
  // wallet the user provably controls (verified against Privy), then we re-pull.
  useEffect(() => {
    const w = wallets?.[0];
    if (!authenticated || !w || syncedAddr === w.address) return;
    (async () => {
      try {
        const t = await getAccessToken();
        if (!t) return;
        const r = await fetch('/api/profile/link-wallet', {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: w.address }),
        });
        if (r.ok) { setSyncedAddr(w.address); refresh(); }
      } catch {}
    })();
  }, [authenticated, wallets, syncedAddr, getAccessToken, refresh]);

  const run = async (label: string, build: (o: PublicKey) => Promise<Uint8Array>) => {
    if (!owner || !wallet) return;
    setBusy(label); setMsg(null); setErr(null);
    try {
      const tx = await build(owner);
      const { signature } = await signAndSendTransaction({ transaction: tx, wallet, chain: SOLANA_CHAIN as `solana:${string}` });
      const sig = Buffer.from(signature).toString('base64');
      setMsg(`${label} sent (${sig.slice(0, 12)}…)`);
      // Re-read a few times — the first read can land before the tx confirms, so
      // stagger retries to make the new balance reliably show up.
      [2500, 6000, 12000].forEach((ms) => setTimeout(refresh, ms));
    } catch (e) {
      setErr(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); }
  };

  const hasLegacy = custodial > 0 || custodialRewards > 0;
  const card = 'border border-white/10 bg-white/[0.02] p-6 rounded-2xl';
  const input = 'flex-1 bg-transparent outline-none pixel-serif text-white text-lg placeholder-white/40';
  const btn = 'w-full pixel-serif px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm';

  return (
    <div className="min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <span className="pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE</span>
            <button onClick={() => router.push('/')} className="pixel-sans text-sm text-white/70 hover:text-white">← Back</button>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="pixel-serif text-white text-3xl md:text-4xl mb-2">Stake <span className="dollar">$</span>ZERO <span className="text-white/40 text-lg">· self-custody</span></h1>
          <p className="pixel-sans text-white/70 text-sm mb-8">Your <span className="dollar">$</span>ZERO stays in your own on-chain vault. Only you can unstake or claim. No server holds your funds.</p>

          {!ready ? (
            <p className="pixel-sans text-white/60 text-sm">Loading…</p>
          ) : !authenticated ? (
            <button onClick={login} className={btn}>Log in</button>
          ) : !wallet ? (
            <div className={card}>
              {hasLegacy && (
                <p className="pixel-sans text-[#80a0c1] text-sm mb-3">
                  You have {legacyLine(custodial, custodialRewards)} in the old staking. Connect your wallet to migrate it to self-custody.
                </p>
              )}
              {linkedWallet ? (
                <p className="pixel-sans text-white/70 text-sm mb-4">
                  Connecting your linked wallet <span className="font-mono text-[#80a0c1]">{linkedWallet.address.slice(0, 4)}…{linkedWallet.address.slice(-4)}</span>. Approve it in your wallet if prompted — after the first time it reconnects automatically.
                </p>
              ) : (
                <p className="pixel-sans text-white/70 text-sm mb-4">Connect a Solana wallet (Phantom, Solflare, Backpack) to stake from self-custody.</p>
              )}
              <button onClick={() => (linkedWallet ? connectWallet({ walletChainType: 'solana-only' }) : linkWallet())} className={btn}>
                {linkedWallet ? 'Connect' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="pixel-sans text-white/50 text-xs">wallet: <span className="font-mono text-[#80a0c1]">{wallet.address.slice(0, 6)}…{wallet.address.slice(-6)}</span></div>

              {hasLegacy && (
                <section className="border border-[#80a0c1]/40 bg-[#80a0c1]/[0.08] p-6 rounded-2xl">
                  <h2 className="pixel-serif text-white text-xl mb-2">Migrate to self-custody</h2>
                  <p className="pixel-sans text-white/70 text-sm mb-4">
                    You have <span className="text-white">{legacyLine(custodial, custodialRewards)}</span> in the old custodial system. Move it into your own on-chain vault — one click, no unstake/restake, and your 24h earning status carries over.
                  </p>
                  <button disabled={migrating} onClick={handleMigrate} className={btn}>
                    {migrating ? 'Migrating…' : 'Migrate to self-custody'}
                  </button>
                  {migrateMsg && <p className="pixel-sans text-green-400/80 text-xs mt-2">{migrateMsg}</p>}
                </section>
              )}

              <section className={card}>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl">{intnum(chunks.staked)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">ZERO staked</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-green-400 text-2xl">{intnum(chunks.mature)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">earning</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl">{intnum(chunks.cooling)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">
                      {chunks.cooling > 0 && countdown(chunks.nextMatureAt, now)
                        ? <>matures in <span className="text-white/90 tabular-nums">{countdown(chunks.nextMatureAt, now)}</span></>
                        : 'cooling down'}
                    </div>
                  </div>
                </div>
                <div className="text-center p-4 bg-[#80a0c1]/[0.06] border border-[#80a0c1]/20 rounded-xl">
                  <div className="pixel-serif text-green-400 text-2xl"><span className="dollar">$</span>{num(claimable)}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1">claimable USDC</div>
                </div>
                <p className="pixel-sans text-white/45 text-[11px] mt-3">Stake earns rewards after 24h (anti-snipe). Unstaking pulls your newest deposits first, so aged stake keeps earning.</p>
                {vaultAddr && (
                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-white/5">
                    <span className="pixel-sans text-white/40 text-[11px]">Your on-chain vault</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(vaultAddr); setCopiedVault(true); setTimeout(() => setCopiedVault(false), 1500); }}
                      title={vaultAddr}
                      className="pixel-sans text-[#80a0c1] hover:text-white text-[11px] tabular-nums transition-colors"
                    >
                      {copiedVault ? 'copied ✓' : `${vaultAddr.slice(0, 4)}…${vaultAddr.slice(-4)}`}
                    </button>
                  </div>
                )}
              </section>

              {boost.threshold > 0 && (
                <section className={boost.active ? 'border border-green-500/30 bg-green-500/[0.05] p-5 rounded-2xl' : card}>
                  {boost.active ? (
                    <p className="pixel-sans text-green-400/90 text-sm">Worker boost active — you earn <span className="text-white">80%</span> on jobs you complete (vs 70%).</p>
                  ) : (
                    <p className="pixel-sans text-white/70 text-sm">
                      Staking {intnum(boost.threshold)} ZERO for 24h boosts your worker payout to 80% (from 70%).
                      {boost.mature > 0 && boost.mature < boost.threshold ? <> <span className="text-white">{intnum(boost.threshold - boost.mature)} more</span> to go.</> : ''}
                    </p>
                  )}
                </section>
              )}

              {allowance?.enabled && allowance.dailyAllowance > 0 && (
                <section className={card}>
                  <h2 className="pixel-serif text-white text-xl mb-1">Daily free credits</h2>
                  <p className="pixel-sans text-white/55 text-[11px] mb-4">Your matured stake earns free credits every day, drawn before your paid credits. Refreshes 00:00 UTC — use it or lose it.</p>
                  <div className="flex items-end justify-between mb-2">
                    <div className="pixel-serif text-green-400 text-3xl tabular-nums">{intnum(allowance.remaining)}</div>
                    <div className="pixel-sans text-white/50 text-xs">of {intnum(allowance.dailyAllowance)} credits/day</div>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-green-400/70" style={{ width: `${Math.min(100, Math.max(0, 100 * allowance.remaining / allowance.dailyAllowance))}%` }} />
                  </div>
                  <p className="pixel-sans text-white/45 text-[11px]">free credits left today · stake more for a bigger daily share</p>
                </section>
              )}

              <section className={card}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="pixel-serif text-white text-xl">Stake</h2>
                  {walletZero !== null && (
                    <span className="pixel-sans text-white/50 text-xs">Balance: <span className="text-white/80 tabular-nums">{intnum(walletZero)}</span> ZERO</span>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3 mb-3">
                  <input type="number" inputMode="decimal" min="0" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value)} placeholder="0" className={input} />
                  <span className="pixel-sans text-white/60 text-xs">ZERO</span>
                  <button disabled={walletZero === null || walletZero <= 0} onClick={() => walletZero !== null && setStakeAmt(String(walletZero))} className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">Max</button>
                </div>
                <button disabled={!!busy || !mintsConfigured() || !(parseFloat(stakeAmt) > 0) || (walletZero !== null && parseFloat(stakeAmt) > walletZero)} onClick={() => run('Stake', (o) => buildStakeTx(o, parseFloat(stakeAmt)))} className={btn}>
                  {busy === 'Stake' ? 'Confirm in wallet…' : (walletZero !== null && parseFloat(stakeAmt) > walletZero ? 'Not enough ZERO' : 'Stake')}
                </button>
              </section>

              <section className={card}>
                <h2 className="pixel-serif text-white text-xl mb-4">Unstake</h2>
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3 mb-3">
                  <input type="number" inputMode="decimal" min="0" value={unstakeAmt} onChange={(e) => setUnstakeAmt(e.target.value)} placeholder="0" className={input} />
                  <span className="pixel-sans text-white/60 text-xs">ZERO</span>
                  <button onClick={() => setUnstakeAmt(String(chunks.staked))} className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5">Max</button>
                </div>
                <button disabled={!!busy || !mintsConfigured() || !(parseFloat(unstakeAmt) > 0) || parseFloat(unstakeAmt) > chunks.staked} onClick={() => run('Unstake', (o) => buildUnstakeTx(o, parseFloat(unstakeAmt)))} className={btn}>
                  {busy === 'Unstake' ? 'Confirm in wallet…' : 'Unstake'}
                </button>
              </section>

              <section className={card}>
                <h2 className="pixel-serif text-white text-xl mb-4">Claim rewards</h2>
                <p className="pixel-sans text-white/55 text-[11px] mb-3">Claims your full claimable USDC to your wallet.</p>
                <button disabled={!!busy || !mintsConfigured() || !(claimable > 0)} onClick={() => run('Claim', (o) => buildClaimTx(o, claimable))} className={btn}>
                  {busy === 'Claim' ? 'Confirm in wallet…' : <>Claim <span className="dollar">$</span>{num(claimable)} USDC</>}
                </button>
              </section>

              <section className={card}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="pixel-serif text-white text-xl">Auto-compound</h2>
                  <button
                    onClick={toggleAutoCompound}
                    disabled={autoCompound === null || acBusy}
                    aria-label="Toggle auto-compound"
                    className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-40 ${autoCompound ? 'bg-green-500/70' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${autoCompound ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
                <p className="pixel-sans text-white/55 text-[11px]">
                  When on, your daily USDC rewards are used to buy <span className="dollar">$</span>ZERO and staked straight into your vault — only you can ever withdraw it. Compounded stake starts earning after the normal 24h.
                </p>
                {autoCompound && acHistory.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                    {acHistory.slice(0, 5).map((h, i) => (
                      <div key={i} className="flex items-center justify-between pixel-sans text-[11px]">
                        <span className="text-white/45">{new Date(h.createdAt).toLocaleDateString()}</span>
                        <span className="text-white/70"><span className="dollar">$</span>{h.usd.toFixed(2)} → <span className="text-green-400/80">{intnum(h.zeroUi)} ZERO</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {msg && <p className="pixel-sans text-green-400/80 text-xs">{msg}</p>}
              {err && <p className="pixel-sans text-red-400 text-xs break-all">{err}</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
