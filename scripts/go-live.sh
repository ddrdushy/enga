#!/bin/bash
# Everything after the code is ready: publish, set up notifications, publish again with the
# notification key, start the reminder job, and write the invite link.
# Usage: bash scripts/go-live.sh <project-ref>
set -u
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
REF="${1:?usage: go-live.sh <project-ref>}"
clean() { sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g'; }

echo "== tests and build"
npm test 2>&1 | clean | grep -E "Tests|failed" 
npm run build 2>&1 | clean | tail -2

echo "== first publish"
vercel deploy --prod --yes < /dev/null > .secrets/deploy1.log 2>&1
APP=$(vercel inspect "$(grep -Eo 'https://[a-z0-9.-]+\.vercel\.app' .secrets/deploy1.log | tail -1)" 2>&1 | clean | grep -Eo 'https://enga[a-z0-9-]*\.vercel\.app' | awk '{ print length, $0 }' | sort -n | head -1 | cut -d' ' -f2)
[ -n "$APP" ] || APP=$(grep -Eo 'https://[a-z0-9.-]+\.vercel\.app' .secrets/deploy1.log | tail -1)
echo "app address: $APP"
echo "$APP" > .secrets/app-url

echo "== notification keys"
bash scripts/setup-push.sh "$REF" "$APP" | clean | tail -9

echo "== second publish (with the notification key)"
vercel deploy --prod --yes < /dev/null > .secrets/deploy2.log 2>&1
clean < .secrets/deploy2.log | grep -E "Production|Error|error" | tail -3

echo "== reminder job"
bash scripts/schedule-morning.sh "$APP"

echo "== reminder function answers"
curl -s -o .secrets/dry.json -w "status %{http_code}\n" -X POST -H "Authorization: Bearer $(cat .secrets/cron-secret)" "$APP/api/morning?mode=dry"
head -c 400 .secrets/dry.json; echo
curl -s -o /dev/null -w "without the secret: status %{http_code}\n" -X POST "$APP/api/morning?mode=dry"

echo "== invite link"
printf 'Send this link to your friends, and open it yourself the first time:\n\n%s/?c=%s\n\nAfter that the plain address works: %s\n' "$APP" "$(cat .secrets/circle-code)" "$APP" > INVITE-LINK.txt
echo "wrote INVITE-LINK.txt"
echo "== done"
