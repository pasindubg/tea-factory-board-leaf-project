#!/bin/bash
# Tea Factory Ops — start the web dev server.
# Double-click to launch, or run from terminal: ./start.sh

set -e
cd "$(dirname "$0")"

# Node 20.20.2 via nvm + pnpm global
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$HOME/.npm-global/bin:$PATH"

echo "==> Installing dependencies (if needed)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "==> Starting web dev server on http://localhost:3000 ..."
pnpm --dir apps/web dev
