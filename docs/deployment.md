# Deployment

OpenRift runs on a VPS with Docker Compose behind Cloudflare. Two instances share the same host:

- **Stable** (`openrift.app`) — deploys when a version tag (`v*`) is pushed (from `~/openrift`)
- **Preview** (`preview.openrift.app`) — auto-deploys on every push to `main` (from `~/openrift-preview`)

Docker images are built in GitHub Actions and pushed to GHCR. The VPS only pulls pre-built images — no building on prod.

## Architecture

| Container | Image                      | Role                                                                  |
| --------- | -------------------------- | --------------------------------------------------------------------- |
| `db`      | `postgres:16-alpine`       | Database (unchanged across deploys)                                   |
| `api`     | `ghcr.io/.../openrift-api` | API + migrations on startup + cron jobs (distroless, compiled binary) |
| `web`     | `ghcr.io/.../openrift-web` | SPA + API proxy (nginx)                                               |

The `api` container:

1. Runs database migrations on startup (blocks until complete)
2. Registers cron jobs for price refresh (TCGPlayer at 06:00 UTC, Cardmarket at 06:15 UTC)
3. Starts the Hono API server

## Release Strategy

Development follows a trunk-based model: all work lands on `main` and immediately deploys to the preview instance. When ready to release, trigger the **Release** workflow manually from GitHub Actions (`workflow_dispatch`). It runs [semantic-release](https://semantic-release.gitbook.io/) to determine the next version from conventional commits, creates a GitHub release with the tag, builds images tagged as `v1.2.3` + `latest`, and deploys to the stable VPS — all in one workflow.

### Feature Flags

Feature flags gate longer-lived features that take multiple commits to complete. Flagged code can be pushed to `main`, tested on preview, and kept hidden on stable until it's ready. Once the feature is ready, the flag is removed and the code runs unconditionally.

Flags are defined in `apps/web/src/lib/feature-flags.ts` and controlled by `VITE_FEATURE_*` env vars, which are baked into the web image at build time in GitHub Actions. Preview flags are configured as GitHub repository variables; tag builds use stable flags (or no flags = all disabled).

## How It Works

### CI/CD Pipeline

1. **Push to `main`** → `preview.yml` builds both images with `:preview` tag, pushes to GHCR, then SSHes to VPS and runs `./deploy.sh`
2. **Manual release** → `release.yml` (triggered via `workflow_dispatch`) runs semantic-release to determine the next version, builds both images with `:vX.Y.Z` + `:latest` tags, pushes to GHCR, then SSHes to VPS and runs `./deploy.sh vX.Y.Z`

### Deploy Script

The `deploy.sh` on the VPS is minimal — no building:

1. Fetches the latest git state (for compose file updates)
2. Checks out the given ref (`main` by default, or a tag like `v1.2.0`)
3. Pulls pre-built images from GHCR
4. Restarts services (migrations run automatically on api startup)
5. Cleans up old images

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
curl -X POST -H "Cookie: ..." https://openrift.app/api/admin/refresh-catalog

# Stop everything
docker compose down              # Keeps data
docker compose down -v           # Destroys database volume too (!)
```

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

| Source                            | Location                                                | Notes                         |
| --------------------------------- | ------------------------------------------------------- | ----------------------------- |
| **API** (`api` container)         | Docker json-file log                                    | API + migration + cron output |
| **Web / nginx** (`web` container) | Docker json-file log                                    | nginx access + error logs     |
| **PostgreSQL** (`db` container)   | Docker json-file log                                    | Postgres server logs          |
| **Host nginx**                    | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` | TLS-terminating reverse proxy |

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

### Health check

The API exposes a `/api/health` endpoint that returns:

- `200 { "status": "ok" }` — healthy
- `503 { "status": "db_unreachable" }` — can't connect to PostgreSQL
- `503 { "status": "db_empty" }` — connected but no data
- `503 { "status": "db_not_migrated" }` — migrations haven't run

```bash
# Production (Docker-mapped port)
curl -s localhost:3001/api/health | jq .

# Local dev (Hono runs natively)
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

The script is idempotent: re-running with the same source data updates existing snapshots (ON CONFLICT on `source_id + recorded_at`) rather than creating duplicates.

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

The VPS needs to pull images from the private GHCR registry. Create a GitHub PAT with `read:packages` scope:

```bash
su - openrift
echo "$PAT" | docker login ghcr.io -u eikowagenknecht --password-stdin
```

Docker stores the credential in `~/.docker/config.json`. This only needs to be done once (or when the PAT is rotated).

### 4. Set up GitHub deploy key

The `openrift` user needs read-only access to pull the repo (for compose file and deploy script updates).

```bash
su - openrift
ssh-keygen -t ed25519 -C "openrift-vps" -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the public key as a **deploy key** (read-only) in the GitHub repo settings. Test with `ssh -T git@github.com`.

### 5. Set up SSH access for GitHub Actions

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

### 6. Clone and configure

Clone the repo once per instance. The stable instance lives at `~/openrift`, preview at `~/openrift-preview`:

```bash
su - openrift

# Stable instance
git clone git@github.com:eikowagenknecht/openrift.git ~/openrift
cd ~/openrift
cp .env.example .env
# Edit .env: use default ports (5432/3001/8080), set IMAGE_TAG=latest

cp deploy.sh.example deploy.sh
chmod +x deploy.sh
```

```bash
# Preview instance
git clone git@github.com:eikowagenknecht/openrift.git ~/openrift-preview
cd ~/openrift-preview
cp .env.example .env
# Edit .env: use preview ports (DB_PORT=5433, API_PORT=3002, WEB_PORT=8081)
# Set IMAGE_TAG=preview

cp deploy.sh.example deploy.sh
chmod +x deploy.sh
```

Edit `.env` with production values for each instance. Note: `DATABASE_URL` host must be `db` (the Docker Compose service name), not `localhost`.

### 7. Set up TLS with Cloudflare

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

**Host nginx:** Install nginx and link both configs:

```bash
apt install -y nginx
ln -s /home/openrift/openrift/nginx/openrift.conf /etc/nginx/sites-enabled/openrift.app
ln -s /home/openrift/openrift-preview/nginx/preview.openrift.conf /etc/nginx/sites-enabled/preview.openrift.app
nginx -t && systemctl reload nginx
```

`openrift.conf` proxies `openrift.app` → `:8080`, `preview.openrift.conf` proxies `preview.openrift.app` → `:8081`.

### 8. First deploy

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
curl -s localhost:8080    # Should return HTML
curl -s localhost:3001/api/health | jq .

# Preview
cd ~/openrift-preview && docker compose ps
curl -s localhost:8081    # Should return HTML
curl -s localhost:3002/api/health | jq .
```

### Directory Layout

```plaintext
/home/openrift/
├── openrift/                        # Stable (openrift.app), checked out at version tag
│   ├── certs/                       # Cloudflare Origin Certificate (gitignored)
│   ├── .env                         # Production secrets (gitignored)
│   ├── deploy.sh                    # Deploy script (gitignored)
│   ├── docker-compose.yml           # Ports: 5432, 3001, 8080
│   └── ...
└── openrift-preview/                # Preview (preview.openrift.app), tracks main
    ├── certs/                       # Cloudflare Origin Certificate (gitignored)
    ├── .env                         # Production secrets (gitignored)
    ├── deploy.sh                    # Deploy script (gitignored)
    ├── docker-compose.yml           # Ports: 5433, 3002, 8081
    └── ...

Docker-managed:
  /var/lib/docker/volumes/openrift_pg_data/          # Stable PostgreSQL data
  /var/lib/docker/volumes/openrift-preview_pg_data/  # Preview PostgreSQL data
```
