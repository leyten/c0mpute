#!/usr/bin/env bash
# c0mpute shard-node bootstrap for WSL2 (and stock Ubuntu). Turns "install 4 things by hand and
# hit sequential apt failures" into ONE command. Installs the toolchain the daemon self-provision
# assumes (git, Node 20+, Python 3.11+ with venv) then launches the shard-mode worker, which does
# the rest on its own (engine checkout, pinned venv, sidecar download+verify, manifest resolve,
# probe slice, join). The NVIDIA driver is on the WINDOWS host (see docs/WINDOWS.md) — WSL sees the
# GPU through it; nothing GPU is installed here.
#
#   curl -fsSL https://raw.githubusercontent.com/leyten/c0mpute/master/scripts/wsl-setup.sh | bash -s -- --token cwt_YOURTOKEN
#
# or set C0MPUTE_TOKEN / C0MPUTE_URL in the environment. Idempotent: re-runs skip what's present.
set -euo pipefail

TOKEN="${C0MPUTE_TOKEN:-}"
URL="${C0MPUTE_URL:-https://c0mpute.ai}"
while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2;;
    --url)   URL="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

log() { echo -e "\033[1;36m[c0mpute-setup]\033[0m $*"; }
die() { echo -e "\033[1;31m[c0mpute-setup] $*\033[0m" >&2; exit 1; }

[ -n "$TOKEN" ] || die "no token. Get one at ${URL} → Earn/Worker, then re-run with --token cwt_..."

# ── sanity: are we the right kind of box? ────────────────────────────────────────────────────────
command -v apt-get >/dev/null 2>&1 || die "this bootstrap is for Debian/Ubuntu (incl. WSL2 Ubuntu). On other distros install git + Node 20 + Python 3.11 yourself, then run: npx -y @c0mpute/worker --mode shard --token $TOKEN"
if grep -qi microsoft /proc/version 2>/dev/null; then log "WSL2 detected"; else log "native Linux detected"; fi
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"

# ── the GPU is passed through from the Windows host driver — warn early if it's not visible ───────
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  log "GPU visible: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)"
else
  log "WARNING: no GPU visible in WSL yet. Install the NVIDIA driver on WINDOWS (not inside WSL) and reopen WSL — see docs/WINDOWS.md. Continuing to provision the toolchain."
fi

log "updating apt…"; $SUDO apt-get update -qq

# ── git ──────────────────────────────────────────────────────────────────────────────────────────
command -v git >/dev/null 2>&1 || { log "installing git"; $SUDO apt-get install -y -qq git; }

# ── Python 3.11+ with venv (the daemon needs >= 3.11) ────────────────────────────────────────────
pyok() { python3 -c 'import sys; raise SystemExit(0 if sys.version_info>=(3,11) else 1)' 2>/dev/null; }
if pyok; then
  log "python3 $(python3 -V 2>&1 | awk '{print $2}') ok"
  $SUDO apt-get install -y -qq python3-venv python3-pip >/dev/null 2>&1 || true
else
  cur=$(python3 -V 2>&1 || echo none)
  log "python3 is $cur — need >= 3.11. On Ubuntu 24.04 this is default; on 22.04 installing 3.11 via deadsnakes…"
  $SUDO apt-get install -y -qq software-properties-common
  $SUDO add-apt-repository -y ppa:deadsnakes/ppa >/dev/null
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq python3.11 python3.11-venv python3.11-dev
  # make python3 resolve to 3.11 so the daemon's `python3 -m venv` uses it
  $SUDO update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 2 >/dev/null
  pyok || die "python3 is still < 3.11 after install — easiest fix: use Ubuntu 24.04 (wsl --install -d Ubuntu-24.04)."
  log "python3 now $(python3 -V 2>&1 | awk '{print $2}')"
fi

# ── Node 20+ (the worker is an npm package) ──────────────────────────────────────────────────────
nodeok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; }
if nodeok; then
  log "node $(node -v) ok"
else
  log "installing Node 20 (nodesource)…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - >/dev/null
  $SUDO apt-get install -y -qq nodejs
  nodeok || die "Node 20+ install failed — install it manually and re-run."
  log "node $(node -v) installed"
fi

# ── launch the daemon — it self-provisions the engine, venv deps, sidecar, weights, and joins ────
log "toolchain ready. Launching the shard-mode worker (first run pulls several GB — engine deps + your weight slice)…"
log "relays are auto-discovered; no manual network config needed."
exec npx -y @c0mpute/worker@latest --mode shard --token "$TOKEN" --url "$URL"
