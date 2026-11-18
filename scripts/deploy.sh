#!/bin/bash
# Build and publish the current folder to Vercel (production).
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
vercel deploy --prod --yes < /dev/null 2>&1 | tail -12
