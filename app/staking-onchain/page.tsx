'use client';

// On-chain (self-custody) staking UI — test page. Calls the deployed staking + rewards
// programs directly from the user's linked Solana wallet via Privy. Kept on a separate
// route so it can't disturb the live custodial /staking page until migration is ready.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useLinkAccount } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import {
  buildStakeTx, buildUnstakeTx, buildClaimTx, readStaked, readClaimable,
  mintsConfigured, SOLANA_CHAIN, RPC_URL,
} from '@/lib/onchain-staking';

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });

export default function OnchainStakingPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const { linkWallet } = useLinkAccount();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const wallet = wallets?.[0];
  const owner = wallet ? new PublicKey(wallet.address) : null;

  const [staked, setStaked] = useState(0);
  const [claimable, setClaimable] = useState(0);
  const [stakeAmt, setStakeAmt] = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner) return;
    try {
      const [s, c] = await Promise.all([readStaked(owner), readClaimable(owner)]);
      setStaked(s); setClaimable(c);
    } catch {}
  }, [owner?.toBase58()]);

  useEffect(() => { refresh(); }, [refresh]);

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

  const card = 'border border-white/10 bg-white/[0.02] p-6 rounded-2xl';
  const input = 'flex-1 bg-transparent outline-none pixel-serif text-white text-lg placeholder-white/40';
  const btn = 'w-full pixel-serif px-6 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm';

  return (
    <div className="min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <span className="pixel-serif-logo text-white text-lg md:text-xl font-bold">C0MPUTE</span>
            <button onClick={() => router.push('/')} className="pixel-sans text-sm text-white/70 hover:text-white">← Back</button>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="pixel-serif text-white text-3xl md:text-4xl mb-2">Stake <span className="dollar">$</span>ZERO <span className="text-white/40 text-lg">· self-custody</span></h1>
          <p className="pixel-sans text-white/70 text-sm mb-8">Your <span className="dollar">$</span>ZERO stays in your own on-chain vault. Only you can unstake or claim. No server holds your funds.</p>

          {!mintsConfigured() && (
            <div className="border border-yellow-500/30 bg-yellow-500/[0.05] rounded-2xl p-4 mb-6">
              <p className="pixel-sans text-yellow-400/90 text-xs">Token mints not configured for this environment yet (NEXT_PUBLIC_STAKE_MINT / NEXT_PUBLIC_ONCHAIN_USDC_MINT). Set them to enable staking. RPC: {RPC_URL}</p>
            </div>
          )}

          {!ready ? (
            <p className="pixel-sans text-white/60 text-sm">Loading…</p>
          ) : !authenticated ? (
            <button onClick={login} className={btn}>Log in</button>
          ) : !wallet ? (
            <div className={card}>
              <p className="pixel-sans text-white/70 text-sm mb-4">Connect a Solana wallet (Phantom, Solflare, Backpack) to stake from self-custody.</p>
              <button onClick={() => linkWallet()} className={btn}>Connect Wallet</button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="pixel-sans text-white/50 text-xs">wallet: <span className="font-mono text-[#80a0c1]">{wallet.address.slice(0, 6)}…{wallet.address.slice(-6)}</span></div>

              <section className={card}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-white text-2xl">{num(staked)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">ZERO staked</div>
                  </div>
                  <div className="text-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="pixel-serif text-green-400 text-2xl"><span className="dollar">$</span>{num(claimable)}</div>
                    <div className="pixel-sans text-white/70 text-xs mt-1">claimable USDC</div>
                  </div>
                </div>
              </section>

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
                  <button onClick={() => setUnstakeAmt(String(staked))} className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/5">Max</button>
                </div>
                <button disabled={!!busy || !mintsConfigured() || !(parseFloat(unstakeAmt) > 0) || parseFloat(unstakeAmt) > staked} onClick={() => run('Unstake', (o) => buildUnstakeTx(o, parseFloat(unstakeAmt)))} className={btn}>
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
