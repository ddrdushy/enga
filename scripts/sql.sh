#!/bin/bash
# Run SQL against the hosted database: bash scripts/sql.sh -c "select 1"
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
PGPASSWORD="$(cat .secrets/db-password)" psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -q "$@"
