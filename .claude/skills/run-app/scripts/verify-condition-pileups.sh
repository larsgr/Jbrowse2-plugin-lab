#!/usr/bin/env bash
# End-to-end check of ConditionPileupPlugin: chromatin states, stranded RNA-seq
# and ChIP-seq condition pile-ups against the live Aqua-Faang data.
#
#   .claude/skills/run-app/scripts/verify-condition-pileups.sh [screenshot-dir]
#
# Starts the dev server, opens the prototype locus from the plugin guide,
# checks tooltips against the BigBed/BigWig files read independently in node,
# expands/collapses, switches the row scale, zooms out, then stops the server.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
PORT=5173
APP_URL="http://localhost:${PORT}/Jbrowse2-plugin-lab/"
SHOTS="${1:-${TMPDIR:-/tmp}/pileup-shots}"
PW_DIR="${PLAYWRIGHT_HOME:-${TMPDIR:-/tmp}/jbrowse-lab-playwright}"

stop_server() { lsof -ti:${PORT} -sTCP:LISTEN 2>/dev/null | xargs -r kill; }
stop_server
trap stop_server EXIT

cd "$REPO_ROOT"

if [ ! -d node_modules ]; then
  echo "==> npm install (--legacy-peer-deps is required here)"
  npm install --legacy-peer-deps >/dev/null || { echo "npm install failed"; exit 1; }
fi

if [ ! -d "$PW_DIR/node_modules/playwright" ]; then
  echo "==> installing playwright into $PW_DIR"
  mkdir -p "$PW_DIR"
  ( cd "$PW_DIR" && npm init -y >/dev/null 2>&1 && npm install playwright >/dev/null 2>&1 ) \
    || { echo "playwright install failed"; exit 1; }
fi

echo "==> starting dev server"
npm run dev >"${PW_DIR}/vite.log" 2>&1 &
if ! timeout 60 bash -c "until curl -sf '$APP_URL' >/dev/null; do sleep 1; done"; then
  echo "dev server never came up; last log lines:"; tail -20 "${PW_DIR}/vite.log"; exit 1
fi

echo "==> driving the condition pile-up tracks"
# Run from the playwright dir so node resolves 'playwright' there; the driver
# reads the data files itself through the repo's own @gmod/bbi.
cp "$SCRIPT_DIR/verify-condition-pileups.mjs" "$PW_DIR/verify-condition-pileups.mjs"
URL="$APP_URL" SHOTS="$SHOTS" REPO_ROOT="$REPO_ROOT" node "$PW_DIR/verify-condition-pileups.mjs"
STATUS=$?

echo "==> screenshots in $SHOTS"
exit $STATUS
