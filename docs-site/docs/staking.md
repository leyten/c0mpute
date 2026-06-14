---
sidebar_position: 6
title: Staking
---

# Staking <span class="dollar">$</span>ZERO

Staking is how holding <span class="dollar">$</span>ZERO turns into recurring value. A single stake does three things at once:

- **Earns USDC** — your share of the staker-rewards half of the treasury.
- **Grants free credits** — a daily allowance of credits, drawn before any paid credits.
- **Boosts worker pay** — workers over the threshold earn a bigger cut on every job.

Set it up on the [staking page](https://c0mpute.ai/staking). Your <span class="dollar">$</span>ZERO stays in your own on-chain vault — only you can unstake or claim, no server holds your funds.

## How staking works

- Stake any amount of <span class="dollar">$</span>ZERO from the [staking page](https://c0mpute.ai/staking).
- A deposit must age **24 hours** before it starts earning or counting toward any perk. This stops anyone from staking right before a payout and sniping it — each deposit ages on its own clock, so only the matured portion counts.
- You can unstake at any time. Withdrawing your **full** balance is always allowed; partial unstakes have a small minimum. Unstaking pulls your newest deposits first, so your aged stake keeps earning.

## Staker rewards (USDC)

Half of all network revenue is paid to stakers in USDC, once a day at 15:00 UTC.

- Rewards are shared across stakers in proportion to how much each has staked (matured stake only).
- Paid straight to your on-chain reward vault — claim it any time from the [staking page](https://c0mpute.ai/staking).
- Watch the pool fill and pay out live on the [treasury page](https://c0mpute.ai/treasury).

### Auto-compound (optional)

Stakers can opt in to auto-compound. When it's on, your daily USDC reward is automatically used to buy <span class="dollar">$</span>ZERO on the open market and stake it back into your own self-custody vault. The newly compounded <span class="dollar">$</span>ZERO ages the normal 24 hours before it starts earning, like any deposit. It's off by default, toggled on the [staking page](https://c0mpute.ai/staking). If a swap ever fails, that day's reward simply arrives as normal USDC instead. Only you can ever withdraw from your vault.

## Stake to use — free daily credits

Staking <span class="dollar">$</span>ZERO doesn't only earn USDC — it also gives you **free credits every day** (the same credits that pay for inference). Each day the network sets aside a pool of free credits for stakers, and your share is proportional to your stake: your matured stake ÷ the matured stake of all active stakers × the pool. Your prompts draw from these free credits first, before any you've paid for — so an active staker can run real workloads without spending USDC.

- **Refreshes daily** at 00:00 UTC — use it or lose it.
- **Active stakers only** — you qualify if you've made a request in the last 7 days, so the free credits concentrate on people actually using the network, not idle farmers.
- Same **24h maturity** as rewards: a deposit must age 24h before it counts.
- The daily pool is a fixed size, so the perk scales with the network rather than draining the treasury.

You can see your remaining allowance on the [staking page](https://c0mpute.ai/staking) and next to your credit balance in the app.

## Worker boost

Workers who stake at least **1,000,000 <span class="dollar">$</span>ZERO** (held for 24h) earn a higher revenue share on every job they complete — **80% instead of 70%**. So if you run a worker, staking pays you twice: the staker rewards, plus a bigger cut of each job.

See the [worker guide](/worker-guide/browser-worker) to start earning.

## How it all fits together

Staking sits inside the wider <span class="dollar">$</span>ZERO loop — network revenue funds buybacks, staker rewards, and the free-credits pool. See [The <span class="dollar">$</span>ZERO Token](/zero-token) for the full economy.
