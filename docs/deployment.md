# Deployment

OpenRift runs on a VPS with Docker Compose behind Cloudflare. Two instances share the same host:

- **Stable** (`openrift.app`) — deploys when a release is triggered (from `~/openrift`)
- **Preview** (`preview.openrift.app`) — auto-deploys on every push to `main` (from `~/openrift-preview`)

Docker images are built in GitHub Actions and pushed to GHCR. The VPS only pulls pre-built images — no building on prod, no git clone needed.

## Architecture

| Container | Image                                | Role                                                                                              |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `db`      | `postgres:18-alpine`                 | Database (unchanged across deploys)                                                               |
| `api`     | `ghcr.io/openriftapp/openrift-api`   | API + migrations on startup + cron jobs (Bun)                                                     |
| `web`     | `ghcr.io/openriftapp/openrift-web`   | TanStack Start SSR server (Bun, internal only)                                                    |
| `proxy`   | `ghcr.io/openriftapp/openrift-proxy` | Nginx reverse proxy + static assets (exposed on :8080)                                            |
| `bot`     | `ghcr.io/openriftapp/openrift-bot`   | Discord card-lookup bot (opt-in via `COMPOSE_PROFILES=bot`, see [discord-bot.md](discord-bot.md)) |

The `api` container:

1. Runs database migrations on startup (blocks until complete)
2. Registers cron jobs for price refresh (TCGPlayer at 06:00 UTC, Cardmarket at 06:15 UTC)
3. Starts the Hono API server

## Release Strategy

