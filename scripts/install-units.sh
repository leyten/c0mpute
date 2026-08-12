#!/usr/bin/env bash
# One-time privileged step: point the three production services at the pinned
# production tree (/srv/c0mpute/prod) instead of the development checkout.
#
# Run this ONCE, as root, after /srv/c0mpute/prod exists and has been built.
# It is separate from deploy.sh because it rewrites systemd unit files, which is
# a system-level change that deserves to be run deliberately by a human.
#
# Rollback: the originals are saved next to the installed copies with a
# .pre-pinned-tree suffix; restore them and `systemctl daemon-reload`.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROD=/srv/c0mpute/prod
UNITS=(c0mpute-orchestrator c0mpute-web c0mpute-keeper)

[ "$(id -u)" = "0" ] || { echo "must run as root" >&2; exit 1; }
[ -d "$PROD/.next" ] || { echo "FATAL: $PROD is not built yet — run the build first" >&2; exit 1; }
[ -L "$PROD/data" ] || { echo "FATAL: $PROD/data must be a symlink to the live data dir" >&2; exit 1; }

for u in "${UNITS[@]}"; do
  src="$REPO/deploy/$u.service"
  dst="/etc/systemd/system/$u.service"
  [ -f "$src" ] || { echo "missing $src" >&2; exit 1; }
  if [ -f "$dst" ] && [ ! -f "$dst.pre-pinned-tree" ]; then
    cp "$dst" "$dst.pre-pinned-tree"
    echo "saved original -> $dst.pre-pinned-tree"
  fi
  cp "$src" "$dst"
  echo "installed $u"
done

systemctl daemon-reload
echo
echo "Units installed. Now restart them (this is a brief production blip):"
echo "  systemctl restart c0mpute-orchestrator && sleep 2 && systemctl restart c0mpute-web && systemctl restart c0mpute-keeper"
echo
echo "Then verify:"
echo "  curl -s http://127.0.0.1:3004/health"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3003/chat"
echo "  systemctl show c0mpute-orchestrator -p WorkingDirectory --value   # expect $PROD"
