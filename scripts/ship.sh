#!/bin/bash
# Day-to-day release: tests, database changes, live database check, publish, then tell everyone.
# Usage: bash scripts/ship.sh ["a short line about what is new"]
#        NOTIFY=0 bash scripts/ship.sh      publish quietly, no notification
set -u
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
clean() { sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g'; }
echo "== tests"; npm test 2>&1 | clean | grep -E "Tests|FAIL"
echo "== build"; npm run build 2>&1 | clean | tail -1
echo "== database"; bash scripts/db-push.sh | tail -3
echo "== live database check"; bash scripts/check-cloud.sh | clean | grep -E "Tests|FAIL|Error|cleaned|expected|received" | head -12
# Vercel builds its own copy, so its build stamp is not the local one: remember the stamp being served now,
# and after publishing wait for it to change.
APP=$(tr -d ' \n\r' < .secrets/app-url 2>/dev/null); APP=${APP%/}
stamp() { curl -s -m 10 "$APP/version.json?t=$(date +%s)" | grep -o '"build":"[^"]*"'; }
BEFORE=$(stamp)
echo "== publish"; vercel deploy --prod --yes < /dev/null 2>&1 | clean | grep -E "Production|Error|error" | tail -2
echo "== tell everyone"
if [ "${NOTIFY:-1}" != "1" ]; then
  echo "skipped (NOTIFY=0)"
else
  # Only notify once the new build is really the one being served.
  LIVE=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    LIVE=$(stamp)
    [ -n "$LIVE" ] && [ "$LIVE" != "$BEFORE" ] && break
    sleep 3
  done
  if [ -n "$LIVE" ] && [ "$LIVE" != "$BEFORE" ]; then
    bash scripts/notify-update.sh "${1:-}"
  else
    echo "not notified: the new build is not live (publish failed, or still rolling out). To send it later: bash scripts/notify-update.sh"
  fi
fi
echo "== done"
