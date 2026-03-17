#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup.sql>"
  exit 1
fi

DUMP_FILE="$1"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Error: File '$DUMP_FILE' not found"
  exit 1
fi

# Read preview password from .env
PREVIEW_PASSWORD="$(grep POSTGRES_PASSWORD .env | cut -d= -f2)"

echo "Stopping services..."
docker compose stop api web backup

echo "Terminating existing connections..."
docker compose exec db psql -U openrift -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'openrift' AND pid <> pg_backend_pid();"

echo "Dropping and recreating database..."
docker compose exec db psql -U openrift -d postgres -c "DROP DATABASE IF EXISTS openrift;"
docker compose exec db psql -U openrift -d postgres -c "CREATE DATABASE openrift OWNER openrift;"

echo "Loading dump..."
docker compose exec -T db psql -U openrift -d openrift < "$DUMP_FILE"

echo "Resetting password to preview value..."
docker compose exec db psql -U openrift -d postgres -c "ALTER USER openrift WITH PASSWORD '$PREVIEW_PASSWORD';"

echo "Starting services..."
docker compose start api web backup

echo "Done!"
