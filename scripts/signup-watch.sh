#!/usr/bin/env bash
# Polls the profiles table and pings Telegram when a new signup appears.
# Config via env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (required),
# TELEGRAM_THREAD_ID (optional; omit for chats without forum topics),
# SIGNUP_WATCH_DB / SIGNUP_WATCH_STATE (default: repo-relative paths below).
# Detached one-off for the public test launch; kill via the PID in signup-watch.pid.
set -u

DB="${SIGNUP_WATCH_DB:-data/c0mpute.db}"
STATE="${SIGNUP_WATCH_STATE:-scripts/.signup-watch.baseline}"
TOKEN="${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
CHAT_ID="${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID is required}"
THREAD_ID="${TELEGRAM_THREAD_ID:-}"

send() {
  local args=(--data-urlencode "chat_id=${CHAT_ID}")
  [ -n "$THREAD_ID" ] && args+=(--data-urlencode "message_thread_id=${THREAD_ID}")
  args+=(--data-urlencode "text=$1")
  curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" "${args[@]}" >/dev/null
}

count() { sqlite3 "$DB" "SELECT COUNT(*) FROM profiles;" 2>/dev/null; }

if [ -f "$STATE" ]; then BASE="$(cat "$STATE")"; else BASE="$(count)"; echo "$BASE" > "$STATE"; fi

while true; do
  NOW="$(count)"
  if [ -n "$NOW" ] && [ "$NOW" -gt "$BASE" ] 2>/dev/null; then
    N=$((NOW - BASE))
    ROWS="$(sqlite3 "$DB" "SELECT COALESCE(NULLIF(x_username,''), 'no-X '||substr(privy_id,-6)) FROM profiles ORDER BY created_at DESC LIMIT ${N};" 2>/dev/null | paste -sd ', ')"
    send "New c0mpute signup! +${N} (total ${NOW}). ${ROWS}"
    BASE="$NOW"; echo "$BASE" > "$STATE"
  fi
  sleep 30
done
