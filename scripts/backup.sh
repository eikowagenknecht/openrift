#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup.sql>"
  exit 1
fi

DUMP_FILE="$1"

echo "Stopping services..."
docker compose stop api web backup

echo "Terminating existing connections..."
docker compose exec db psql -U openrift -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'openrift' AND pid <> pg_backend_pid();"

echo "Backing up dump..."
docker compose exec db pg_dump -U openrift > "$DUMP_FILE"

echo "Starting services..."
docker compose start api web backup

echo "Done!"
