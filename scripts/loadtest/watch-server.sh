#!/usr/bin/env bash
# Sample docker container stats and Postgres activity at a regular interval
# while a load test runs. Human-readable output; redirect to a file and review
# after the test finishes instead of staring at jumpy live values.
#
# Usage: scripts/loadtest/watch-server.sh [interval_seconds] > server.log
# Defaults: 3 second interval. Stop with Ctrl-C.

set -euo pipefail

INTERVAL="${1:-3}"
DB_CONTAINER="${DB_CONTAINER:-openrift-db-1}"
DB_CONTAINER_PREFIX="${DB_CONTAINER_PREFIX:-openrift-preview}"

trap 'exit 0' INT

while true; do
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  docker stats "${DB_CONTAINER_PREFIX}-db-1" "${DB_CONTAINER_PREFIX}-api-1" "${DB_CONTAINER_PREFIX}-proxy-1" "${DB_CONTAINER_PREFIX}-web-1" --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
  echo "--- pg_stat_activity ---"
  docker exec "$DB_CONTAINER" psql -U openrift -Atc \
    "SELECT count(*), state FROM pg_stat_activity GROUP BY state ORDER BY state" \
    2>/dev/null || true
  echo
  sleep "$INTERVAL"
done
