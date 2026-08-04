#!/bin/bash
# E2E sada portálu — spouštět proti lokálnímu wrangler dev.
# Před spuštěním: npx wrangler pages dev . --port 8788
# Jiný port nebo adresu si sada vezme z MTF_BASE, testy čtou tutéž proměnnou.
# Playwright se bere z voice-browser projektu (portál nemá node_modules,
# package.json by se deployoval a middleware ho blokuje).
set -e
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$HOME/Projects/voice-browser/node_modules}"
export MTF_BASE="${MTF_BASE:-http://localhost:8788}"

if ! curl -s -o /dev/null "$MTF_BASE/"; then
  echo "CHYBA: server neběží na $MTF_BASE. Spusťte: npx wrangler pages dev . --port 8788"
  exit 1
fi

FAILED=0
for t in e2e-portal e2e-mereni e2e-offline e2e-magic e2e-push e2e-quiet e2e-slovnicek api-attendees google-forms-attendees privacy-public-data e2e-sraz; do
  echo "===== $t ====="
  node "$t.js" || FAILED=1
done
exit $FAILED
