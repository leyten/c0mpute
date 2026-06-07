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
} from '@/lib/onchain-staking';

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });
const intnum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
function countdown(ts: number | null): string {
  if (!ts) return '';
  const r = ts - Date.now();
  if (r <= 0) return '';
  return `${Math.floor(r / 3_600_000)}h ${Math.floor((r % 3_600_000) / 60_000)}m`;
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
  const [stakeAmt, setStakeAmt] = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Works with just the Privy session (no wallet needed), so legacy holders see their
  // custodial position + the migrate prompt before they've connected a wallet.
  const refresh = useCallback(async () => {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const r = await fetch('/api/staking/onchain-status', { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) {
        const d = await r.json();
        setChunks({ staked: d.staked ?? 0, mature: d.mature ?? 0, cooling: d.cooling ?? 0, nextMatureAt: d.nextMatureAt ?? null });
        setClaimable(d.claimable ?? 0);
        setBoost({ active: !!d.workerBoostActive, threshold: d.workerThreshold ?? 0, mature: d.matureForBoost ?? 0 });
      }
      const rc = await fetch('/api/staking/status', { headers: { Authorization: `Bearer ${t}` } });
      if (rc.ok) { const dc = await rc.json(); setCustodial(dc.stakedAmount ?? 0); setCustodialRewards(dc.claimableUsd ?? 0); }
    } catch {}
  }, [getAccessToken]);

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

  useEffect(() => {
    if (ready && authenticated && !wallet && linkedWallet && !autoTried) {
      setAutoTried(true);
      try { connectWallet({ walletChainType: 'solana-only' }); } catch {}
    }
  }, [ready, authenticated, wallet, linkedWallet, autoTried, connectWallet]);

  const run = async (label: string, build: (o: PublicKey) => Promise<Uint8Array>) => {
    if (!owner || !wallet) return;
    setBusy(label); setMsg(null); setErr(null);
    try {
      const tx = await build(owner);
      const { signature } = await signAndSendTransaction({ transaction: tx, wallet, chain: SOLANA_CHAIN as `solana:${string}` });
      const sig = Buffer.from(signature).toString('base64');
      setMsg(`${label} sent (${sig.slice(0, 12)}…)`);
      setTimeout(refresh, 2500);
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
                      {chunks.cooling > 0 && countdown(chunks.nextMatureAt) ? `matures in ${countdown(chunks.nextMatureAt)}` : 'cooling down'}
                    </div>
                  </div>
                </div>
                <div className="text-center p-4 bg-[#80a0c1]/[0.06] border border-[#80a0c1]/20 rounded-xl">
                  <div className="pixel-serif text-green-400 text-2xl"><span className="dollar">$</span>{num(claimable)}</div>
                  <div className="pixel-sans text-white/70 text-xs mt-1">claimable USDC</div>
                </div>
                <p className="pixel-sans text-white/45 text-[11px] mt-3">Stake earns rewards after 24h (anti-snipe). Unstaking pulls your newest deposits first, so aged stake keeps earning.</p>
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

              <section className={card}>
                <h2 className="pixel-serif text-white text-xl mb-4">Stake</h2>
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3 mb-3">
                  <input type="number" inputMode="decimal" min="0" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value)} placeholder="0" className={input} />
                  <span className="pixel-sans text-white/60 text-xs">ZERO</span>
                </div>
                <button disabled={!!busy || !mintsConfigured() || !(parseFloat(stakeAmt) > 0)} onClick={() => run('Stake', (o) => buildStakeTx(o, parseFloat(stakeAmt)))} className={btn}>
                  {busy === 'Stake' ? 'Confirm in wallet…' : 'Stake'}
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

              {msg && <p className="pixel-sans text-green-400/80 text-xs">{msg}</p>}
              {err && <p className="pixel-sans text-red-400 text-xs break-all">{err}</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
