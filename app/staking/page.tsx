'use client';

// $ZERO staking, self-custody. One page for everyone: brand-new users get the
// on-chain stake/unstake/claim flow; anyone still holding a legacy custodial
// position sees a migrate banner until they have moved over. Funds live in
// on-chain vaults only the user controls; no server key can move them.
//
// Presentation: editorial money surface (Newsreader figures, Inter labels).
// All state, handlers and API calls are unchanged from the production page.
import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useLinkAccount, useConnectWallet } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import {
  buildStakeTx, buildUnstakeTx, buildClaimTx,
  mintsConfigured, SOLANA_CHAIN, type StakeChunks,
  readStakeChunks, readClaimable, readWalletZero, stakeVault, ZERO_MINT,
  preflight, readSol,
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

// Shared presentation tokens for this page.
const card = 'border border-white/10 bg-white/[0.02] rounded-2xl';
const secLabel = 'pixel-sans text-white/40 text-[10px] tracking-widest uppercase';
const btn = 'pixel-sans text-sm font-medium px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnFull = `w-full ${btn}`;
const btnGhost = 'pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const amountBox = 'flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 mb-3 focus-within:border-white/25 transition-colors';
const amountInput = 'flex-1 min-w-0 bg-transparent outline-none pixel-serif text-white text-2xl placeholder-white/25 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

// The mechanics of the protocol, shown to visitors who have not connected yet.
// Every claim here restates copy that already ships on this page or /treasury.
function HowItWorks() {
  const steps = [
    { n: '01', title: 'Stake', body: <>Move <span className="dollar">$</span>ZERO from your wallet into your own on-chain vault. Only your wallet can sign it back out.</> },
    { n: '02', title: 'Mature', body: <>New stake starts earning after 24 hours. Unstakes draw your newest deposits first, so aged stake keeps earning.</> },
    { n: '03', title: 'Earn USDC', body: <>Stakers receive half of every treasury distribution, paid in <span className="dollar">$</span>USDC.</> },
    { n: '04', title: 'Claim or compound', body: <>Claim <span className="dollar">$</span>USDC to your wallet anytime, or auto-compound it into more staked <span className="dollar">$</span>ZERO.</> },
  ];
  return (
    <section className="mt-10">
      <div className={`${secLabel} mb-4`}>How it works</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((s) => (
          <div key={s.n} className={`${card} p-5`}>
            <div className="pixel-serif text-white/50 text-2xl mb-2">{s.n}</div>
            <h3 className="pixel-serif text-white text-lg mb-1.5">{s.title}</h3>
            <p className="pixel-sans text-white/60 text-[13px] leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="pixel-sans text-white/40 text-xs mt-4">
        The staker half is funded by the treasury. <a href="/treasury" className="text-[#80a0c1]/70 hover:text-[#80a0c1] transition-colors">See where the value comes from →</a>
      </p>
    </section>
  );
}

export default function StakingPage() {
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
  const [walletSol, setWalletSol] = useState<number | null>(null);
  const [vaultAddr, setVaultAddr] = useState<string | null>(null);
  const [copiedVault, setCopiedVault] = useState(false);
  const [syncedAddr, setSyncedAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [netStats, setNetStats] = useState<{ stakers: number; autocompound: number } | null>(null);

  // Public network-wide counts — no auth, shown to everyone above the fold.
  useEffect(() => {
    fetch('/api/staking/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.stakers === 'number') setNetStats(d); })
      .catch(() => {});
  }, []);

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
          const [ch, wz, cl, sol] = await Promise.all([readStakeChunks(ownerPk), readWalletZero(ownerPk), readClaimable(ownerPk), readSol(ownerPk)]);
          setWalletZero(wz);
          setWalletSol(sol);
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
      // Simulate first — if the tx can't land (no SOL for the fee, wrong/empty wallet,
      // amount too high), tell the user plainly instead of handing Phantom a tx it
      // flags as "may fail / malicious". Fails open on RPC hiccups (returns null).
      const reason = await preflight(owner, tx, label as 'Stake' | 'Unstake' | 'Claim');
      if (reason) { setErr(reason); setBusy(null); return; }
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
  const coolingLabel = chunks.cooling > 0 && countdown(chunks.nextMatureAt, now)
    ? <>matures in <span className="text-white/90 tabular-nums">{countdown(chunks.nextMatureAt, now)}</span></>
    : 'cooling down';

  return (
    <div className="min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
              c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
            </a>
            <div className="flex items-center gap-5">
              <a href="/treasury" className="pixel-sans text-sm text-white/50 hover:text-white transition-colors hidden sm:inline">treasury</a>
              <a href="/" className="pixel-sans text-sm text-white/70 hover:text-white transition-colors">← Back</a>
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          {/* Page lede */}
          <div className="mb-10">
            <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">STAKING</div>
            <h1 className="pixel-serif text-white text-4xl md:text-5xl mb-3">Stake <span className="dollar">$</span>ZERO</h1>
            <p className="pixel-sans text-white/70 text-sm max-w-xl">
              Self-custody staking. Your <span className="dollar">$</span>ZERO sits in an on-chain vault only you control,
              and rewards are paid in <span className="dollar">$</span>USDC from the treasury&apos;s staker half.
            </p>
            <p className="pixel-sans text-white/40 text-xs mt-2 min-h-4">
              {netStats ? <>{intnum(netStats.stakers)} stakers · {intnum(netStats.autocompound)} with auto-compound on</> : ' '}
            </p>
          </div>

          {!ready ? (
            <div className={`${card} p-8`}>
              <div className="animate-pulse space-y-3" aria-hidden>
                <div className="h-4 w-40 bg-white/10 rounded" />
                <div className="h-3 w-64 bg-white/5 rounded" />
              </div>
              <p className="pixel-sans text-white/40 text-xs mt-5">Loading your session</p>
            </div>
          ) : !authenticated ? (
            <>
              <div className={`${card} p-8 text-center`}>
                <h2 className="pixel-serif text-white text-2xl mb-2">Log in to continue</h2>
                <p className="pixel-sans text-white/60 text-sm mb-6 max-w-sm mx-auto">
                  Sign in to view your vault, stake <span className="dollar">$</span>ZERO, and claim <span className="dollar">$</span>USDC rewards.
                </p>
                <button onClick={login} className={`${btn} px-10`}>Log in</button>
              </div>
              <HowItWorks />
            </>
          ) : !wallet ? (
            <>
              <div className={`${card} p-8`}>
                <h2 className="pixel-serif text-white text-2xl mb-2">Connect a wallet</h2>
                {hasLegacy && (
                  <p className="pixel-sans text-[#80a0c1] text-sm mb-3">
                    You have {legacyLine(custodial, custodialRewards)} in the old staking. Connect your wallet to migrate it to self-custody.
                  </p>
                )}
                {linkedWallet ? (
                  <p className="pixel-sans text-white/60 text-sm mb-6">
                    Connecting your linked wallet <span className="font-mono text-[#80a0c1]">{linkedWallet.address.slice(0, 4)}…{linkedWallet.address.slice(-4)}</span>.
                    Approve it in your wallet if prompted. After the first time it reconnects automatically.
                  </p>
                ) : (
                  <p className="pixel-sans text-white/60 text-sm mb-6">Connect a Solana wallet (Phantom, Solflare, Backpack) to stake from self-custody.</p>
                )}
                <button onClick={() => (linkedWallet ? connectWallet({ walletChainType: 'solana-only' }) : linkWallet())} className={btnFull}>
                  {linkedWallet ? 'Connect' : 'Connect Wallet'}
                </button>
              </div>
              <HowItWorks />
            </>
          ) : (
            <div className="space-y-5">
              {walletSol !== null && walletSol < 0.01 && (
                <div className="border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 rounded-xl">
                  <p className="pixel-sans text-amber-300/90 text-xs">
                    This wallet has {num(walletSol)} SOL. Staking and unstaking need a small amount of SOL for the network fee,
                    plus about 0.002 SOL one time to open your vault. Add about 0.01 SOL or your wallet will warn the transaction may fail.
                  </p>
                </div>
              )}

              {hasLegacy && (
                <section className="border border-[#80a0c1]/40 bg-[#80a0c1]/[0.08] p-6 rounded-2xl">
                  <h2 className="pixel-serif text-white text-xl mb-2">Migrate to self-custody</h2>
                  <p className="pixel-sans text-white/70 text-sm mb-4">
                    You have <span className="text-white">{legacyLine(custodial, custodialRewards)}</span> in the old custodial system.
                    One click moves it into your own on-chain vault, and your 24h earning status carries over.
                  </p>
                  <button disabled={migrating} onClick={handleMigrate} className={btnFull}>
                    {migrating ? 'Migrating…' : 'Migrate to self-custody'}
                  </button>
                  {migrateMsg && <p className="pixel-sans text-green-400/80 text-xs mt-2">{migrateMsg}</p>}
                </section>
              )}

              {/* Position overview: the three stake states, then the reward strip. */}
              <section className={`${card} p-6`}>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h2 className={secLabel}>Your position</h2>
                  <span className="pixel-sans text-white/40 text-xs">
                    wallet <span className="font-mono text-[#80a0c1]">{wallet.address.slice(0, 6)}…{wallet.address.slice(-6)}</span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl md:text-3xl">{intnum(chunks.staked)}</div>
                    <div className="pixel-sans text-white/60 text-xs mt-1.5">ZERO staked</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl md:text-3xl">{intnum(chunks.mature)}</div>
                    <div className="pixel-sans text-white/60 text-xs mt-1.5 flex items-center justify-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden />earning
                    </div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white/70 text-2xl md:text-3xl">{intnum(chunks.cooling)}</div>
                    <div className="pixel-sans text-white/60 text-xs mt-1.5">{coolingLabel}</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[#80a0c1]/[0.06] border border-[#80a0c1]/20 rounded-xl">
                  <div>
                    <div className="pixel-serif text-green-400 text-3xl"><span className="dollar">$</span>{num(claimable)}</div>
                    <div className="pixel-sans text-white/60 text-xs mt-1">claimable <span className="dollar">$</span>USDC rewards · claimed in full to your wallet</div>
                  </div>
                  <button
                    disabled={!!busy || !mintsConfigured() || !(claimable > 0)}
                    onClick={() => run('Claim', (o) => buildClaimTx(o, claimable))}
                    className={`${btn} whitespace-nowrap`}
                  >
                    {busy === 'Claim' ? 'Confirm in wallet…' : <>Claim <span className="dollar">$</span>{num(claimable)} USDC</>}
                  </button>
                </div>

                <p className="pixel-sans text-white/45 text-[11px] mt-3">
                  New stake starts earning after 24 hours. Unstaking draws your newest deposits first, so aged stake keeps earning.
                </p>
                {vaultAddr && (
                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-white/5">
                    <span className="pixel-sans text-white/40 text-[11px]">Your on-chain vault</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(vaultAddr); setCopiedVault(true); setTimeout(() => setCopiedVault(false), 1500); }}
                      title={vaultAddr}
                      className="pixel-sans text-[#80a0c1] hover:text-white text-[11px] tabular-nums transition-colors"
                    >
                      {copiedVault ? 'copied' : `${vaultAddr.slice(0, 4)}…${vaultAddr.slice(-4)}`}
                    </button>
                  </div>
                )}
              </section>

              {boost.threshold > 0 && (
                <section className={boost.active ? 'border border-green-500/30 bg-green-500/[0.05] p-5 rounded-2xl' : `${card} p-5`}>
                  {boost.active ? (
                    <p className="pixel-sans text-green-400/90 text-sm">Worker boost active. You earn <span className="text-white">80%</span> on jobs you complete, up from 70%.</p>
                  ) : (
                    <>
                      <p className="pixel-sans text-white/70 text-sm">
                        Staking {intnum(boost.threshold)} ZERO for 24 hours boosts your worker payout to 80%, up from 70%.
                        {boost.mature > 0 && boost.mature < boost.threshold ? <> <span className="text-white">{intnum(boost.threshold - boost.mature)} more</span> to go.</> : ''}
                      </p>
                      {boost.mature > 0 && boost.mature < boost.threshold && (
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
                          <div className="h-full bg-[#80a0c1]/70" style={{ width: `${Math.min(100, Math.max(0, 100 * boost.mature / boost.threshold))}%` }} />
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {allowance?.enabled && allowance.dailyAllowance > 0 && (
                <section className={`${card} p-6`}>
                  <h2 className="pixel-serif text-white text-xl mb-1">Daily free credits</h2>
                  <p className="pixel-sans text-white/55 text-[11px] mb-4">
                    Your matured stake earns free credits every day, drawn before your paid credits. Refreshes at 00:00 UTC and does not roll over.
                  </p>
                  <div className="flex items-end justify-between mb-2">
                    <div className="pixel-serif text-green-400 text-3xl tabular-nums">{intnum(allowance.remaining)}</div>
                    <div className="pixel-sans text-white/50 text-xs">of {intnum(allowance.dailyAllowance)} credits/day</div>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-green-400/70" style={{ width: `${Math.min(100, Math.max(0, 100 * allowance.remaining / allowance.dailyAllowance))}%` }} />
                  </div>
                  <p className="pixel-sans text-white/45 text-[11px]">Free credits left today. Stake more for a bigger daily share.</p>
                </section>
              )}

              {/* Actions: stake and unstake side by side. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <section className={`${card} p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="pixel-serif text-white text-xl">Stake</h2>
                    {walletZero !== null && (
                      <span className="pixel-sans text-white/50 text-xs">balance <span className="text-white/80 tabular-nums">{intnum(walletZero)}</span> ZERO</span>
                    )}
                  </div>
                  <div className={amountBox}>
                    <input type="number" inputMode="decimal" min="0" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value)} placeholder="0" className={amountInput} />
                    <span className="pixel-sans text-white/50 text-xs">ZERO</span>
                    <button
                      disabled={walletZero === null || walletZero <= 0}
                      onClick={() => walletZero !== null && setStakeAmt(String(walletZero))}
                      className={btnGhost}
                    >Max</button>
                  </div>
                  <button
                    disabled={!!busy || !mintsConfigured() || !(parseFloat(stakeAmt) > 0) || (walletZero !== null && parseFloat(stakeAmt) > walletZero)}
                    onClick={() => run('Stake', (o) => buildStakeTx(o, parseFloat(stakeAmt)))}
                    className={btnFull}
                  >
                    {busy === 'Stake' ? 'Confirm in wallet…' : (walletZero !== null && parseFloat(stakeAmt) > walletZero ? 'Not enough ZERO' : 'Stake')}
                  </button>
                </section>

                <section className={`${card} p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="pixel-serif text-white text-xl">Unstake</h2>
                    <span className="pixel-sans text-white/50 text-xs">staked <span className="text-white/80 tabular-nums">{intnum(chunks.staked)}</span> ZERO</span>
                  </div>
                  <div className={amountBox}>
                    <input type="number" inputMode="decimal" min="0" value={unstakeAmt} onChange={(e) => setUnstakeAmt(e.target.value)} placeholder="0" className={amountInput} />
                    <span className="pixel-sans text-white/50 text-xs">ZERO</span>
                    <button onClick={() => setUnstakeAmt(String(chunks.staked))} className={btnGhost}>Max</button>
                  </div>
                  <button
                    disabled={!!busy || !mintsConfigured() || !(parseFloat(unstakeAmt) > 0) || parseFloat(unstakeAmt) > chunks.staked}
                    onClick={() => run('Unstake', (o) => buildUnstakeTx(o, parseFloat(unstakeAmt)))}
                    className={btnFull}
                  >
                    {busy === 'Unstake' ? 'Confirm in wallet…' : 'Unstake'}
                  </button>
                </section>
              </div>

              <section className={`${card} p-6`}>
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
                  When on, your daily <span className="dollar">$</span>USDC rewards are used to buy <span className="dollar">$</span>ZERO and staked
                  straight into your vault. Only you can ever withdraw it, and compounded stake starts earning after the normal 24h.
                </p>
                {autoCompound && acHistory.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                    {acHistory.slice(0, 5).map((h, i) => (
                      <div key={i} className="flex items-center justify-between pixel-sans text-[11px]">
                        <span className="text-white/45">{new Date(h.createdAt).toLocaleDateString()}</span>
                        <span className="text-white/70 tabular-nums"><span className="dollar">$</span>{h.usd.toFixed(2)} → <span className="text-green-400/80">{intnum(h.zeroUi)} ZERO</span></span>
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
