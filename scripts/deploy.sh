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
set -euo pipefail

REPO=/root/.openclaw/workspace/c0mpute
PROD=/srv/c0mpute/prod
STATE=/srv/c0mpute/last-release
HEALTH_TRIES=30

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

say "deployed $SHA"
git -C "$PROD" log --oneline -1
