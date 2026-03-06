#!/bin/sh
# Generate runtime feature flags from FEATURE_* environment variables.
# This runs at container start so flags are configurable without rebuilding.
# Placed in /docker-entrypoint.d/ and executed by nginx's own entrypoint.

CONFIG_PATH="/usr/share/nginx/html/config.js"

FLAGS=""
for var in $(env | grep '^FEATURE_' | sort); do
  key="${var%%=*}"
  value="${var#*=}"
  case "$value" in
    true|1|yes) bool="true" ;;
    *)          bool="false" ;;
  esac
  [ -n "$FLAGS" ] && FLAGS="$FLAGS,"
  FLAGS="$FLAGS\"$key\":$bool"
done

echo "globalThis.__FEATURE_FLAGS__={${FLAGS}};" > "$CONFIG_PATH"
