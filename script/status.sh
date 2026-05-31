#!/usr/bin/env bash
# Report whether the wordcloud server is running and healthy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.server.pid"

# Derive host/port from config.json (fall back to defaults) for the health probe.
# `|| true` keeps `set -e` happy if read hits EOF without a trailing newline.
read -r HOST PORT < <(node -e '
  import("./src/config.mjs").then(async ({ loadConfig }) => {
    const c = await loadConfig();
    console.log(`${c.server.host} ${c.server.port}`);
  }).catch(() => console.log("127.0.0.1 3000"));
') || true
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

RUNNING=0
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  RUNNING=1
  echo "Process: running (PID $(cat "$PID_FILE"))"
else
  echo "Process: not running"
fi

URL="http://${HOST}:${PORT}/healthz"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "$URL" >/dev/null 2>&1; then
    echo "Health:  OK ($URL)"
  else
    echo "Health:  unreachable ($URL)"
  fi
fi

[ "$RUNNING" -eq 1 ]
