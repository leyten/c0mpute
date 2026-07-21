# Publishing `@c0mpute/worker` to npm (operator runbook)

Publishing is a **leyten action** — it needs the `@c0mpute` npm org credentials (the automation
box has none; `npm whoami` there returns E401). Currently npm has **2.8.2 (pre-shard)**; the repo is
**2.8.3** with `--mode shard`. Until this ships, `npx @c0mpute/worker --mode shard` errors for
strangers and the WSL bootstrap (`scripts/wsl-setup.sh`, which calls `npx @c0mpute/worker@latest`)
can't complete.

## The publish (one paste, from a clean master checkout)

```bash
# from a fresh, up-to-date master clone (NOT a dev tree with uncommitted changes)
cd c0mpute/c0mpute-worker
git -C .. pull --ff-only origin master      # ensure you're on merged master
npm ci                                       # clean install from the lockfile
npm run build                                # tsc -> dist/index.js
node dist/index.js --mode shard              # smoke: prints "c0mpute worker v2.8.3" + asks for --token

npm login                                    # if not already logged into the @c0mpute org
npm publish --access public                  # scoped package -> --access public
```

## Verify (30 seconds after publish)

```bash
npm view @c0mpute/worker version             # -> 2.8.3
npx -y @c0mpute/worker@latest --mode shard   # -> "c0mpute worker v2.8.3", asks for --token
```

## Pre-publish checklist

- [ ] On **merged master** (`git log --oneline -1` matches origin/master), no local edits.
- [ ] `npm run build` clean; `dist/index.js` present; the smoke line shows **v2.8.3**.
- [ ] `dist` + `README.md` are the `files` shipped (package.json `files`) — no stray secrets.
- [ ] Version is **2.8.3** (npm has 2.8.2; `npm publish` refuses a duplicate version, so a re-publish
      needs a bump — `npm version patch` — then repeat build + publish).

## What this unblocks

- **Every stranger's `npx` join** (the standard install path).
- **The WSL2 bootstrap** end-to-end (`wsl-setup.sh` → `npx @c0mpute/worker@latest --mode shard`).
- **The full-daemon rehearsal ring** (real boxes running the current worker without hand-shipping a
  build), which produces the P0-#6 warm re-join ≤3min receipt.

> Note: the daemon self-provisions the shard **engine** from GitHub (public) and the **sidecar** from
> the published `sidecar-v0.1.0` release (already live, sha-pinned) — so once the worker is on npm, a
> Go-less stranger on stock Ubuntu/WSL needs nothing else.
