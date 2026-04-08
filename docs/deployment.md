# Deployment

OpenRift runs on a VPS with Docker Compose behind Cloudflare. Two instances share the same host:

- **Stable** (`openrift.app`) — deploys when a release is triggered (from `~/openrift`)
- **Preview** (`preview.openrift.app`) — auto-deploys on every push to `main` (from `~/openrift-preview`)

Docker images are built in GitHub Actions and pushed to GHCR. The VPS only pulls pre-built images — no building on prod, no git clone needed.

## Architecture

| Container | Image                                    | Role                                                   |
| --------- | ---------------------------------------- | ------------------------------------------------------ |
| `db`      | `postgres:18-alpine`                     | Database (unchanged across deploys)                    |
| `api`     | `ghcr.io/eikowagenknecht/openrift-api`   | API + migrations on startup + cron jobs (Bun)          |
| `web`     | `ghcr.io/eikowagenknecht/openrift-web`   | TanStack Start SSR server (Bun, internal only)         |
| `proxy`   | `ghcr.io/eikowagenknecht/openrift-proxy` | Nginx reverse proxy + static assets (exposed on :8080) |
| `backup`  | `siemens/postgres-backup-s3:18`          | Scheduled pg_dump to Cloudflare R2                     |

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
3. Cleans up old images

### Startup Sequence

When the `api` container starts:

1. **Migrations** run to completion (blocks startup)
2. **Cron jobs** register for price refresh (non-blocking timers)
3. **Hono server** starts listening on port 3000

## Environment Variables

### Cron Configuration

| Variable          | Default      | Description                                                        |
| ----------------- | ------------ | ------------------------------------------------------------------ |
| `CRON_ENABLED`    | `true`       | Set to `false` to disable price refresh cron jobs (e.g. local dev) |
| `CRON_TCGPLAYER`  | `0 6 * * *`  | Cron expression for TCGPlayer price refresh                        |
| `CRON_CARDMARKET` | `15 6 * * *` | Cron expression for Cardmarket price refresh                       |
| `IMAGE_TAG`       | `latest`     | GHCR image tag (`preview`, `latest`, or `v1.2.3`)                  |
| `SMTP_PORT`       | `465`        | SMTP port for email verification                                   |
| `SMTP_SECURE`     | `true`       | Use TLS for SMTP                                                   |

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

The `backup` sidecar container runs `pg_dump` on a schedule and uploads GPG-encrypted backups to Cloudflare R2. It uses the [siemens/postgres-backup-s3](https://github.com/siemens/postgres-backup-s3) image (`:18` tag matches our PostgreSQL version). Old backups are automatically pruned after `BACKUP_KEEP_DAYS`.

### Configuration

Set these in `.env` on the VPS:

| Variable                      | Description                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `BACKUP_S3_ENDPOINT`          | R2 endpoint (no bucket name): `https://<account-id>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET`            | R2 bucket name (e.g. `openrift-backups`)                                      |
| `BACKUP_S3_PREFIX`            | Path prefix inside the bucket (default: `backups`)                            |
| `BACKUP_S3_ACCESS_KEY_ID`     | R2 API token access key (needs Object Read & Write)                           |
| `BACKUP_S3_SECRET_ACCESS_KEY` | R2 API token secret key                                                       |
| `BACKUP_ENCRYPTION_PASSWORD`  | **Required.** GPG symmetric encryption passphrase                             |
| `BACKUP_SCHEDULE`             | Cron expression (default: `@daily`)                                           |
| `BACKUP_KEEP_DAYS`            | Delete backups older than this many days (default: `30`)                      |

### Manual backup

Run a one-off backup (dumps immediately, then exits):

```bash
docker compose run --rm -e SCHEDULE= backup
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
4. Add `BACKUP_S3_*` and `BACKUP_ENCRYPTION_PASSWORD` to `.env` on the VPS
5. Restart: `docker compose up -d`
6. Verify with a one-off backup: `docker compose run --rm -e SCHEDULE= backup` — check the R2 bucket for the uploaded file

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

# Preview instance
scp docker-compose.yml openrift@VPS:~/openrift-preview/
scp deploy.sh.example openrift@VPS:~/openrift-preview/deploy.sh
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

# On the server, symlink them
ln -s /home/openrift/openrift/openrift.conf /etc/nginx/sites-enabled/openrift.app
ln -s /home/openrift/openrift-preview/preview.openrift.conf /etc/nginx/sites-enabled/preview.openrift.app
nginx -t && systemctl reload nginx
```

`openrift.conf` proxies `openrift.app` → `:8080`, `preview.openrift.conf` proxies `preview.openrift.app` → `:8081`.

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
curl -s localhost:8082/api/health | jq .
```

### Directory Layout

```plaintext
/home/openrift/
├── openrift/                        # Stable (openrift.app)
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
- **Alerting** via Grafana (email notifications for high RAM, disk, CPU, container restarts, DB connection saturation)

### Setup

1. Copy the `monitoring/` directory to the VPS:

```bash
scp -r monitoring openrift@VPS:~/openrift/monitoring
```

2. Create `.env` from the template:

```bash
cd ~/openrift/monitoring
cp .env.example .env
# Edit .env: set GRAFANA_ADMIN_PASSWORD, SMTP credentials, POSTGRES_CONNECTION, ALERT_EMAIL_TO
```

3. Start the monitoring stack:

```bash
cd ~/openrift/monitoring
docker compose up -d
```

4. Set up Grafana access via nginx (optional, for browser access):

```bash
# Generate basic auth credentials
apt install -y apache2-utils
htpasswd -c /home/openrift/openrift/certs/.htpasswd admin

# Symlink nginx config and enable it
ln -s /home/openrift/openrift/monitoring.openrift.conf /etc/nginx/sites-enabled/monitoring.openrift.app
nginx -t && systemctl reload nginx
```

5. Add a DNS record in Cloudflare: `monitoring.openrift.app` (A record, proxied, same IP as main site).

6. Open `https://monitoring.openrift.app`, log in with the basic auth credentials, then with the Grafana admin password. Three dashboards are pre-provisioned: Host Metrics, Container Metrics, and PostgreSQL.

7. Verify email alerting: go to Alerting > Contact points > Test in Grafana.

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
