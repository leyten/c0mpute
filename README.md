# c0mpute

**Uncensored, private, decentralized AI inference.**

c0mpute is an inference network where the GPUs are contributed, not rented. Anyone can plug a
machine in and earn for the tokens it serves; anyone can run a model through an OpenAI-compatible
API without an account gate, without their prompts being logged, and without a content filter
deciding what they're allowed to ask. The network is coordinated by a thin orchestrator and
settled on Solana through the `$ZERO` token.

It is built on three pillars, and every feature is measured against all three:

- **Uncensored** — the only hard line is illegal content (CSAM). There is no model-level refusal layer.
- **Private** — prompts and generated images are never persisted. The only thing stored is the
  credit transaction needed to bill the job.
- **Decentralized** — inference runs on contributor GPUs (browser via WebGPU, or native via
  Ollama), not on centralized infrastructure. Payouts settle on-chain.

---

## How it works

```
  user / API client
        │  prompt
        ▼
  ┌───────────────┐      job          ┌──────────────────────┐
  │  web + API    │ ───────────────▶  │  orchestrator (ws)   │
  │  (Next.js)    │                   │  routing, billing,    │
  │  credits,     │ ◀───────────────  │  anti-cheat, payouts  │
  │  auth (Privy) │   streamed tokens └──────────┬───────────┘
  └───────────────┘                              │ dispatch
                                                 ▼
                                    ┌─────────────────────────┐
                                    │  contributor GPU workers │
                                    │  browser (WebGPU) /      │
                                    │  native (Ollama)         │
                                    └─────────────────────────┘

  $ZERO keeper ── claims creator fees ─▶ buyback + burn  +  staker reward distribution
```

- **Web + API** (`app/`, Next.js) — chat UI, image generation, credits, staking dashboard, and an
  OpenAI-compatible REST API.
- **Orchestrator** (`server/`, `lib/orchestrator/`) — a WebSocket server that queues jobs, routes
  them to the fastest idle worker, deducts credits before dispatch, streams tokens back, and runs
  the worker anti-cheat (canary probes + coherence + throughput checks).
- **Workers** (`c0mpute-worker/`) — the agent a contributor runs to serve inference. Native
  workers auto-install their runtime; browser workers run models in-tab over WebGPU.
- **Keeper** (`scripts/keeper.ts`, `lib/keeper/`) — a scheduled job that claims `$ZERO` creator
  fees, buys back and burns `$ZERO`, and distributes USDC rewards to stakers.
- **On-chain** (`lib/onchain-staking.ts`, `lib/payout.ts`) — staking, custodial deposit wallets,
  and USDC payouts on Solana.

## API

OpenAI-compatible. Point any OpenAI client at the c0mpute base URL and use a `sk-c0mpute-…` key.

```bash
curl https://c0mpute.ai/api/v1/chat/completions \
  -H "Authorization: Bearer sk-c0mpute-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "c0mpute",
    "messages": [{"role": "user", "content": "explain entropy in one line"}],
    "stream": true
  }'
```

`GET /api/v1/models` lists available models. Image generation is exposed at
`POST /api/images/generate`.

## Running it

Requirements: Node 20+, a Solana RPC URL, and a Privy app for auth.

```bash
npm install
cp .env.local.example .env.local   # fill in the values below
npm run dev:all                    # Next.js web + orchestrator together
```

| script               | what it runs                          |
| -------------------- | ------------------------------------- |
| `npm run dev`        | Next.js web/API only                  |
| `npm run dev:server` | orchestrator (WebSocket) only         |
| `npm run dev:all`    | both, concurrently                    |
| `npm run start:keeper` | the $ZERO buyback/burn/rewards keeper |
| `npm run build`      | production build (memory-safe wrapper) |

Core environment variables (see `.env.local.example` for the full list):

| var | purpose |
| --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` | auth |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `ZERO_TOKEN_MINT` | the $ZERO mint |
| `TREASURY_WALLET_KEY` / `DEPOSIT_WALLET_KEY` | custodial payout + deposit wallets (keep off-repo) |
| `INTERNAL_API_SECRET` | web↔orchestrator trust |
| `ADMIN_SECRET` | admin dashboard gate |

> Secrets live in `.env.local` (gitignored). Never commit a wallet key.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · socket.io · better-sqlite3 · Solana
(`@solana/kit`, `@coral-xyz/anchor`, `@pump-fun/pump-swap-sdk`) · Privy auth · web-llm (WebGPU) ·
Ollama (native workers).

## Repository layout

```
app/                Next.js routes + API (app/api/v1 is the OpenAI-compatible surface)
server/             orchestrator entrypoint
lib/                core logic: orchestrator, keeper, staking, payouts, db, crypto
lib/orchestrator/   job routing, billing, worker anti-cheat
lib/keeper/         on-chain buyback/burn + reward distribution
c0mpute-worker/     the contributor worker (browser + native)
scripts/            keeper, db backup, seed, state sync
docs-site/          documentation site
```

## License

TBD.
