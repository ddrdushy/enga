#!/bin/bash
# Apply any new files in supabase/migrations to the hosted database.
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
supabase db push -p "$(cat .secrets/db-password)" --include-all --yes < /dev/null 2>&1 | grep -vi password | sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | tail -12
