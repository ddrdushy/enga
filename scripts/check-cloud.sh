#!/bin/bash
# End-to-end check of the live Supabase path with a throwaway member ("Zztest").
# Adds it to the allow-list, runs the real store code through every write, then removes it again.
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
set -u
ORIGINAL="$(bash scripts/sql.sh -At -c "select value from private.settings where key = 'allowed_emails'")"
cleanup() {
  bash scripts/sql.sh -c "update private.settings set value = '$ORIGINAL' where key = 'allowed_emails'; delete from auth.users where email = 'zztest@enga.app';"
  echo "== cleaned up: $(bash scripts/sql.sh -At -c "select count(*) from auth.users where email = 'zztest@enga.app'") test users left"
}
trap cleanup EXIT
bash scripts/sql.sh -c "delete from auth.users where email = 'zztest@enga.app'; update private.settings set value = '$ORIGINAL,zztest@enga.app' where key = 'allowed_emails';"
VITE_MEMBERS="Dushy,Ali,Kiru,Zztest" VITE_E2E_CODE="$(cat .secrets/circle-code)" npx vitest run src/lib/cloud.e2e.test.ts 2>&1 | sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | tail -40
