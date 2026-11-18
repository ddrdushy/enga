#!/bin/bash
# Start (or restart) the every-15-minutes job that calls the morning reminder.
# Usage: bash scripts/schedule-morning.sh <https://app-domain>
set -u
cd "$(dirname "$0")/.." || exit 1
APP="${1:?usage: schedule-morning.sh <https://app-domain>}"
bash scripts/sql.sh -At -c "select public.schedule_morning('$APP/api/morning', '$(cat .secrets/cron-secret)');" > /dev/null && echo "scheduled"
bash scripts/sql.sh -At -c "select jobname || ' ' || schedule from cron.job where jobname = 'enga-morning';"
