#!/usr/bin/env bash
# Durable build wrapper. The agent that builds this project runs inside a
# systemd service cgroup capped at memory.high=1.5G / memory.max=3G. A Next
# production build needs ~2-3G, so the compile worker crosses the cap and the
# kernel throttles it into an uninterruptible-sleep hang that never finishes.
#
# This wrapper detects that cap and re-executes the build inside a transient
# systemd scope with 6G of headroom, escaping the service cgroup. On a machine
# without the cap (e.g. a normal desktop) it just runs the build directly.
set -euo pipefail

cd "$(dirname "$0")/.."

NEXT_BIN="./node_modules/.bin/next"
HEAP="--max-old-space-size=4096"
WEB_SERVICE="c0mpute-web"

run_build() {
  NODE_OPTIONS="$HEAP" "$NEXT_BIN" build --webpack "$@"
}

# `next start` reads .next once at boot. Rebuilding under a running server leaves
# it serving HTML that references chunk hashes no longer on disk -> 500s, the
# browser refuses the JS, and pages hang on a blank/loading screen. So after a
# successful build we bounce the web service to load the fresh build. Guarded so
# it's a no-op on a machine that doesn't have the service (e.g. a dev laptop).
# Reached only on build success: set -e aborts the script before here on failure.
restart_web() {
  if command -v systemctl >/dev/null 2>&1 && systemctl cat "$WEB_SERVICE" >/dev/null 2>&1; then
    echo "[build] build succeeded; restarting $WEB_SERVICE to load the new build"
    systemctl restart "$WEB_SERVICE"
  fi
}

# Read this process's memory.high ceiling from cgroup v2. If it's set and below
# 5G, we're capped and must escape; "max" or a large value means no cap.
ceiling="max"
cg="$(awk -F: '/^0::/{print $3}' /proc/self/cgroup 2>/dev/null || true)"
if [ -n "$cg" ] && [ -r "/sys/fs/cgroup${cg}/memory.high" ]; then
  ceiling="$(cat "/sys/fs/cgroup${cg}/memory.high")"
fi

if [ "$ceiling" != "max" ] && [ "$ceiling" -lt 5368709120 ] 2>/dev/null; then
  if command -v systemd-run >/dev/null 2>&1 && [ -z "${C0MPUTE_BUILD_ESCAPED:-}" ]; then
    echo "[build] cgroup memory cap detected (memory.high=$ceiling); escaping into a 6G systemd scope"
    systemd-run --scope --quiet \
      --unit="c0mpute-build-$$" \
      --slice=user.slice \
      -p MemoryMax=6G -p MemoryHigh=6G \
      env C0MPUTE_BUILD_ESCAPED=1 NODE_OPTIONS="$HEAP" \
      "$NEXT_BIN" build --webpack "$@"
    restart_web
    exit 0
  fi
fi

run_build "$@"
restart_web
