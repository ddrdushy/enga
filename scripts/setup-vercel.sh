#!/bin/bash
# Link this folder to a Vercel project and copy the public client settings from .env.local.
# Usage: bash scripts/setup-vercel.sh        (then: bash scripts/deploy.sh)
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
[ -s .env.local ] || { echo "missing .env.local (run scripts/setup-supabase.sh first)"; exit 1; }
echo "== link"
vercel link --yes --project enga < /dev/null 2>&1 | tail -3
echo "== env"
while IFS='=' read -r name value; do
  [ -z "$name" ] && continue
  for target in production preview; do
    printf '%s' "$value" | vercel env add "$name" "$target" --force > /dev/null 2>&1 && echo "set $name ($target)" || echo "FAILED $name ($target)"
  done
done < .env.local
echo "== done"
