#!/usr/bin/env bash
# Start the wordcloud server in the background, recording its PID and logs.
# If the configured port is already taken, log which process holds it and abort.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.server.pid"
LOG_FILE="$ROOT/server.log"

# Timestamped line to both the console and the log file.
log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  echo "$line"
  echo "$line" >>"$LOG_FILE"
}

# Derive host/port from config.json (fall back to defaults).
read -r HOST PORT < <(node -e '
  import("./src/config.mjs").then(async ({ loadConfig }) => {
    const c = await loadConfig();
    console.log(`${c.server.host} ${c.server.port}`);
  }).catch(() => console.log("127.0.0.1 3000"));
') || true
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

# Print whatever is listening on $PORT, using whichever tool is available.
who_owns_port() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$PORT" 2>/dev/null | grep -q ":$PORT" \
      && ss -ltnp "sport = :$PORT" 2>/dev/null | sed '1d'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null
  fi
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$PORT" 2>/dev/null | grep -q ":$PORT"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1  # no tool available; let the server itself report the bind error
  fi
}

# Already running under our own PID file?
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Server already running (PID $(cat "$PID_FILE")). Use script/stop.sh first." >&2
  exit 1
fi

# Port taken by something else (stale instance, another app)?
if port_in_use; then
  log "ERROR: cannot start — port $PORT (host $HOST) is already in use by:"
  who_owns_port | while IFS= read -r l; do log "    $l"; done
  log "Free the port or change server.port in config.json, then retry."
  exit 1
fi

log "==> Starting wordcloud server on http://${HOST}:${PORT} ..."
nohup node src/index.mjs >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  log "    Started (PID $(cat "$PID_FILE")). Logs: $LOG_FILE"
else
  rm -f "$PID_FILE"
  # The most common silent failure is a port grabbed between our check and bind.
  if port_in_use; then
    log "ERROR: server exited — port $PORT is now held by:"
    who_owns_port | while IFS= read -r l; do log "    $l"; done
  else
    log "ERROR: server failed to start. Last log lines:"
    tail -n 15 "$LOG_FILE" | while IFS= read -r l; do log "    $l"; done
  fi
  exit 1
fi
