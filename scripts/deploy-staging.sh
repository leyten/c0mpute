#!/usr/bin/env bash
# Ship any ref to STAGING (staging.compute.tech) — the place a change runs
# before scripts/deploy.sh puts it in front of users.
#
#   scripts/deploy-staging.sh [ref]   ref defaults to origin/master; any branch,
#                                     tag or sha works (feature branches too)
#
# Staging is a second git worktree (/srv/c0mpute/staging) with its own services
# (c0mpute-staging-web :3013, c0mpute-staging-orchestrator :3014), its own
# sqlite database (/srv/c0mpute/staging-data) and its own env file
# (/srv/c0mpute/staging.env). Two things keep it harmless: the env carries no
# treasury or payout key and a devnet RPC (scripts/staging-env-check.sh enforces
# that on every deploy and every start), and the services run as the sandboxed
# c0staging user, which cannot see /root or the production tree. Never point
# staging/.env.local at the production env.
#
# Unlike deploy.sh this keeps no rollback build: if staging breaks, deploy the
# previous ref again.
set -euo pipefail

REPO=/root/.openclaw/workspace/c0mpute
STAGING=/srv/c0mpute/staging
DATA=/srv/c0mpute/staging-data
ENVFILE=/srv/c0mpute/staging.env
LOCK=/srv/c0mpute/.staging-deploy.lock
HEALTH_TRIES=45

exec 9>"$LOCK"
flock -n 9 || { echo "[staging] FATAL: another staging deploy holds $LOCK" >&2; exit 1; }

say() { echo "[staging] $*"; }
die() { echo "[staging] FATAL: $*" >&2; exit 1; }

# The env file is what makes staging harmless. Check it with the guard from
# THIS checkout and install that copy for the units' ExecStartPre, so the check
# never depends on which ref the staging tree happens to hold.
HERE="$(cd "$(dirname "$0")" && pwd)"
[ "$(readlink -f "$STAGING/.env.local")" = "$ENVFILE" ] || die "$STAGING/.env.local must be a symlink to $ENVFILE"
[ "$(readlink -f "$STAGING/data")" = "$DATA" ] || die "$STAGING/data must be a symlink to $DATA"
bash "$HERE/staging-env-check.sh" "$ENVFILE" || die "staging env rejected"
install -m 755 "$HERE/staging-env-check.sh" /srv/c0mpute/staging-env-check.sh

health() {
  local i
  for i in $(seq 1 $HEALTH_TRIES); do
    if curl -sf --max-time 3 http://127.0.0.1:3014/health | grep -q '"ok"' &&
       [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3013/chat)" = "200" ]; then
      say "health OK after ${i}s"
      return 0
    fi
    sleep 1
  done
  return 1
}

REF="${1:-origin/master}"
# Bounded: a stalled SSH fetch once held this script for 20 minutes.
timeout 60 git -C "$REPO" fetch --quiet origin || say "fetch failed; using local refs"
SHA="$(git -C "$REPO" rev-parse --verify "$REF^{commit}")" || die "cannot resolve ref: $REF"
CURRENT="$(git -C "$STAGING" rev-parse HEAD)"
say "current: $CURRENT"
say "target:  $SHA ($REF)"

git -C "$STAGING" checkout -q --detach "$SHA"

if ! git -C "$STAGING" diff --quiet "$CURRENT" "$SHA" -- package-lock.json 2>/dev/null || [ ! -d "$STAGING/node_modules" ]; then
  say "installing dependencies"
  (cd "$STAGING" && npm ci --no-audit --no-fund) || die "npm ci failed"
fi
(cd "$STAGING" && bash scripts/check-webllm-patch.sh) || die "web-llm patch missing in $STAGING; run 'npm ci' there"

# A Next build needs ~3G. When this runs inside a memory-capped service cgroup
# (the agent that usually drives it), escape into a 6G scope, as build.sh does.
say "building"
build() { (cd "$STAGING" && NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/next build --webpack); }
ceiling=max
cg="$(awk -F: '/^0::/{print $3}' /proc/self/cgroup 2>/dev/null || true)"
[ -n "$cg" ] && [ -r "/sys/fs/cgroup${cg}/memory.high" ] && ceiling="$(cat "/sys/fs/cgroup${cg}/memory.high")"
if [ "$ceiling" != "max" ] && [ "$ceiling" -lt 5368709120 ] 2>/dev/null && command -v systemd-run >/dev/null; then
  systemd-run --scope --quiet --unit="c0mpute-staging-build-$$" --slice=user.slice -p MemoryMax=6G -p MemoryHigh=6G \
    --working-directory="$STAGING" env NODE_OPTIONS="--max-old-space-size=4096" ./node_modules/.bin/next build --webpack \
    || die "build failed (services still run the previous build)"
else
  build || die "build failed (services still run the previous build)"
fi

# The services run as c0staging and may only write the data dir and Next's cache.
mkdir -p "$STAGING/.next/cache"
chown -R c0staging:c0staging "$STAGING/.next/cache"

say "restarting staging services"
systemctl restart c0mpute-staging-orchestrator
sleep 2
systemctl restart c0mpute-staging-web
health || die "staging did not come up healthy — journalctl -u c0mpute-staging-orchestrator -u c0mpute-staging-web"

ACTUAL="$(git -C "$STAGING" rev-parse HEAD)"
[ "$ACTUAL" = "$SHA" ] || die "tree moved during deploy — expected $SHA, tree holds $ACTUAL"
say "deployed $SHA to https://staging.compute.tech"
git -C "$STAGING" log --oneline -1
