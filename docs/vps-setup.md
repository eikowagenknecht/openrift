# VPS Setup Guide

How to set up a fresh server for deploying OpenRift (beta branch).

## Prerequisites

- A Linux VPS (tested on Ubuntu 24.04 / Debian 12)
- Root SSH access
- Domain pointing to the server (e.g. `beta.openrift.app`)

## 1. Install Docker

```bash
# Install Docker Engine (official method)
curl -fsSL https://get.docker.com | sh
```

Verify with `docker --version` and `docker compose version`.

## 2. Create the `openrift` user

```bash
adduser --disabled-password --gecos "" openrift
usermod -aG docker openrift
```

This user owns the app and can run Docker commands, but has no root privileges.

## 3. Set up GitHub deploy key

The `openrift` user needs read-only access to the repo to pull it.

```bash
su - openrift
ssh-keygen -t ed25519 -C "openrift-vps" -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the public key as a **deploy key** (read-only) at:
https://github.com/eikowagenknecht/openrift/settings/keys

Test with: `ssh -T git@github.com`

## 4. Set up SSH access for GitHub Actions

On your **local machine**, generate a key for GitHub Actions to SSH into the VPS:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/openrift-deploy -C "openrift-deploy" -N ""
cat ~/.ssh/openrift-deploy.pub
```

Copy the output. On the **server** (as root), append it to the `openrift` user's authorized keys:

```bash
echo "paste-the-public-key-here" >> /home/openrift/.ssh/authorized_keys
chown openrift:openrift /home/openrift/.ssh/authorized_keys
```

Test: `ssh -i ~/.ssh/openrift-deploy openrift@your-server-ip`

## 5. Clone the repo and configure

```bash
git clone git@github.com:eikowagenknecht/openrift.git ~/app
cd ~/app

cp .env.example .env
```

Edit `.env` with production values:

```env
POSTGRES_DB=openrift
POSTGRES_USER=openrift
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgres://openrift:<same-password>@db:5432/openrift
CORS_ORIGIN=https://beta.openrift.app
```

Note: the `DATABASE_URL` host must be `db` (the Docker Compose service name), not `localhost`.

## 6. Set up the deploy script

```bash
cp deploy.sh.example deploy.sh
chmod +x deploy.sh
```

## 7. First deploy

```bash
./deploy.sh
```

This checks out the `beta` branch, builds all images, runs database migrations, and starts the services. Verify with:

```bash
docker compose ps        # All services should be "Up"
curl -s localhost:8080    # Should return HTML
curl -s localhost:3001    # API should respond
```

## 8. Reverse proxy and TLS

Set up nginx on the host to terminate TLS and forward to the web container on port 8080.

```bash
# Install nginx and certbot (as root)
apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/beta.openrift.app`:

```nginx
server {
    listen 80;
    server_name beta.openrift.app;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/beta.openrift.app /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Provision TLS certificate
certbot --nginx -d beta.openrift.app
```

Certbot modifies the nginx config to add TLS and sets up auto-renewal.

## 9. GitHub Actions (automatic deploys)

Add these as **repository secrets** in the GitHub repo (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Value |
|---|---|
| `VPS_HOST` | Server IP address |
| `VPS_USER` | `openrift` |
| `VPS_SSH_KEY` | Contents of `~/.ssh/openrift-deploy` on your **local machine** (private key) |

The workflow at `.github/workflows/deploy-beta.yml` triggers on every push to `beta` and runs `./deploy.sh` via SSH.

## Directory layout

```
/home/openrift/
└── app/                          # Git repo (beta branch)
    ├── .env                      # Production secrets (gitignored)
    ├── deploy.sh                 # Deploy script (gitignored, from deploy.sh.example)
    ├── deploy.sh.example         # Template checked into git
    ├── docker-compose.yml
    ├── Dockerfile
    └── ...

Docker-managed:
  /var/lib/docker/volumes/app_pg_data/   # PostgreSQL data (persists across deploys)
```

## Common operations

```bash
# SSH into the server
ssh openrift@your-server-ip

# Manual deploy
cd ~/app && ./deploy.sh

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
