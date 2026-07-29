#!/usr/bin/env bash
# P0-#6 churn-survival PROOF, sim half (no GPU, no spend): three REAL --mode shard daemons
# against the sim orchestrator form a 2-stage ring with one FREE spare; request 1 serves; the
# TAIL daemon is SIGKILLed (a crash, not a goodbye); the network must notice (onNodeGone), free
# the ring, RE-FORM from the spare ON ITS OWN, and serve request 2. Sim exits 0 only on
# "CHURN_PROOF COMPLETE" — a network that needs fresh supply to recover times out red.
#
#   From the repo root:   bash scripts/churn-proof.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="$REPO_ROOT/c0mpute-worker"
PORT="${PORT:-3921}"
LOGS="$(mktemp -d /tmp/churn-proof.XXXXXX)"
SHIM="$REPO_ROOT/scripts/shard-python-shim.py"

if [ ! -f "$WORKER/dist/index.js" ]; then (cd "$WORKER" && npm run build); fi

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill -9 -- "-$p" 2>/dev/null || true; done   # whole process groups
  rm -rf /root/.c0mpute-churn-a /root/.c0mpute-churn-b /root/.c0mpute-churn-c
  echo "logs kept at $LOGS"
}
trap cleanup EXIT INT TERM
rm -rf /root/.c0mpute-churn-a /root/.c0mpute-churn-b /root/.c0mpute-churn-c

echo "== sim orchestrator :$PORT (3 nodes, 2-stage ring + 1 spare, churn mode)"
setsid npx tsx "$REPO_ROOT/scripts/shard-daemon-sim.ts" --nodes 3 --stages 2 --layers 1 \
  --churn --once --accept-receipts --port "$PORT" > "$LOGS/sim.log" 2>&1 &
SIM_PID=$!
PIDS+=($SIM_PID)
for i in $(seq 1 40); do grep -q "mock orchestrator up" "$LOGS/sim.log" && break; sleep 0.5; done

start_daemon() {  # $1 = letter, $2 = port base
  setsid env \
    C0MPUTE_SHARD_HOME="/root/.c0mpute-churn-$1" \
    C0MPUTE_SHARD_PORT_BASE="$2" \
    C0MPUTE_SHARD_PYTHON="$SHIM" \
    C0MPUTE_SHARD_REPO="${SHARD_REPO_PATH:-/root/.openclaw/workspace/shard}" \
    ${C0MPUTE_SIDECAR_BIN:+"C0MPUTE_SIDECAR_BIN=$C0MPUTE_SIDECAR_BIN"} \
    C0MPUTE_SHARD_MANIFEST_PUBKEY=sim-publisher-pin \
    node "$WORKER/dist/index.js" --mode shard --token cwt_sim --url "http://127.0.0.1:$PORT" \
    > "$LOGS/daemon-$1.log" 2>&1 &
  echo $!
}

# staggered starts gated on the sim's admit count -> deterministic ring order (a=head, b=tail, c=spare)
admitted() { grep -c "admitted" "$LOGS/sim.log" 2>/dev/null || true; }
echo "== daemon a (head)"; A_PID=$(start_daemon a 29700); PIDS+=($A_PID)
for i in $(seq 1 120); do [ "$(admitted)" -ge 1 ] && break; sleep 1; done
echo "== daemon b (tail — the churn victim)"; B_PID=$(start_daemon b 29720); PIDS+=($B_PID)
for i in $(seq 1 120); do [ "$(admitted)" -ge 2 ] && break; sleep 1; done
echo "== daemon c (the free spare)"; C_PID=$(start_daemon c 29740); PIDS+=($C_PID)

echo "== waiting for request 1 + CHURN_NOW (sim drives)"
for i in $(seq 1 240); do
  grep -q "CHURN_NOW" "$LOGS/sim.log" && break
  kill -0 "$SIM_PID" 2>/dev/null || { echo "sim died early"; tail -20 "$LOGS/sim.log"; exit 1; }
  sleep 1
done
grep -q "CHURN_NOW" "$LOGS/sim.log" || { echo "request 1 never served"; tail -20 "$LOGS/sim.log"; exit 1; }

echo "== SIGKILL the tail daemon (pgid $B_PID) — a crash, not a goodbye"
kill -9 -- "-$B_PID" 2>/dev/null || true

echo "== waiting for the verdict (re-form + request 2)"
set +e
wait "$SIM_PID"; RC=$?
set -e
echo; grep -E "CHURN_NOW|CHURN_PROOF|DEGRADED|auto-formed|SERVED|READY — all" "$LOGS/sim.log" | tail -12
exit $RC
