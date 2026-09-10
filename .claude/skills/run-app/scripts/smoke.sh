#!/usr/bin/env bash
# End-to-end visual smoke test for the JBrowse2 Plugin Lab.
# Installs playwright if needed, starts the Vite dev server, drives all three
# plugins in headless Chromium, screenshots each step, then stops the server.
#
#   .claude/skills/run-app/scripts/smoke.sh [screenshot-dir]
#
# Exits non-zero if any step fails. Screenshot dir is printed at the end.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
PORT=5173
APP_URL="http://localhost:${PORT}/Jbrowse2-plugin-lab/"
SHOTS="${1:-${TMPDIR:-/tmp}/jbrowse-lab-shots}"
# Playwright is deliberately not a project dependency - keep it out of the repo.
PW_DIR="${PLAYWRIGHT_HOME:-${TMPDIR:-/tmp}/jbrowse-lab-playwright}"

stop_server() { lsof -ti:${PORT} -sTCP:LISTEN 2>/dev/null | xargs -r kill; }
# Free the port up front too: npm does not forward SIGTERM to the vite process
# it spawns, so a previous run can leave a listener behind and cause EADDRINUSE.
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

echo "==> driving the app"
# Run the driver from the playwright dir so node resolves 'playwright' there.
cp "$SCRIPT_DIR/drive.mjs" "$PW_DIR/drive.mjs"
URL="$APP_URL" SHOTS="$SHOTS" node "$PW_DIR/drive.mjs"
STATUS=$?

echo "==> stopping dev server"
exit $STATUS
