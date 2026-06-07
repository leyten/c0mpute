#!/usr/bin/env bash
# Polls the profiles table and pings Telegram when a new signup appears.
# Detached one-off for the public test launch; kill via the PID in signup-watch.pid.
set -u

DB="/root/.openclaw/workspace/c0mpute/data/c0mpute.db"
ENV_FILE="/root/.claude/channels/telegram/.env"
CHAT_ID="1608487611"
THREAD_ID="171187"
STATE="/root/.openclaw/workspace/c0mpute/scripts/.signup-watch.baseline"

TOKEN="$(grep -oE 'TELEGRAM_BOT_TOKEN=.*' "$ENV_FILE" | cut -d= -f2-)"

send() {
  curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "message_thread_id=${THREAD_ID}" \
    --data-urlencode "text=$1" >/dev/null
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
