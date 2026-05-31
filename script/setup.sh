#!/usr/bin/env bash
# Set up the project: verify Node, install dependencies, confirm config exists.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Checking Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not on PATH." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node 18+ is required (found $(node --version))." >&2
  exit 1
fi
echo "    Node $(node --version) OK"

echo "==> Installing dependencies..."
npm install

if [ ! -f config.json ]; then
  echo "WARNING: config.json not found; the server will run on built-in defaults." >&2
else
  echo "    config.json present"
fi

echo "==> Setup complete. Start the server with: script/start.sh"
