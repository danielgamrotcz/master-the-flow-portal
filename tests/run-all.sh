#!/bin/bash
# E2E sada portálu — spouštět proti lokálnímu wrangler dev.
# Před spuštěním: npx wrangler pages dev . --port 8788
# Playwright se bere z voice-browser projektu (portál nemá node_modules,
# package.json by se deployoval a middleware ho blokuje).
set -e
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$HOME/Projects/voice-browser/node_modules}"

if ! curl -s -o /dev/null http://localhost:8788/; then
  echo "CHYBA: wrangler dev neběží na :8788. Spusťte: npx wrangler pages dev . --port 8788"
  exit 1
fi

FAILED=0
for t in e2e-portal e2e-mereni e2e-offline e2e-magic e2e-push e2e-quiet e2e-slovnicek; do
  echo "===== $t ====="
  node "$t.js" || FAILED=1
done
exit $FAILED
