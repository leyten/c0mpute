#!/usr/bin/env bash
# One-command local proof of the shard node daemon: boots the mock orchestrator
# (scripts/shard-daemon-sim.ts) and one --mode shard daemon against it, then streams the
# lifecycle — enroll -> announce -> assign -> pull -> stage READY -> swarm serving.
#
#   From c0mpute/c0mpute-worker:   npm run build && ../scripts/try-shard.sh
#
# On a box WITH an NVIDIA GPU this self-provisions the real engine (vllm venv + weights —
# several GB, minutes the first time) and runs a REAL stage on your card. On a box WITHOUT
# a GPU it uses the bundled shim so you can still watch the full control-plane lifecycle.
# Ctrl-C tears everything down.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="$REPO_ROOT/c0mpute-worker"
PORT="${PORT:-3901}"
NODES="${NODES:-1}"
LAYERS="${LAYERS:-1}"

if [ ! -f "$WORKER/dist/index.js" ]; then
  echo "Building the worker first..."; (cd "$WORKER" && npm install && npm run build)
fi

# GPU-less boxes get the shim so the lifecycle still runs end to end.
SHIM_ENV=()
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "No NVIDIA GPU detected — using the engine shim (control-plane demo, no real weights)."
  SHIM_ENV=(C0MPUTE_SHARD_PYTHON="$REPO_ROOT/scripts/shard-python-shim.py")
fi

PIDS=()
cleanup() {
  echo; echo "tearing down..."
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  pkill -f 'sidecar -key .*/\.c0mpute' 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# SERVE=1: after READY, dispatch one real request through the daemon's coordinator and settle it
# (leg 8 end-to-end; simulated receipt-verify — the shim has no stages to sign real receipts).
SERVE_ARGS=()
if [ "${SERVE:-0}" = "1" ]; then SERVE_ARGS=(--serve --accept-receipts); fi

echo "== starting mock orchestrator on :$PORT (waiting for $NODES node(s), $LAYERS layer(s) each)"
( cd "$REPO_ROOT" && npx tsx scripts/shard-daemon-sim.ts --nodes "$NODES" --layers "$LAYERS" --port "$PORT" "${SERVE_ARGS[@]}" ) &
PIDS+=($!)
sleep 4

echo "== starting the shard daemon"
( cd "$WORKER" && env "${SHIM_ENV[@]}" node dist/index.js --mode shard --token cwt_local --url "http://127.0.0.1:$PORT" ) &
PIDS+=($!)

echo "== streaming (Ctrl-C to stop) ================================================"
wait
