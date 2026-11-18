#!/bin/bash
# One-time Supabase setup for enga?
# Usage: bash scripts/setup-supabase.sh <project-ref>
# Secrets are generated on this machine and kept in .secrets/ (git-ignored). Nothing secret is printed.
set -u
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
REF="${1:?usage: setup-supabase.sh <project-ref>}"
[ -s .secrets/db-password ] || { echo "missing .secrets/db-password"; exit 1; }
PW="$(cat .secrets/db-password)"
MEMBERS="${VITE_MEMBERS:-Dushy,Ali,Kiru}"
DOMAIN="${VITE_AUTH_DOMAIN:-enga.app}"

# Circle code: six easy-to-type characters, shared once with each friend.
if [ ! -s .secrets/circle-code ]; then
  LC_ALL=C tr -dc 'a-hj-km-np-z2-9' < /dev/urandom | head -c 6 > .secrets/circle-code
  chmod 600 .secrets/circle-code
fi
CODE="$(cat .secrets/circle-code)"
EMAILS=$(echo "$MEMBERS" | tr ',' '\n' | tr 'A-Z' 'a-z' | LC_ALL=C tr -cd 'a-z0-9\n' | sed "s/$/@$DOMAIN/" | paste -sd, -)

cat > supabase/migrations/0099_local_settings.sql <<SQL
insert into private.settings (key, value)
values ('invite_code', '$CODE'), ('allowed_emails', '$EMAILS')
on conflict (key) do update set value = excluded.value;
SQL

echo "== link"
supabase link --project-ref "$REF" -p "$PW" < /dev/null 2>&1 | grep -vi password | tail -4
echo "== db push"
supabase db push -p "$PW" --include-all --yes < /dev/null 2>&1 | grep -vi password | tail -14
echo "== auth config"
supabase config push --project-ref "$REF" --yes < /dev/null 2>&1 | grep -vi password | tail -25
echo "== client env"
supabase projects api-keys --project-ref "$REF" -o json < /dev/null 2> /dev/null > .secrets/api-keys.json
chmod 600 .secrets/api-keys.json
node -e '
const fs = require("fs");
const keys = JSON.parse(fs.readFileSync(".secrets/api-keys.json", "utf8"));
const pick = keys.find((k) => k.name === "anon") || keys.find((k) => k.type === "publishable");
if (!pick) { console.log("no public key found"); process.exit(1); }
const env = [
  "VITE_SUPABASE_URL=https://" + process.argv[1] + ".supabase.co",
  "VITE_SUPABASE_ANON_KEY=" + pick.api_key,
  "VITE_MEMBERS=" + process.argv[2],
  "VITE_AUTH_DOMAIN=" + process.argv[3],
].join("\n") + "\n";
fs.writeFileSync(".env.local", env);
console.log("wrote .env.local with the public key (" + (pick.name || pick.type) + ")");
' "$REF" "$MEMBERS" "$DOMAIN"
echo "== done"
