#!/usr/bin/env bash
# Refuse to run staging on an env file that could reach production.
#
#   staging-env-check.sh [staging-env] [production-env]
#
# Run by scripts/deploy-staging.sh before every build and by both staging units
# (ExecStartPre) before every start, so a hand edit plus a restart is caught too.
# The units call an installed copy (/srv/c0mpute/staging-env-check.sh) rather
# than the one in the staging tree, so deploying an old ref can't drop the check.
#
# The file must be strict KEY=value lines: Next's dotenv loader and the
# orchestrator's server/load-env.ts disagree on `export`, quotes, spaces, inline
# comments and duplicate keys (dotenv keeps the last value, load-env the first),
# so anything they could read differently is rejected rather than interpreted.
# Every key must be on the allowlist below, and no secret may equal production's.
set -euo pipefail

ENVFILE="${1:-/srv/c0mpute/staging.env}"
PRODENV="${2:-/root/.openclaw/workspace/c0mpute/.env.local}"

fail() { echo "[staging-env] FATAL: $*" >&2; exit 1; }
[ -r "$ENVFILE" ] || fail "cannot read $ENVFILE"

ALLOWED=" C0MPUTE_STAGING NEXT_PUBLIC_SOCKET_URL INTERNAL_ORCHESTRATOR_URL ALLOWED_ORIGINS
  INTERNAL_API_SECRET ADMIN_SECRET NODE_BIND_SECRET ANON_TOKEN_SECRET DEPOSIT_WALLET_KEY
  SOLANA_RPC_URL SOLANA_RPC_FALLBACKS NEXT_PUBLIC_ONCHAIN_RPC NEXT_PUBLIC_SOLANA_CHAIN
  NSFW_CLASSIFIER_URL COMFY_URL SHARD_REPO SHARD_REPO_PATH
  NEXT_PUBLIC_PRIVY_APP_ID PRIVY_APP_SECRET
  VIDEO_WORKFLOW_PATH VIDEO_WORKFLOW_PATH_ADULT VIDEO_CREDITS VIDEO_JOB_TIMEOUT_MS VIDEO_HELD_MAX_MB
  STAKER_ALLOWANCE_ENABLED STAKER_ALLOWANCE_ALLOWLIST STAKER_ALLOWANCE_DAILY_POOL_CREDITS
  FREE_SUBSIDY_DAILY_CAP_USD BRAND_DEFAULT C0MPUTE_RETIRE_LEGACY_WORKERS "
ALLOWED=" $(echo $ALLOWED) "
# Product flags that are meant to match production. Everything else that also
# appears in the production env must differ from it.
SHARED_FLAGS=" STAKER_ALLOWANCE_ENABLED STAKER_ALLOWANCE_ALLOWLIST STAKER_ALLOWANCE_DAILY_POOL_CREDITS
  FREE_SUBSIDY_DAILY_CAP_USD BRAND_DEFAULT C0MPUTE_RETIRE_LEGACY_WORKERS "
SHARED_FLAGS=" $(echo $SHARED_FLAGS) "

declare -A VAL
n=0
while IFS= read -r line || [ -n "$line" ]; do
  n=$((n + 1))
  case "$line" in ''|'#'*) continue ;; esac
  [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=([^\"\'\`#[:space:]][^#]*)?$ ]] ||
    fail "line $n is not a strict KEY=value line (no export, spaces, quotes or inline #)"
  key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]:-}"
  [[ "$val" =~ [[:space:]]$ || "$line" == *$'\r' ]] && fail "line $n ($key) has trailing whitespace"
  [ -z "${VAL[$key]+x}" ] || fail "$key is set twice"
  [[ "$ALLOWED" == *" $key "* ]] || fail "$key is not on the staging allowlist"
  VAL[$key]="$val"
done < "$ENVFILE"

want() { [ "${VAL[$1]:-}" = "$2" ] || fail "$1 must be exactly $2"; }
want C0MPUTE_STAGING 1
want SOLANA_RPC_URL https://api.devnet.solana.com
want SOLANA_RPC_FALLBACKS https://api.devnet.solana.com
want INTERNAL_ORCHESTRATOR_URL http://127.0.0.1:3014
want NEXT_PUBLIC_SOCKET_URL https://staging.compute.tech
want NEXT_PUBLIC_ONCHAIN_RPC https://staging.compute.tech/api/rpc
want NEXT_PUBLIC_SOLANA_CHAIN solana:devnet
# Unset, these fall back to defaults that are public or shared with production.
for k in INTERNAL_API_SECRET ADMIN_SECRET NODE_BIND_SECRET ANON_TOKEN_SECRET DEPOSIT_WALLET_KEY; do
  [ -n "${VAL[$k]:-}" ] || fail "$k must be set"
done

if [ -r "$PRODENV" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"; val="${BASH_REMATCH[3]%$'\r'}"
    val="${val#[\"\']}"; val="${val%[\"\']}"
    [ -n "$val" ] && [ -n "${VAL[$key]+x}" ] || continue
    [[ "$SHARED_FLAGS" == *" $key "* ]] && continue
    [ "${VAL[$key]}" != "$val" ] || fail "$key equals the production value"
  done < "$PRODENV"
  # A production secret must not reappear under a different staging key either.
  for k in "${!VAL[@]}"; do
    [[ "$SHARED_FLAGS" == *" $k "* ]] && continue
    [ ${#VAL[$k]} -ge 16 ] || continue
    grep -qF -- "${VAL[$k]}" "$PRODENV" && fail "$k's value appears in the production env"
  done
else
  echo "[staging-env] WARNING: cannot read $PRODENV; skipped the production comparison" >&2
fi

echo "[staging-env] $ENVFILE OK (${#VAL[@]} keys)"
