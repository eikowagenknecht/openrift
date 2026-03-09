#!/bin/sh
set -e

# Ensure the card-images bind-mount directory is writable by the app user.
# On first start, Docker creates host-side bind-mount dirs as root:root;
# this fixes ownership before dropping privileges.
APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"

mkdir -p /app/card-images
chown "$APP_UID:$APP_GID" /app/card-images

exec su-exec "$APP_UID:$APP_GID" "$@"
