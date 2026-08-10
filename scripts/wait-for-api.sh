#!/bin/sh
# Startup readiness gate: block until the API answers its health endpoint, then
# exec the real command.
#
# Compose already expresses this with `depends_on: api: condition:
# service_healthy`, but that condition is only evaluated by `docker compose up`.
# When the Docker daemon starts containers on its own — host reboot, `systemctl
# restart docker`, or any `restart: unless-stopped` restart after a crash — it
# follows the restart policy and ignores dependency ordering entirely. The SSR
# server then came up next to a still-migrating API and its first requests threw
# connect errors (OPENRIFT-SSR-1T: four events 13s after a host boot, more on
# later container restarts). This gate runs on every container start, so it
# covers the daemon-driven cases compose cannot.
#
# Fail-open on timeout: if the API never reports healthy we start anyway rather
# than park the site in maintenance forever. A genuinely broken API is a
# different incident, and the deploy path still gates properly via `--wait`.
set -eu

url="${API_HEALTH_URL:-${API_INTERNAL_URL:-http://api:3000}/api/health}"
timeout="${API_WAIT_TIMEOUT:-120}"
interval="${API_WAIT_INTERVAL:-2}"
probe_timeout="${API_WAIT_PROBE_TIMEOUT:-3}"

# Each probe is wrapped in `timeout` rather than relying on wget's own -T. The
# runtime here is busybox wget, which gives up on a refused connection at once,
# but GNU wget (any non-alpine base, or someone running this by hand) retries a
# refused connection up to 20 times with backoff and blows straight past the
# total budget. `timeout` bounds the attempt whichever wget is in play.
# The budget is wall-clock against a deadline, not a count of sleeps. An API
# that accepts the connection but never answers costs a full probe_timeout per
# attempt, so summing only the sleeps would overshoot the budget several times
# over — exactly the case this gate exists to survive.
start="$(date +%s)"
deadline=$((start + timeout))
announced=0

while :; do
  if timeout "$probe_timeout" wget -q -T "$probe_timeout" -O /dev/null "$url" 2>/dev/null; then
    if [ "$announced" -eq 1 ]; then
      echo "wait-for-api: API ready after $(($(date +%s) - start))s, starting."
    fi
    exec "$@"
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    break
  fi
  if [ "$announced" -eq 0 ]; then
    echo "wait-for-api: waiting for $url (timeout ${timeout}s)..."
    announced=1
  fi
  sleep "$interval"
done

echo "wait-for-api: API not ready after $(($(date +%s) - start))s, starting anyway." >&2
exec "$@"
