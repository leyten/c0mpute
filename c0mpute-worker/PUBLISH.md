# Publishing `@c0mpute/worker` to npm — a GO-LIVE action, NOT a pre-launch step

> ⛔ **DO NOT publish before the coordinated betanet launch.** Publishing is a world-facing deploy:
> the package your real, live operators install from. There is **no benefit** to publishing before
> launch and real risk in doing so:
> - the live network runs fine on what operators already have (npm 2.8.2 today);
> - a new publish makes the reinstall menu advertise **"3) Shard node — serve a slice of a frontier
>   model with the swarm"** to everyone, exposing the un-launched betanet;
> - it entangles not-yet-launched betanet code into the world-facing install.
>
> Publishing belongs in the **single coordinated go-live flip**, together with: deploying the
> swarm-hardening code to the prod orchestrator (pull master + restart in a window), publishing the
> signed manifest to `public/manifests/`, setting `MANIFEST_PUBKEY` / `SWARM_AUDITOR_PUBKEYS` /
> `SWARM_SEED_ADDRS`, filling `public/relays.json`, and flipping `SWARM_PAYOUT_ENABLED`. All at once,
> deliberately, when we actually launch — never piecemeal.

## Rehearsal does NOT need this

The pre-launch rehearsal ring runs a **directly-shipped built worker** on isolated test boxes pointed
at a **test/sim orchestrator** — never the prod orchestrator, never npm. Nothing about validating the
betanet requires touching the live install path.

## The publish (only at go-live, one paste, from a clean master checkout)

```bash
# GO-LIVE ONLY. From a fresh, up-to-date master clone.
cd c0mpute/c0mpute-worker
git -C .. pull --ff-only origin master
npm ci
npm run build
node dist/index.js --mode shard        # smoke: "c0mpute worker v2.8.3" + asks for --token

npm login                              # @c0mpute org creds (leyten)
npm publish --access public            # scoped package -> --access public
```

## Verify (30 s after publish)

```bash
npm view @c0mpute/worker version           # -> 2.8.3
npx -y @c0mpute/worker@latest --mode shard # -> "c0mpute worker v2.8.3", asks for --token
```

## Pre-publish checklist (go-live)

- [ ] The betanet is **actually launching** — this is part of the coordinated flip, not a standalone step.
- [ ] The prod orchestrator has been updated to master + restarted (so it speaks the shard protocol the
      published worker expects).
- [ ] On merged master, no local edits; `npm run build` clean; smoke shows **v2.8.3**.
- [ ] `files` ships only `dist` + `README.md` — no secrets.
- [ ] Version is unused on npm (npm has 2.8.2; `npm publish` refuses a duplicate — bump with
      `npm version patch` if needed).

> Auto-update was removed (`feat!: remove worker auto-update`), so existing operators are never
> force-upgraded — but a fresh `npx`/reinstall gets whatever is `@latest`, which is why the *timing*
> of the publish is the whole point.
