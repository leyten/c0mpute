#!/usr/bin/env bash
# P11 restart-degraded PROOF (no GPU, no spend): TWO REAL --mode shard daemons against the sim
# orchestrator form a 2-stage ring (a=head+coordinator, b=tail), launched with M25_EAGLE=1 so the
# FIRST coordinator arms EAGLE. Serve #1 is clean. Then a STALL request makes the shim coordinator
# emit the L3 stall-watchdog FATAL and hard-exit — the wedge signature. The daemon must relaunch
# the coordinator with M25_EAGLE=0 (the proven plain ring) and serve #2. Green iff coordinator #1
# EAGLE=on, coordinator #2 EAGLE=off (asserted from the HEAD daemon's SHIM_COORD_EAGLE lines) and
# request #2 served. (leg-8 serving needs head != tail — a 1-node ring dials its return to self.)
#
#   From the repo root:   bash scripts/p11-restart-test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="$REPO_ROOT/c0mpute-worker"
PORT="${PORT:-3931}"
LOGS="$(mktemp -d /tmp/p11-proof.XXXXXX)"
SHIM="$REPO_ROOT/scripts/shard-python-shim.py"

if [ ! -f "$WORKER/dist/index.js" ]; then (cd "$WORKER" && npm run build); fi

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill -9 -- "-$p" 2>/dev/null || true; done
  rm -rf /root/.c0mpute-p11a /root/.c0mpute-p11b
  echo "logs kept at $LOGS"
}
trap cleanup EXIT INT TERM
rm -rf /root/.c0mpute-p11a /root/.c0mpute-p11b

echo "== sim orchestrator :$PORT (2-stage ring, serve+p11)"
setsid npx tsx "$REPO_ROOT/scripts/shard-daemon-sim.ts" --nodes 2 --stages 2 --layers 1 \
  --p11 --once --accept-receipts --port "$PORT" > "$LOGS/sim.log" 2>&1 &
SIM_PID=$!; PIDS+=($SIM_PID)
for i in $(seq 1 40); do grep -q "mock orchestrator up" "$LOGS/sim.log" && break; sleep 0.5; done

start_daemon() {  # $1 = letter, $2 = port base
  setsid env \
    C0MPUTE_SHARD_HOME="/root/.c0mpute-p11$1" \
    C0MPUTE_SHARD_PORT_BASE="$2" \
    C0MPUTE_SHARD_PYTHON="$SHIM" \
    C0MPUTE_SHARD_REPO="${SHARD_REPO_PATH:-/root/.openclaw/workspace/shard}" \
    C0MPUTE_SIDECAR_BIN="${C0MPUTE_SIDECAR_BIN:-/root/.c0mpute/bin/sidecar}" \
    C0MPUTE_SHARD_MANIFEST_PUBKEY=sim-publisher-pin \
    M25_EAGLE=1 \
    node "$WORKER/dist/index.js" --mode shard --token cwt_sim --url "http://127.0.0.1:$PORT" \
    > "$LOGS/daemon-$1.log" 2>&1 &
  echo $!
}
admitted() { grep -c "admitted" "$LOGS/sim.log" 2>/dev/null || true; }

echo "== daemon a (head + coordinator — the stall victim)"; A=$(start_daemon a 29760); PIDS+=($A)
for i in $(seq 1 120); do [ "$(admitted)" -ge 1 ] && break; sleep 1; done
echo "== daemon b (tail)"; B=$(start_daemon b 29780); PIDS+=($B)

echo "== waiting for the verdict"
set +e; wait "$SIM_PID"; RC=$?; set -e

echo; echo "== HEAD coordinator EAGLE arms across the restart:"
grep "SHIM_COORD_EAGLE" "$LOGS/daemon-a.log" || true
echo "== relaunch line:"; grep -E "relaunching EAGLE-off|EAGLE-off\)" "$LOGS/daemon-a.log" | head -2 || true
echo; grep -E "P11_STALL_NOW|P11_STALL_TRIGGERED|P11_PROOF|SERVED" "$LOGS/sim.log" | tail -8

# one SHIM_COORD_EAGLE per coordinator launch — the sequence must be exactly on-then-off
EAGLES=$(grep "SHIM_COORD_EAGLE" "$LOGS/daemon-a.log" | grep -o 'true\|false' | tr '\n' ',')
echo "== HEAD EAGLE sequence (one per coordinator launch): $EAGLES"
if [ "$RC" -eq 0 ] && [ "$EAGLES" = "true,false," ]; then
  echo "P11 RESULT: PASS"; exit 0
else
  echo "P11 RESULT: FAIL (rc=$RC, eagles=$EAGLES)"; exit 1
fi
