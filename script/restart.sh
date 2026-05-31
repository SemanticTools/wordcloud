#!/usr/bin/env bash
# Restart the wordcloud server: stop it (if running), then start it again.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Restarting wordcloud server..."
bash "$DIR/stop.sh"
bash "$DIR/start.sh"
