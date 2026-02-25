# Deployment

OpenRift runs on a VPS with Docker Compose behind Cloudflare. Pushes to `main` auto-deploy to `openrift.app` (from `~/openrift`), pushes to `beta` auto-deploy to `beta.openrift.app` (from `~/openrift-beta`). Each instance has its own Docker Compose stack with separate ports and database volumes.

## How It Works

The `Dockerfile` uses a single multi-stage build: a shared `build` stage compiles everything, then lean `api`, `web`, and `migrate` stages copy only what they need. See [Architecture](architecture.md) for the full infrastructure diagram.

**Deploy script** (`deploy.sh`):

1. Pulls the latest branch (`main` or `beta`)
2. Builds all Docker images
3. Runs database migrations
4. Restarts services
5. Cleans up old images

**GitHub Actions** SSHes into the VPS to run `./deploy.sh` on every push to `main` or `beta`.

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

Clone the repo once per instance. The main instance lives at `~/openrift`, beta at `~/openrift-beta`:

```bash
su - openrift

# Main instance
git clone git@github.com:eikowagenknecht/openrift.git ~/openrift
cd ~/openrift
cp .env.example .env
# Edit .env: use default ports (5432/3001/8080)

cp deploy.sh.example deploy.sh
chmod +x deploy.sh
```

```bash
# Beta instance
git clone git@github.com:eikowagenknecht/openrift.git ~/openrift-beta
cd ~/openrift-beta
cp .env.example .env
# Edit .env: set BRANCH="beta", use beta ports (DB_PORT=5433, API_PORT=3002, WEB_PORT=8081)

cp deploy.sh.example deploy.sh
chmod +x deploy.sh
# Edit deploy.sh: change BRANCH="main" to BRANCH="beta"
```

Edit `.env` with production values for each instance. Note: `DATABASE_URL` host must be `db` (the Docker Compose service name), not `localhost`.

### 6. Set up TLS with Cloudflare

OpenRift uses Cloudflare as a reverse proxy (orange cloud / proxied DNS). TLS between Cloudflare and the VPS is terminated by host nginx using a Cloudflare Origin Certificate.

**DNS:** Create A records (proxied) for `openrift.app` and `beta.openrift.app` pointing to the VPS IP. Set Cloudflare SSL/TLS mode to **Full (strict)**.

**Origin Certificates:** In the Cloudflare dashboard (SSL/TLS → Origin Server), generate certificates for each domain:

```bash
# Main
mkdir -p ~/openrift/certs
# Paste certificate → certs/origin.pem, private key → certs/origin-key.pem

# Beta
mkdir -p ~/openrift-beta/certs
# Paste certificate → certs/origin.pem, private key → certs/origin-key.pem
```

**Host nginx:** Install nginx and link both configs:

```bash
apt install -y nginx
ln -s /home/openrift/openrift/nginx/openrift.conf /etc/nginx/sites-enabled/openrift.app
ln -s /home/openrift/openrift-beta/nginx/beta.openrift.conf /etc/nginx/sites-enabled/beta.openrift.app
nginx -t && systemctl reload nginx
```

`openrift.conf` proxies `openrift.app` → `:8080`, `beta.openrift.conf` proxies `beta.openrift.app` → `:8081`.

### 7. First deploy

```bash
su - openrift

# Main
cd ~/openrift && ./deploy.sh

# Beta
cd ~/openrift-beta && ./deploy.sh
```

Verify:

```bash
# Main
cd ~/openrift && docker compose ps
curl -s localhost:8080    # Should return HTML
curl -s localhost:3001    # API should respond

# Beta
cd ~/openrift-beta && docker compose ps
curl -s localhost:8081    # Should return HTML
curl -s localhost:3002    # API should respond
```

### Directory Layout

```plaintext
/home/openrift/
├── openrift/                        # Main branch (openrift.app)
│   ├── certs/                       # Cloudflare Origin Certificate (gitignored)
│   ├── .env                         # Production secrets (gitignored)
│   ├── deploy.sh                    # Deploy script (gitignored, BRANCH="main")
│   ├── docker-compose.yml           # Ports: 5432, 3001, 8080
│   └── ...
└── openrift-beta/                   # Beta branch (beta.openrift.app)
    ├── certs/                       # Cloudflare Origin Certificate (gitignored)
    ├── .env                         # Production secrets (gitignored)
    ├── deploy.sh                    # Deploy script (gitignored, BRANCH="beta")
    ├── docker-compose.yml           # Ports: 5433, 3002, 8081
    └── ...

Docker-managed:
  /var/lib/docker/volumes/openrift_pg_data/        # Main PostgreSQL data
  /var/lib/docker/volumes/openrift-beta_pg_data/   # Beta PostgreSQL data
```
