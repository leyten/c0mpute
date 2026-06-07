---
sidebar_position: 3
title: Worker tokens
---

# Worker tokens

Worker tokens authenticate your native worker with the c0mpute network. They link your worker to your Privy account so you get credit for completed jobs.

## Generating a token

1. Go to [c0mpute.ai/worker](https://c0mpute.ai/worker)
2. Log in with your X (Twitter) account
3. Scroll to **Native Worker**
4. Click **Get Worker Token**
5. **Copy and save the token immediately** — it's shown only once

## Token format

All worker tokens start with `cwt_` followed by a random string:

```
cwt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## Important details

- **Shown once** — tokens are stored hashed on the server. If you lose it, generate a new one.
- **Never expire** — tokens remain valid until you revoke them.
- **Max 5 per account** — you can have up to 5 active tokens. This lets you run multiple workers on different machines.
- **Tied to your account** — earnings from any token go to the same Privy account.

## Revoking tokens

If a token is compromised or you no longer need it:

1. Go to c0mpute.ai settings
2. Find the token in your active tokens list
3. Click **Revoke**

Revoked tokens stop working immediately. Any worker using that token will disconnect.

## Security

- Never share your worker token publicly
- Don't commit it to git repositories
- Use environment variables if running in automated setups:

```bash
export C0MPUTE_TOKEN="cwt_your_token_here"
npx @c0mpute/worker --token $C0MPUTE_TOKEN
```

- If you accidentally expose a token, revoke it immediately and generate a new one
