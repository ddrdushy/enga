#!/bin/bash
# One-time setup for the morning notification.
# Usage: bash scripts/setup-push.sh <project-ref> <https://app-domain>
# Generates the web-push key pair and the job secret on this machine (kept in .secrets/, never printed),
# stores them in Vercel, and adds the public key to .env.local for the client build.
set -u
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
REF="${1:?usage: setup-push.sh <project-ref> <https://app-domain>}"
APP="${2:?usage: setup-push.sh <project-ref> <https://app-domain>}"

if [ ! -s .secrets/vapid.json ]; then
  npx --yes web-push generate-vapid-keys --json > .secrets/vapid.json 2> /dev/null
  chmod 600 .secrets/vapid.json
fi
if [ ! -s .secrets/cron-secret ]; then
  openssl rand -hex 32 > .secrets/cron-secret
  chmod 600 .secrets/cron-secret
fi
supabase projects api-keys --project-ref "$REF" --reveal -o json < /dev/null 2> /dev/null > .secrets/api-keys-full.json
chmod 600 .secrets/api-keys-full.json

PUBLIC=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".secrets/vapid.json","utf8")).publicKey)')
PRIVATE=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".secrets/vapid.json","utf8")).privateKey)')
SERVICE=$(node -e '
const keys = JSON.parse(require("fs").readFileSync(".secrets/api-keys-full.json","utf8"));
const k = keys.find((x) => x.name === "service_role") || keys.find((x) => x.type === "secret");
console.log(k ? k.api_key : "");')
[ -n "$PUBLIC" ] && [ -n "$PRIVATE" ] && [ -n "$SERVICE" ] || { echo "could not prepare keys"; exit 1; }

put() { # name value target…
  local name="$1" value="$2"; shift 2
  for target in "$@"; do
    printf '%s' "$value" | vercel env add "$name" "$target" --force > /dev/null 2>&1 && echo "set $name ($target)" || echo "FAILED $name ($target)"
  done
}
put SUPABASE_URL "https://$REF.supabase.co" production
put SUPABASE_SERVICE_ROLE_KEY "$SERVICE" production
put VAPID_PUBLIC_KEY "$PUBLIC" production
put VAPID_PRIVATE_KEY "$PRIVATE" production
put VAPID_SUBJECT "$APP" production
put CRON_SECRET "$(cat .secrets/cron-secret)" production
put VITE_VAPID_PUBLIC_KEY "$PUBLIC" production preview

grep -v '^VITE_VAPID_PUBLIC_KEY=' .env.local > .env.local.tmp 2> /dev/null; mv .env.local.tmp .env.local
echo "VITE_VAPID_PUBLIC_KEY=$PUBLIC" >> .env.local
echo "== done"
