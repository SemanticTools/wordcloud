#!/usr/bin/env bash
# Train the common-words stopword list from random Wikipedia articles.
# Any extra args are passed through (e.g. --count 100 --threshold 0.25).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Training common-words list (this downloads Wikipedia articles)..."
node src/train.mjs "$@"
echo "==> Done. Restart the server (script/restart.sh) to load the new list."
