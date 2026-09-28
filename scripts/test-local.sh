#!/usr/bin/env bash
set -euo pipefail
export CAPTURE_API_KEY=ci-only-key CAPTURE_WORKER_API_KEY=ci-only-key
export CAPTURE_WORKER_URL=http://127.0.0.1:8787
export CHROMIUM_NO_SANDBOX=true
export TEST_APP_URL=http://127.0.0.1:3100
mkdir -p artifacts
(cd worker && HOST=127.0.0.1 PORT=8787 node dist/worker/src/server.js) >artifacts/worker-test.log 2>&1 &
worker_pid=$!
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3100 >artifacts/web-test.log 2>&1 &
web_pid=$!
trap 'kill "$worker_pid" "$web_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
  if curl --noproxy '*' -fsS http://127.0.0.1:3100/api/capabilities >/dev/null; then break; fi
  sleep 0.5
done
node scripts/ui-check.mjs
