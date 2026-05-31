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

run_build() {
  NODE_OPTIONS="$HEAP" "$NEXT_BIN" build --webpack "$@"
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
    exec systemd-run --scope --quiet \
      --unit="c0mpute-build-$$" \
      --slice=user.slice \
      -p MemoryMax=6G -p MemoryHigh=6G \
      env C0MPUTE_BUILD_ESCAPED=1 NODE_OPTIONS="$HEAP" \
      "$NEXT_BIN" build --webpack "$@"
  fi
fi

run_build "$@"
