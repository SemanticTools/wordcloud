#!/usr/bin/env bash
# Stop the running wordcloud server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No PID file found; server does not appear to be running."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  echo "==> Stopping server (PID $PID)..."
  kill "$PID"
  for _ in $(seq 1 10); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$PID" 2>/dev/null; then
    echo "    Did not stop gracefully; sending SIGKILL."
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "    Stopped."
else
  echo "Server (PID $PID) was not running."
fi

rm -f "$PID_FILE"
