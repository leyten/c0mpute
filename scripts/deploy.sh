#!/usr/bin/env bash
# The only supported way to ship c0mpute.
#
# Production runs from /srv/c0mpute/prod — a git worktree pinned to the
# `production` branch — and NOT from the development checkout. That separation
# is the point: before it existed, `systemctl restart c0mpute-orchestrator`
# deployed whatever branch happened to be checked out, and a stray pkill in the
# dev tree matched the production process (2026-08-11 incident).
#
#   scripts/deploy.sh [ref]      ref defaults to origin/master
#   scripts/deploy.sh --rollback  put the previous release back
#
# Live state is NOT copied: prod/data and prod/.env.local are symlinks to the
# canonical locations, so the 26MB sqlite database is never duplicated or
# shadowed by an empty one.
#
# A worktree contains only TRACKED files, so anything gitignored but needed at
# runtime is silently absent here. Today that is data-site/network.json and
# data-site/stats.json, and it is harmless for one specific reason: their
# generators (scripts/network-map.ts, scripts/data-stats.ts) resolve their
# output from `__dirname`, not the working directory, and their units
# deliberately still run from the development checkout — so they keep writing
# where the static-site builds already read from. Nothing the Next app serves
# reads either file.
#
# That is a coupling, not a coincidence. If c0mpute-networkmap or
# c0mpute-datastats is ever repointed at this tree, they will start writing to
# /srv/c0mpute/prod/data-site/ and the absolute LIVE_DATA path in
# scripts/build-compute-tech.sh will go stale, serving a dangling symlink for
# data.compute.tech. Move that path in the same change, or leave those two units
# on the development checkout where they are.
set -euo pipefail

REPO=/root/.openclaw/workspace/c0mpute
PROD=/srv/c0mpute/prod
STATE=/srv/c0mpute/last-release
LOCK=/srv/c0mpute/.deploy.lock
HEALTH_TRIES=30

# EXCLUSIVE. This script checks out, builds, and restarts as three separate
# steps, so anything else moving the tree in between leaves a process running
# one commit while the tree holds another — and both parties believe they
# shipped. That happened on 2026-08-11: a second session detached the tree to
# master between this script's build and its restart, so the orchestrator came
# up on master while the deploy reported success for a different sha. Take the
# lock for the whole run, and fail fast rather than interleave.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[deploy] FATAL: another deploy holds $LOCK — refusing to interleave" >&2
  exit 1
fi

say() { echo "[deploy] $*"; }
die() { echo "[deploy] FATAL: $*" >&2; exit 1; }

# Both services have to answer before a deploy counts as successful. The
# orchestrator's /health is the network's liveness; /chat exercises the built
# frontend rather than just proving the port is open.
health() {
  local i
  for i in $(seq 1 $HEALTH_TRIES); do
    if curl -sf --max-time 3 http://127.0.0.1:3004/health | grep -q '"ok"' &&
       [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3003/chat)" = "200" ]; then
      say "health OK after ${i}s"
      return 0
    fi
    sleep 1
  done
  return 1
}

restart_services() {
  systemctl restart c0mpute-orchestrator
  # The web app talks to the orchestrator on boot; give it an ordered start.
  sleep 2
  systemctl restart c0mpute-web
}

if [ "${1:-}" = "--rollback" ]; then
  [ -f "$STATE" ] || die "no previous release recorded"
  PREV="$(cat "$STATE")"
  say "rolling back to $PREV"
  git -C "$PROD" checkout -q --detach "$PREV"
  # The previous build is kept as a sibling directory precisely so a rollback is
  # a rename, not a rebuild.
  if [ -d "$PROD/.next-prev" ]; then
    rm -rf "$PROD/.next"
    mv "$PROD/.next-prev" "$PROD/.next"
  else
    say "WARNING: no .next-prev; rebuilding"
    (cd "$PROD" && NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/next build --webpack)
  fi
  restart_services
  health || die "rollback did not come up healthy — manual intervention needed"
  say "rolled back to $PREV"
  exit 0
fi

REF="${1:-origin/master}"
git -C "$REPO" fetch --quiet origin || say "fetch failed; using local refs"
SHA="$(git -C "$REPO" rev-parse --verify "$REF^{commit}")" || die "cannot resolve ref: $REF"
CURRENT="$(git -C "$PROD" rev-parse HEAD)"

say "current: $CURRENT"
say "target:  $SHA ($REF)"
[ "$SHA" = "$CURRENT" ] && say "already at target; redeploying anyway"

# Record what to go back to BEFORE touching anything.
echo "$CURRENT" > "$STATE"

say "updating production tree"
git -C "$PROD" checkout -q --detach "$SHA"

# Dependencies are only reinstalled when the lockfile actually moved; otherwise
# the existing tree is reused, which keeps a deploy under a minute.
if ! git -C "$PROD" diff --quiet "$CURRENT" "$SHA" -- package-lock.json 2>/dev/null; then
  say "package-lock.json changed — reinstalling dependencies"
  (cd "$PROD" && npm ci --omit=dev --no-audit --no-fund) || die "npm ci failed"
fi

say "building"
rm -rf "$PROD/.next-prev"
[ -d "$PROD/.next" ] && mv "$PROD/.next" "$PROD/.next-prev"
if ! (cd "$PROD" && NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/next build --webpack); then
  say "build FAILED — restoring previous build, production untouched"
  rm -rf "$PROD/.next"
  [ -d "$PROD/.next-prev" ] && mv "$PROD/.next-prev" "$PROD/.next"
  git -C "$PROD" checkout -q --detach "$CURRENT"
  die "build failed; nothing was deployed"
fi

# The credit denomination has to match the ledger BEFORE anything serves it.
# --if-needed exits 0 and silent when the build still prices a credit at a cent,
# or when this database has already been migrated, so this is safe to leave here
# permanently. It only ever acts on the one deploy that carries the repricing.
#
# Before restart_services, not after: the orchestrator refuses to boot against an
# unscaled ledger (lib/denomination-guard.ts), so running this second would turn
# the deploy's own safety net into a failed health check.
say "checking credit denomination"
if ! (cd "$PROD" && ./node_modules/.bin/tsx scripts/migrate-credit-redenomination.ts --if-needed); then
  die "credit redenomination failed; nothing was restarted"
fi

say "restarting services"
restart_services

if ! health; then
  say "UNHEALTHY after deploy — rolling back automatically"
  git -C "$PROD" checkout -q --detach "$CURRENT"
  rm -rf "$PROD/.next"
  [ -d "$PROD/.next-prev" ] && mv "$PROD/.next-prev" "$PROD/.next"
  restart_services
  health && say "rolled back to $CURRENT and healthy" || say "ROLLBACK ALSO UNHEALTHY — intervene now"
  die "deploy failed health check"
fi

# The assertion that would have caught the 2026-08-11 collision. The lock stops
# another deploy interleaving, but not a hand-checkout by someone bypassing this
# script, so verify rather than assume: the tree must still hold exactly what we
# built and restarted onto. If it does not, the running services are not this
# commit and reporting success would be a lie.
ACTUAL="$(git -C "$PROD" rev-parse HEAD)"
if [ "$ACTUAL" != "$SHA" ]; then
  die "tree moved during deploy — expected $SHA, tree holds $ACTUAL. The running services may be neither. Re-run this deploy."
fi

say "deployed $SHA"
git -C "$PROD" log --oneline -1
