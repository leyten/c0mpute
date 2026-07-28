#!/usr/bin/env bash
# S2 SLOW-TAIL PROOF (no GPU, no spend): the head must survive a tail that is still pulling.
#
# On the 2026-07-28 stranger ring (docs/receipts/stranger-serve-20260728.json, bug S2) the head
# launched its coordinator the moment its OWN stage was ready. But the coordinator's return leg
# dials the TAIL, so every attempt failed while the tail was still pulling 30 GB — and each failure
# incremented the STAGE restart counter: EAGLE silently latched off at 2, and at 6 the head called
# release() and LEFT a ring that was minutes from ready ("leaving swarm: coordinator kept dying").
#
# Here: two REAL --mode shard daemons, and the TAIL is deliberately held back. Green iff the head
# is still enrolled when the tail arrives, its coordinator never degraded, and the ring then serves.
#
#   From the repo root:   bash scripts/slow-tail-test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="$REPO_ROOT/c0mpute-worker"
PORT="${PORT:-3941}"
TAIL_DELAY="${TAIL_DELAY:-95}"          # seconds the tail spends "pulling weights"
# 95s is deliberate: long enough that the head's coordinator fails several dials AND its own stage
# gives up its forward roundtrip and restarts, which is the state the head has to survive. A delay
# short enough to be swallowed by one dial window tests nothing.
LOGS="$(mktemp -d /tmp/slow-tail.XXXXXX)"
SHIM="$REPO_ROOT/scripts/shard-python-shim.py"

if [ ! -f "$WORKER/dist/index.js" ]; then (cd "$WORKER" && npm run build); fi

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill -9 -- "-$p" 2>/dev/null || true; done
  rm -rf /root/.c0mpute-slowtail-a /root/.c0mpute-slowtail-b
  echo "logs kept at $LOGS"
}
trap cleanup EXIT INT TERM
rm -rf /root/.c0mpute-slowtail-a /root/.c0mpute-slowtail-b

echo "== sim orchestrator :$PORT (2-stage ring, serve once)"
setsid npx tsx "$REPO_ROOT/scripts/shard-daemon-sim.ts" --nodes 2 --stages 2 --layers 1 \
  --serve --once --accept-receipts --port "$PORT" > "$LOGS/sim.log" 2>&1 &
SIM_PID=$!; PIDS+=($SIM_PID)
for i in $(seq 1 40); do grep -q "mock orchestrator up" "$LOGS/sim.log" && break; sleep 0.5; done

start_daemon() {  # $1 = letter, $2 = port base, $3 = seconds this node spends "pulling"
  setsid env \
    C0MPUTE_SHARD_HOME="/root/.c0mpute-slowtail-$1" \
    SHIM_STAGE_READY_DELAY_S="${3:-0}" \
    C0MPUTE_SHARD_PORT_BASE="$2" \
    C0MPUTE_SHARD_PYTHON="$SHIM" \
    C0MPUTE_SHARD_REPO="${SHARD_REPO_PATH:-/root/.openclaw/workspace/shard}" \
    C0MPUTE_SIDECAR_BIN="${C0MPUTE_SIDECAR_BIN:-/root/.c0mpute/bin/sidecar}" \
    C0MPUTE_SHARD_MANIFEST_PUBKEY=sim-publisher-pin \
    C0MPUTE_SHARD_PROBE_PEERS='' \
    SHIM_COORD_DIAL_ATTEMPTS=2 \
    M25_EAGLE=1 \
    node "$WORKER/dist/index.js" --mode shard --token cwt_sim --url "http://127.0.0.1:$PORT" \
    > "$LOGS/daemon-$1.log" 2>&1 &
  echo $!
}
admitted() { grep -c "admitted" "$LOGS/sim.log" 2>/dev/null || true; }

# a announces first so the planner makes it stage 0 (head); the ring only FORMS once b is in the
# pool too. What differs is how long the TAIL spends pulling: the head reaches SHARD_STAGE_READY in
# seconds and the tail does not — the real cold-ring shape, where the head is warm 25 minutes early.
echo "== daemon a (head + coordinator — ready in seconds)"; A=$(start_daemon a 29860 0); PIDS+=($A)
for i in $(seq 1 120); do [ "$(admitted)" -ge 1 ] && break; sleep 1; done
echo "== daemon b (tail — 'pulling weights' for ${TAIL_DELAY}s)"; B=$(start_daemon b 29880 "$TAIL_DELAY"); PIDS+=($B)

echo "== waiting for the verdict"
set +e; wait "$SIM_PID"; RC=$?; set -e

echo
grep -q '"stage": 0' "$LOGS/daemon-a.log" \
  || { echo "HARNESS ERROR: daemon a is not the head — the planner ordered the pool differently"; exit 1; }
LEFT=$(grep -c "coordinator kept dying" "$LOGS/daemon-a.log" || true)
DEGRADED=$(grep -c "relaunching EAGLE-off" "$LOGS/daemon-a.log" || true)
# `|| true`: under pipefail an empty grep would kill the script before it can report the failure
EAGLES=$(grep "SHIM_COORD_EAGLE" "$LOGS/daemon-a.log" | grep -o 'true\|false' | tr '\n' ',' || true)
echo "== head: released-the-swarm=$LEFT  eagle-degraded=$DEGRADED  EAGLE arms=${EAGLES:-none}"
grep -E "could not connect the ring yet|holding the coordinator|ring READY \(all stages\)" "$LOGS/daemon-a.log" | head -5 || true
grep -E "SERVED|READY — all " "$LOGS/sim.log" | tail -4 || true

# the head must still be in the swarm, un-degraded, and the ring must actually serve
if [ "$RC" -eq 0 ] && [ "$LEFT" -eq 0 ] && [ "$DEGRADED" -eq 0 ] && [ "$EAGLES" = "true," ]; then
  echo "SLOW-TAIL RESULT: PASS"; exit 0
else
  echo "SLOW-TAIL RESULT: FAIL (rc=$RC, left=$LEFT, degraded=$DEGRADED, eagles=${EAGLES:-none})"; exit 1
fi
