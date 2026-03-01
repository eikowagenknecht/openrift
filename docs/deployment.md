# Deployment

OpenRift runs on a VPS with Docker Compose behind Cloudflare. Two instances share the same host:

- **Stable** (`openrift.app`) — deploys when a version tag (`v*`) is pushed (from `~/openrift`)
- **Preview** (`preview.openrift.app`) — auto-deploys on every push to `main` (from `~/openrift-preview`)

## Release Strategy

Development follows a trunk-based model: all work lands on `main` and immediately deploys to the preview instance. When we're happy with an arbitrary set of changes, we manually tag a release:

```bash
git tag v1.2.0
git push origin v1.2.0
```

This triggers the stable deploy workflow, which checks out the tag on the VPS. Tags follow [semantic versioning](https://semver.org/) (`v<major>.<minor>.<patch>`).

### Feature Flags

Feature flags gate longer-lived features that take multiple commits to complete. Flagged code can be pushed to `main`, tested on preview, and kept hidden on stable until it's ready. Once the feature is ready, the flag is removed and the code runs unconditionally.

Flags are defined in `apps/web/src/lib/feature-flags.ts` and controlled by `VITE_FEATURE_*` env vars, which are baked into the web build at image build time. Omitting a flag keeps it disabled — only add it where you want the feature turned on:

```bash
# ~/openrift-preview/.env
VITE_FEATURE_AUTH=true
```

## How It Works

The `Dockerfile` uses a single multi-stage build: a shared `build` stage compiles everything, then lean `api`, `web`, and `migrate` stages copy only what they need. See [Architecture](architecture.md) for the full infrastructure diagram.

**Deploy script** (`deploy.sh`):

1. Fetches the latest state (branches and tags)
2. Checks out the given ref (`main` by default, or a tag like `v1.2.0`)
3. Builds all Docker images
4. Runs database migrations
5. Restarts services
6. Cleans up old images

**GitHub Actions** SSHes into the VPS to run `./deploy.sh`:

- `deploy-preview.yml` — triggers on push to `main`, runs `./deploy.sh` (defaults to `main`)
- `deploy-stable.yml` — triggers on `v*` tag push, runs `./deploy.sh v1.2.0` (checks out the tag)

## Regular Deploys

For code changes without database migrations:

```bash
git pull
docker compose build
docker compose up -d
```

For changes that include migrations:

```bash
git pull
docker compose build
docker compose run --rm migrate
docker compose up -d
```

Or just use the deploy script, which always runs migrations:

```bash
./deploy.sh
```

## Common Operations

```bash
# View logs
docker compose logs -f           # All services
docker compose logs -f api       # API only

# Run migrations manually
docker compose run --rm migrate

# Seed cards and prices (first deploy, or after wiping the database)
docker compose run --rm seed

# Access the database
docker compose exec db psql -U openrift -d openrift

# Restart a single service
docker compose restart api

# Stop everything
docker compose down              # Keeps data
docker compose down -v           # Destroys database volume too (!)
```

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

### 3. Set up GitHub deploy key

The `openrift` user needs read-only access to pull the repo.

```bash
su - openrift
ssh-keygen -t ed25519 -C "openrift-vps" -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the public key as a **deploy key** (read-only) in the GitHub repo settings. Test with `ssh -T git@github.com`.

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
|---------------|----------------------------------------------------|
| `VPS_HOST`    | Server IP address                                  |
| `VPS_USER`    | `openrift`                                         |
| `VPS_SSH_KEY` | Contents of `~/.ssh/openrift-deploy` (private key) |

### 5. Clone and configure

Clone the repo once per instance. The stable instance lives at `~/openrift`, preview at `~/openrift-preview`:

```bash
su - openrift

# Stable instance
git clone git@github.com:eikowagenknecht/openrift.git ~/openrift
cd ~/openrift
cp .env.example .env
# Edit .env: use default ports (5432/3001/8080)

cp deploy.sh.example deploy.sh
chmod +x deploy.sh
```

```bash
# Preview instance
git clone git@github.com:eikowagenknecht/openrift.git ~/openrift-preview
cd ~/openrift-preview
cp .env.example .env
# Edit .env: use preview ports (DB_PORT=5433, API_PORT=3002, WEB_PORT=8081)
# Optionally enable feature flags: VITE_FEATURE_AUTH=true

cp deploy.sh.example deploy.sh
chmod +x deploy.sh
```

Edit `.env` with production values for each instance. Note: `DATABASE_URL` host must be `db` (the Docker Compose service name), not `localhost`.

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

**Host nginx:** Install nginx and link both configs:

```bash
apt install -y nginx
ln -s /home/openrift/openrift/nginx/openrift.conf /etc/nginx/sites-enabled/openrift.app
ln -s /home/openrift/openrift-preview/nginx/preview.openrift.conf /etc/nginx/sites-enabled/preview.openrift.app
nginx -t && systemctl reload nginx
```

`openrift.conf` proxies `openrift.app` → `:8080`, `preview.openrift.conf` proxies `preview.openrift.app` → `:8081`.

### 7. First deploy

```bash
su - openrift

# Stable
cd ~/openrift && ./deploy.sh
docker compose run --rm seed

# Preview
cd ~/openrift-preview && ./deploy.sh
docker compose run --rm seed
```

Verify:

```bash
# Stable
cd ~/openrift && docker compose ps
curl -s localhost:8080    # Should return HTML
curl -s localhost:3001    # API should respond

# Preview
cd ~/openrift-preview && docker compose ps
curl -s localhost:8081    # Should return HTML
curl -s localhost:3002    # API should respond
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
└── openrift-preview/                   # Preview (preview.openrift.app), tracks main
    ├── certs/                       # Cloudflare Origin Certificate (gitignored)
    ├── .env                         # Production secrets (gitignored)
    ├── deploy.sh                    # Deploy script (gitignored)
    ├── docker-compose.yml           # Ports: 5433, 3002, 8081
    └── ...

Docker-managed:
  /var/lib/docker/volumes/openrift_pg_data/        # Stable PostgreSQL data
  /var/lib/docker/volumes/openrift-preview_pg_data/   # Preview PostgreSQL data
```
