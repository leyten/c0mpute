---
sidebar_position: 5
title: The $ZERO Token
---

# The $ZERO Token

$ZERO is the credit token that powers the c0mpute network. It's how users pay for AI inference and how the network funds worker payouts.

## How credits work

**1 $ZERO = 1 credit.** Simple.

Deposit $ZERO tokens to your c0mpute account and they convert to credits at a 1:1 ratio. Credits are spent when you send messages based on your selected tier:

| Tier | Cost per message |
|------|-----------------|
| **Free** | 0 credits |
| **Pro** | 10 credits |
| **Max** | 50 credits |

## Depositing $ZERO

1. Go to [c0mpute.ai](https://c0mpute.ai) and log in
2. Navigate to **Settings** → **Wallet**
3. Copy your **deposit address**
4. Send $ZERO tokens to that address
5. Credits appear in your account once the transaction confirms

Your deposit address is unique to your account. Any $ZERO sent to it is automatically converted to credits.

## The economic loop

```
1. Users buy $ZERO on the open market
2. Users deposit $ZERO → receive credits
3. Credits are spent on AI inference (messages)
4. $ZERO trading generates transaction fees in SOL
5. Transaction fees flow into the worker reward pool
6. Workers earn SOL for completing inference jobs
```

The more people use c0mpute, the more $ZERO trades. The more $ZERO trades, the more SOL workers earn. This creates a self-reinforcing cycle where usage directly funds the compute network.

## For users

- **Free tier costs nothing** — no credits needed, no $ZERO required
- **Pro and Max** require credits — deposit $ZERO to unlock higher quality, uncensored AI
- Credits don't expire
- If a job fails or you disconnect mid-job, credits are refunded

## For workers

Workers don't need to hold $ZERO. They earn SOL directly from the fee pool based on:

- Number of jobs completed
- Tokens generated per job
- Tier of jobs served (Max pays more than Pro, Pro pays more than Free)

See [Worker earnings](/worker-guide/browser-worker#earnings) for details.
