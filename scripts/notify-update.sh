#!/bin/bash
# Tell everyone with notifications on that a new version is live.
# Usage: bash scripts/notify-update.sh ["a short line about what is new"]
# ship.sh runs this after publishing; run it by hand only to repeat the notice.
set -u
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
APP=$(tr -d ' \n\r' < .secrets/app-url 2>/dev/null); APP=${APP%/}
[ -n "$APP" ] || { echo "no app address in .secrets/app-url"; exit 1; }
[ -s .secrets/cron-secret ] || { echo "no job secret in .secrets/cron-secret"; exit 1; }
BODY=$(node -e 'process.stdout.write(JSON.stringify({ note: process.argv[1] || "" }))' "${1:-}")
# The secret goes straight from the file into the request header; it is never printed.
curl -s -m 30 -X POST "$APP/api/update" -H "Authorization: Bearer $(cat .secrets/cron-secret)" -H 'Content-Type: application/json' --data "$BODY" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);console.log(r.ok?`notified: ${r.delivered} of ${r.devices} phone(s)`+(r.removed?`, ${r.removed} old phone(s) removed`:"")+(r.devices?"":" (nobody has turned notifications on yet)"):`notify failed: ${r.error}`)}catch{console.log("notify failed: no answer from the app")}})'
