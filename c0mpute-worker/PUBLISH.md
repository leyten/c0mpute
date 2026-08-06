# Publishing `@c0mpute/worker` — CLASSIC line (this branch)

This is `release/worker-classic`: the package the **live network's** operators install.
It is deliberately **shard-free** — no shard mode, no shard sources, no betanet docs.
The betanet worker lives on `master` and publishes as **3.0.0** at the coordinated
go-live, never from here and never as a 2.8.x.

## What this line ships

Classic (max/image) fixes only. 2.8.3 over the published 2.8.2:
- **auto-update removed** (`466c75a`, security: self-update = mass-compromise surface).
  Operators upgrade explicitly with `npm i -g @c0mpute/worker@latest` from now on.
- tool-result wait 30s→200s so image renders don't time out (`11d5632`).
- worker reports its effective `num_ctx` at registration (orchestrator diagnostics).

## Rollout mechanics — read before publishing

2.8.2 workers still run the **startup auto-updater**, so publishing to `latest`
rolls the fleet automatically as workers restart. This is the last release that
propagates that way; 2.8.3 removes the updater, so every later upgrade is a manual
operator action. One-way door — publish when that trade is intended.

## The publish (explicit go from leyten, never automatic)

```bash
cd c0mpute-worker            # on release/worker-classic, clean tree
npm ci && npm run build
node dist/index.js --help    # smoke: no "shard" anywhere in the output
npm pack --dry-run           # file list must be dist/* + README.md + package.json only
npm publish --access public  # goes to dist-tag `latest`
```

Verify: `npm view @c0mpute/worker version` → 2.8.3, and the tarball has no `shard-*` files.