Development follows a trunk-based model: all work lands on `main` and immediately deploys to the preview instance. When ready to release, trigger the **Release** workflow manually from GitHub Actions (`workflow_dispatch`). It runs [semantic-release](https://semantic-release.gitbook.io/) to determine the next version from conventional commits, creates a GitHub release with the tag, builds images tagged as `v1.2.3` + `latest`, and deploys to the stable VPS — all in one workflow.

### Feature Flags

Incomplete features can be pushed to `main` behind feature flags, tested on preview, and kept hidden on stable until ready. Flags are managed via the admin panel — no rebuild or restart needed. See [feature-flags.md](feature-flags.md) for full details.

## How It Works

### CI/CD Pipeline

1. **Push to `main`** → `preview.yml` builds all three images (api, web, proxy) with `:preview` tag, pushes to GHCR, then SSHes to VPS and runs `./deploy.sh`
2. **Manual release** → `release.yml` (triggered via `workflow_dispatch`) runs semantic-release to determine the next version, builds all three images with `:vX.Y.Z` + `:latest` tags, pushes to GHCR, then SSHes to VPS and runs `./deploy.sh`

### Deploy Script

The `deploy.sh` on the VPS is minimal — no git operations, no building:

1. Pulls pre-built images from GHCR (the `IMAGE_TAG` in `.env` controls which tag)
2. Restarts services (migrations run automatically on api startup)
3. Purges the Cloudflare edge cache **targeted**: the anonymous HTML shells (the allowlist in `apps/web/src/lib/page-cache.ts`, see ADR-016) and everything under `/api/` are purged by prefix + the root URL; hashed `/assets/` and `/media/` are deliberately left cached — they're content-addressed and can never be stale, and keeping them warm avoids a multi-second cold load for the first visitors after each release (and keeps lazy-loading working for tabs still on the previous bundle). Uses `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_PURGE_HOST` from `.env`. The API purge matters on releases that change a response schema: without it the edge could serve old-shape payloads for up to the `stale-while-revalidate` window (24h for catalog/init).
4. Cleans up old images (best-effort: prod and preview share the VPS and the Docker daemon allows only one prune at a time, so an overlapping deploy just leaves the old layers for the next run)

Purge prefixes are host-scoped, so prod (`CLOUDFLARE_PURGE_HOST=openrift.app`) and preview (`preview.openrift.app`) can purge independently despite sharing one Cloudflare zone. All purge types (URL, prefix, hostname, tag) are available on the Free plan — prefix/hostname purges are rate-limited to 5 requests/minute, far above deploy frequency. If `CLOUDFLARE_PURGE_HOST` is missing the script falls back to `purge_everything`; if the credentials are missing it skips purging entirely (preview ran without credentials until the host-scoped purge made it safe — without any purge, preview can serve a stale HTML shell for up to ~1h after a deploy).

The full-cache nuke remains available as the admin UI's cache purge button (`purge_everything`).

### Startup Sequence

When the `api` container starts:

1. **Migrations** run to completion (blocks startup)
2. **Cron jobs** register for price refresh (non-blocking timers)
3. **Hono server** starts listening on port 3000

#### Ordering across containers

`docker-compose.yml` gates `web` and `bot` on `api` with `condition: service_healthy`, so a deploy never starts the SSR server against an API that is still migrating.

That condition is only evaluated by `docker compose up`. When the **daemon** starts containers on its own (a host reboot, `systemctl restart docker`, or a `restart: unless-stopped` policy firing after a crash) it follows the restart policy and ignores dependency order. The SSR server then comes up next to a still-migrating API and throws connect errors on its first requests, which is what happened after a host reboot.

So the `web` and `bot` images also carry an in-container gate, `scripts/wait-for-api.sh`, wired as their `ENTRYPOINT`. It polls `${API_INTERNAL_URL}/api/health` and only then `exec`s the real command, so the app inherits the entrypoint's process and no supervisor sits between it and its signals. It runs on every container start, so it covers the daemon-driven cases compose cannot.

Both services also set `init: true`, which puts tini at PID 1. The probe wraps each `wget` in busybox `timeout`, and busybox's applet is the inverse of the coreutils one: it double-forks a watchdog and then `exec`s the command itself, so the watchdog is orphaned onto PID 1. The last probe's watchdog outlives the `exec`, and bun does not reap adopted orphans, which left one `[timeout] <defunct>` per container start. tini reaps it and forwards `SIGTERM` to the app, so `stop_grace_period` and graceful shutdown are unaffected.

The gate **fails open**: after `API_WAIT_TIMEOUT` it starts anyway rather than parking the site in maintenance indefinitely. A permanently unhealthy API is a separate incident, and while the SSR server is not listening nginx already serves `maintenance.html` (the `@maintenance` fallback in `nginx/web.conf`).

| Variable                 | Default                 | Description                            |
| ------------------------ | ----------------------- | -------------------------------------- |
| `API_WAIT_TIMEOUT`       | `120`                   | Total seconds to wait before giving up |
| `API_WAIT_INTERVAL`      | `2`                     | Seconds between probes                 |
| `API_WAIT_PROBE_TIMEOUT` | `3`                     | Per-probe timeout                      |
| `API_HEALTH_URL`         | from `API_INTERNAL_URL` | Overrides the probed URL outright      |

`web`'s healthcheck carries `start_period: 150s` to cover the wait plus SSR boot; without it a slow API would get the container marked unhealthy while the gate is doing its job.

## Environment Variables

### Cron Configuration

| Variable          | Default  | Description                                                                   |
| ----------------- | -------- | ----------------------------------------------------------------------------- |
| `CRON_TCGPLAYER`  |          | Cron expression for TCGPlayer price refresh (e.g. `0 6 * * *`). Unset = off   |
| `CRON_CARDMARKET` |          | Cron expression for Cardmarket price refresh (e.g. `15 6 * * *`). Unset = off |
| `CRON_CHANGELOG`  |          | Cron expression for changelog Discord post (e.g. `0 20 * * *`). Unset = off   |
| `IMAGE_TAG`       | `latest` | GHCR image tag (`preview`, `latest`, or `v1.2.3`)                             |
| `SMTP_PORT`       | `465`    | SMTP port for email verification                                              |
| `SMTP_SECURE`     | `true`   | Use TLS for SMTP                                                              |

## Regular Deploys

Deploys are fully automated via GitHub Actions. For manual intervention:

```bash
# Pull latest images and restart
docker compose pull
docker compose up -d
```

Or use the deploy script:

```bash
./deploy.sh
```

## Common Operations

```bash
# View logs
docker compose logs -f api

# Access the database
docker compose exec db psql -U openrift -d openrift

# Restart a single service
docker compose restart api

# Manually trigger price refresh (via admin API)
curl -X POST -H "Cookie: ..." https://openrift.app/api/admin/refresh-tcgplayer-prices
curl -X POST -H "Cookie: ..." https://openrift.app/api/admin/refresh-cardmarket-prices

# Stop everything
docker compose down              # Keeps data (bind-mounted in ./data/)
docker compose down -v           # Same as above — bind mounts are NOT deleted by -v
```

## Database Backups

The backup container runs `pg_dump` on a schedule and uploads GPG-encrypted backups to Cloudflare R2. It uses the [siemens/postgres-backup-s3](https://github.com/siemens/postgres-backup-s3) image (`:18` tag matches our PostgreSQL version). Old backups are automatically pruned after `BACKUP_KEEP_DAYS`.

It runs as a separate Docker Compose project in `backup/`, connecting to the main app's network to reach the database.

### Configuration

Create `backup/.env` from `backup/.env.example` and fill in the values. The backup stack has its own `.env` (separate from the main app), including duplicated Postgres credentials. See `backup/.env.example` for all variables.

### Manual backup

Run a one-off backup (dumps immediately, then exits):

```bash
cd backup && docker compose run --rm -e SCHEDULE= backup
```

### Restore from backup

Download the `.dump.gpg` file from R2 (use the Cloudflare dashboard, rclone, or aws cli), then decrypt and restore. On Windows, `gpg` is included with Git for Windows — use Git Bash. Otherwise install [GPG4Win](https://gpg4win.org/).

```bash
# Decrypt
gpg --decrypt --batch --passphrase "your-passphrase" openrift_2026-03-06T03:00:00.dump.gpg > openrift.dump

# Restore into the running database
docker compose exec -T db pg_restore -U openrift -d openrift --clean --if-exists < openrift.dump
```

### Setup (first time)

1. Create an R2 bucket (e.g. `openrift-backups`) in the Cloudflare dashboard (R2 → Create bucket, EU region)
2. Create an R2 API token: R2 → Manage R2 API Tokens → Object Read & Write, scoped to the backup bucket only
3. Generate an encryption passphrase: `openssl rand -base64 32` — save it in a password manager
4. Create `backup/.env` from `backup/.env.example` and fill in the R2 credentials, encryption passphrase, and Postgres credentials
5. Start the backup container: `cd backup && docker compose up -d`
6. Verify with a one-off backup: `cd backup && docker compose run --rm -e SCHEDULE= backup` — check the R2 bucket for the uploaded file

## Logs

All services write to stdout/stderr and Docker captures the output. There is no dedicated logging library — the API uses `console.log()`, the web container uses nginx's default access/error logs, and PostgreSQL writes its own logs.

### Viewing logs

```bash
# All services (follow mode)
docker compose logs -f

# Single service
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db

# Last 200 lines
docker compose logs --tail 200 api

# Since a specific time
docker compose logs --since "2025-01-15T10:00:00" api
```

### Where logs are stored

| Source                          | Location                                                | Notes                         |
| ------------------------------- | ------------------------------------------------------- | ----------------------------- |
| **API** (`api` container)       | Docker json-file log                                    | API + migration + cron output |
| **Web / SSR** (`web` container) | Docker json-file log                                    | SSR server output             |
| **Proxy / nginx** (`proxy`)     | Docker json-file log                                    | nginx access + error logs     |
| **PostgreSQL** (`db` container) | Docker json-file log                                    | Postgres server logs          |
| **Host nginx**                  | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` | TLS-terminating reverse proxy |

Docker stores container logs under `/var/lib/docker/containers/<id>/<id>-json.log`. You rarely need to access these files directly — use `docker compose logs` instead.

### Log rotation

**Docker container logs** use Docker's default `json-file` driver, which does **not** rotate by default. On a long-running VPS, logs can grow unbounded. To enable rotation, add this to `/etc/docker/daemon.json` and restart Docker (`systemctl restart docker`):

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
```

This caps each container's log at 5 × 20 MB (100 MB total per container). Existing containers need to be recreated (`docker compose up -d --force-recreate`) to pick up the new settings.

**Host nginx logs** (`/var/log/nginx/`) are rotated automatically by the system's logrotate (installed with nginx, typically daily with 14-day retention).

### Health checks

**API** (`/api/health`) returns:

- `200 { "status": "ok" }` — healthy
- `503 { "status": "db_unreachable" }` — can't connect to PostgreSQL
- `503 { "status": "db_empty" }` — connected but no data
- `503 { "status": "db_not_migrated" }` — migrations haven't run

**Web SSR** (`/health`) returns `200 ok` (plain text). This is handled in `server.ts` before the router, so it doesn't render React.

```bash
# Production (through proxy)
curl -s localhost:8080/api/health | jq .
curl -s localhost:8080/health

# Local dev
curl -s localhost:3000/api/health | jq .
```

## Price Refresh

Price refresh runs automatically via in-process cron jobs in the `api` container (TCGPlayer at 06:00 UTC, Cardmarket at 06:15 UTC). The `protect: true` option prevents overlapping runs.

**Run manually via admin API:**

```bash
curl -X POST -H "Cookie: ..." https://openrift.app/api/admin/refresh-tcgplayer-prices
curl -X POST -H "Cookie: ..." https://openrift.app/api/admin/refresh-cardmarket-prices
```

**Logs:** Cron output goes to the `api` container's stdout, visible via `docker compose logs api`.

The script is idempotent: re-running with the same source data updates existing snapshots (ON CONFLICT on `product_id + recorded_at`) rather than creating duplicates.

## First-Time VPS Setup

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

Verify with `docker --version` and `docker compose version`.

### 2. Create the `openrift` user

```bash
adduser --disabled-password --gecos "" openrift
usermod -aG docker openrift
```

This user owns the app and can run Docker commands, but has no root privileges.

### 3. Authenticate with GHCR

The VPS needs to pull images from GHCR. Create a GitHub PAT with `read:packages` scope:

```bash
su - openrift
echo "$PAT" | docker login ghcr.io -u eikowagenknecht --password-stdin
```

Docker stores the credential in `~/.docker/config.json`. This only needs to be done once (or when the PAT is rotated).

### 4. Set up SSH access for GitHub Actions

On your **local machine**, generate a key for CI deploys:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/openrift-deploy -C "openrift-deploy" -N ""
cat ~/.ssh/openrift-deploy.pub
```

On the **server** (as root), add it to the `openrift` user's authorized keys:

```bash
echo "paste-the-public-key-here" >> /home/openrift/.ssh/authorized_keys
chown openrift:openrift /home/openrift/.ssh/authorized_keys
```

Add these as **repository secrets** in GitHub (Settings → Secrets → Actions):

| Secret        | Value                                              |
| ------------- | -------------------------------------------------- |
| `VPS_HOST`    | Server IP address                                  |
| `VPS_USER`    | `openrift`                                         |
| `VPS_SSH_KEY` | Contents of `~/.ssh/openrift-deploy` (private key) |

### 5. Copy files to the VPS

Each instance needs only three files: `docker-compose.yml`, `.env`, and `deploy.sh`. No git clone required.

```bash
su - openrift
mkdir -p ~/openrift ~/openrift-preview
```

From your **local machine**, copy the files:

```bash
# Stable instance
scp docker-compose.yml openrift@VPS:~/openrift/
scp deploy.sh.example openrift@VPS:~/openrift/deploy.sh
scp -r backup openrift@VPS:~/openrift/backup

# Preview instance
scp docker-compose.yml openrift@VPS:~/openrift-preview/
scp deploy.sh.example openrift@VPS:~/openrift-preview/deploy.sh
scp -r backup openrift@VPS:~/openrift-preview/backup
```

On the **server**:

```bash
chmod +x ~/openrift/deploy.sh ~/openrift-preview/deploy.sh
```

Create `.env` for each instance from `.env.example`:

```bash
# Stable: use default ports (5432/3001/8080), set IMAGE_TAG=latest
# Preview: use preview ports (DB_PORT=5433, API_PORT=3002, WEB_PORT=8081), set IMAGE_TAG=preview
```

Note: `DATABASE_URL` host must be `db` (the Docker Compose service name), not `localhost`.

### 6. Set up TLS with Cloudflare

OpenRift uses Cloudflare as a reverse proxy (orange cloud / proxied DNS). TLS between Cloudflare and the VPS is terminated by host nginx using a Cloudflare Origin Certificate.

**DNS:** Create A records (proxied) for `openrift.app` and `preview.openrift.app` pointing to the VPS IP. Set Cloudflare SSL/TLS mode to **Full (strict)**.

**Origin Certificates:** In the Cloudflare dashboard (SSL/TLS → Origin Server), generate certificates for each domain:

```bash
# Stable
mkdir -p ~/openrift/certs
# Paste certificate → certs/origin.pem, private key → certs/origin-key.pem

# Preview
mkdir -p ~/openrift-preview/certs
# Paste certificate → certs/origin.pem, private key → certs/origin-key.pem
```

**Host nginx:** Install nginx and copy the config files from the repo:

```bash
apt install -y nginx

# Copy nginx configs from the repo to the VPS
scp nginx/openrift.conf openrift@VPS:~/openrift/
scp nginx/preview.openrift.conf openrift@VPS:~/openrift-preview/

# Files the configs reference via absolute paths (maintenance page,
# Cloudflare real-IP ranges). The VPS has no git checkout, so re-run these
# scp commands whenever one of the files changes in the repo.
ssh openrift@VPS 'mkdir -p ~/openrift/nginx ~/openrift-preview/nginx'
scp nginx/maintenance.html nginx/cloudflare-realip.conf openrift@VPS:~/openrift/nginx/
scp nginx/maintenance.html nginx/cloudflare-realip.conf openrift@VPS:~/openrift-preview/nginx/

# On the server, symlink them
ln -s /home/openrift/openrift/openrift.conf /etc/nginx/sites-enabled/openrift.app
ln -s /home/openrift/openrift-preview/preview.openrift.conf /etc/nginx/sites-enabled/preview.openrift.app
nginx -t && systemctl reload nginx
```

`openrift.conf` proxies `openrift.app` → `:8080`, `preview.openrift.conf` proxies `preview.openrift.app` → `:8081`.

**Security invariant — `X-Real-IP` must be overwritten here.** The API's
sign-in/sign-up brute-force limiter and the proxy container's `limit_req`
zone both key on `X-Real-IP`, and the proxy container _trusts_ the incoming
header (it can't know the real client address behind host nginx). The host
configs in the repo do this correctly: the Cloudflare `real_ip` include maps
`$remote_addr` to the visitor IP, and every `proxy_pass` block sets
`proxy_set_header X-Real-IP $remote_addr;`, which overwrites anything a
client sent. After changing or re-copying a host nginx config, verify the
deployed file still carries that line for every location that proxies to
`:8080`/`:8081` — without it, clients can spoof `X-Real-IP` and bypass or
poison the rate limits.

### 7. First deploy

```bash
su - openrift

# Stable
cd ~/openrift && ./deploy.sh
# Refresh catalog on first deploy (via admin API)

# Preview
cd ~/openrift-preview && ./deploy.sh
```

Verify:

```bash
# Stable
cd ~/openrift && docker compose ps
curl -s localhost:8080/health    # Should return "ok" (SSR server via proxy)
curl -s localhost:8080/api/health | jq .

# Preview
cd ~/openrift-preview && docker compose ps
curl -s localhost:8081/health    # Should return "ok"
curl -s localhost:8081/api/health | jq .
```

### Directory Layout

```plaintext
/home/openrift/
├── openrift/                        # Stable (openrift.app)
│   ├── backup/                      # Backup stack (separate compose project)
│   │   └── docker-compose.yml
│   ├── certs/                       # Cloudflare Origin Certificate
│   │   └── .htpasswd               # Basic auth for monitoring (optional)
│   ├── data/postgres/               # PostgreSQL data (bind mount)
│   ├── monitoring/                  # Monitoring stack (optional, see below)
│   ├── .env                         # Production secrets
│   ├── deploy.sh                    # Deploy script
│   ├── docker-compose.yml           # Ports: 5432, 3001, 8080
│   ├── monitoring.openrift.conf     # nginx config for Grafana subdomain
│   └── openrift.conf                # nginx config for host nginx
└── openrift-preview/                # Preview (preview.openrift.app)
    ├── certs/                       # Cloudflare Origin Certificate
    ├── data/postgres/               # PostgreSQL data (bind mount)
    ├── .env                         # Production secrets
    ├── deploy.sh                    # Deploy script
    ├── docker-compose.yml           # Ports: 5433, 3002, 8081
    └── preview.openrift.conf        # nginx config for host nginx
```

## Monitoring

An optional Prometheus + Grafana monitoring stack lives in `monitoring/`. It runs as a separate Docker Compose project alongside the main app.

### What it monitors

- **Host metrics** (CPU, RAM, disk, network) via node-exporter
- **Container metrics** (per-container CPU, memory, restarts) via cAdvisor
- **PostgreSQL metrics** (connections, transactions, cache hit ratio, deadlocks) via postgres-exporter
- **Traces** from the API and SSR via Tempo, with span-derived RED metrics fed back into Prometheus as exemplars
- **Logs** from all app and monitoring containers via Loki, with `trace_id` attached as structured metadata for Tempo ↔ Loki pivots
- **Alerting** via Grafana (email notifications for high RAM, disk, CPU, container restarts, DB connection saturation)

### Telemetry pipeline

```text
  apps ──OTLP──▶ Alloy ──▶ Tempo      (traces)
                  │
                  └─tail Docker logs──▶ Loki   (logs, with trace_id)

  apps ──/metrics──▶ Prometheus              (metrics, with exemplars)

  apps ──errors────▶ Sentry                  (with trace_id tag and context)
```

Alloy is the single entrypoint for app telemetry: apps export OTLP to `http://alloy:4318` (Docker) or `http://localhost:4318` (host dev). Alloy forwards traces to Tempo and tails Docker container stdout, parsing pino JSON to lift `trace_id`, `service`, and `level` for Loki. In Grafana, a span in Tempo links to its log lines in Loki; a Sentry issue carries the `trace_id` tag for the same pivot.

### Setup

1. Copy the `monitoring/` directory to the VPS:

```bash
scp -r monitoring openrift@VPS:~/openrift/monitoring
```

2. Create `.env` from the template:

```bash
cd ~/openrift/monitoring
cp .env.example .env
# Edit .env: set GRAFANA_ADMIN_PASSWORD, SMTP credentials, POSTGRES_CONNECTION
```

3. Create data directories (must exist before first start):

```bash
mkdir -p ~/openrift/monitoring/data/{prometheus,grafana,tempo,loki,alloy}
```

4. Start the monitoring stack:

```bash
cd ~/openrift/monitoring
docker compose up -d
```

5. Set up Grafana access via nginx (optional, for browser access):

```bash
# Generate basic auth credentials
apt install -y apache2-utils
htpasswd -c /home/openrift/openrift/certs/.htpasswd admin

# Symlink nginx config and enable it
ln -s /home/openrift/openrift/monitoring.openrift.conf /etc/nginx/sites-enabled/monitoring.openrift.app
nginx -t && systemctl reload nginx
```

6. Add a DNS record in Cloudflare: `monitoring.openrift.app` (A record, proxied, same IP as main site).

7. Open `https://monitoring.openrift.app`, log in with the basic auth credentials, then with the Grafana admin password. Three dashboards are pre-provisioned: Host Metrics, Container Metrics, and PostgreSQL.

8. Set up email alerting: go to Alerting > Contact points, add an email contact point with your alert recipient address. Then create alert rules under Alerting > Alert rules (or import them). Send a test notification to verify SMTP works.

### Management

```bash
cd ~/openrift/monitoring

# View status
docker compose ps

# View logs
docker compose logs -f grafana
docker compose logs -f prometheus

# Restart
docker compose restart

# Stop (preserves data)
docker compose down

# Stop and delete all data (dashboards, metrics history)
docker compose down -v
```

### Storage

Prometheus retains metrics for 90 days by default (configurable via `PROMETHEUS_RETENTION` in `.env`). Estimated disk usage:

| Retention | Storage   |
| --------- | --------- |
| 30 days   | ~0.5-1 GB |
| 90 days   | ~1.5-3 GB |
| 180 days  | ~3-6 GB   |
| 1 year    | ~6-12 GB  |
