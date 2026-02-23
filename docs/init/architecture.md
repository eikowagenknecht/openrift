# Riftbound Collection Tracker — Architecture

## Repository Structure

**One monorepo** using Turborepo with three packages:

```
riftbound/
├── apps/
│   ├── web/                → Vite + React SPA (the frontend)
│   └── api/
│       ├── src/            → Hono server (the backend)
│       └── Dockerfile
├── packages/
│   └── shared/             → Drizzle schema, types, validation (Zod schemas)
├── scripts/
│   └── card-import/        → Card data scraping/import scripts
├── docker-compose.yml
├── docker-compose.dev.yml
├── Caddyfile
├── turbo.json
└── package.json
```

Why one monorepo: `shared` is the glue. Your Drizzle schema defines the
database tables AND generates TypeScript types that both `web` and `api`
import. When you add a field to a card, the type updates everywhere in
one commit. Same for Zod validation schemas — define once, validate on
both client and server.

Why not put web + api in one app: They deploy differently. The web app
builds to static files served by Caddy. The api is a long-running Node
process in its own container. Separate apps, shared types.

---

## Hosting — What Lives Where

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE (free tier)                          │
│                                                                     │
│  DNS + CDN proxy for riftbound.app (or whatever domain)            │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Caches static assets (card images, JS/CSS bundles)           │  │
│  │ DDoS protection                                               │  │
│  │ SSL termination (optional, Caddy also handles this)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   HETZNER VPS (CX22, ~€4/mo)                       │
│                   Ubuntu 24, 2 vCPU, 4 GB RAM                      │
│                                                                     │
│  ┌──────────────────── Docker Compose ─────────────────────────┐   │
│  │                                                              │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │ CADDY (container, ports 80 + 443 exposed)              │  │   │
│  │  │                                                         │  │   │
│  │  │  riftbound.app/*        → /var/www/web/   (SPA files)  │  │   │
│  │  │  riftbound.app/api/*    → api:3000        (Hono)       │  │   │
│  │  │  riftbound.app/cards/*  → /var/www/cards/ (images)     │  │   │
│  │  │                                                         │  │   │
│  │  │  • Auto-TLS via Let's Encrypt                          │  │   │
│  │  │  • Gzip/Brotli compression                             │  │   │
│  │  │  • Cache headers for images (1 year)                   │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                      │                                       │   │
│  │                      │ Docker internal network (frontend)    │   │
│  │                      │ (only Caddy can reach api:3000)       │   │
│  │                      ▼                                       │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │ HONO API (container, port 3000 — NOT exposed to host)  │  │   │
│  │  │                                                         │  │   │
│  │  │  Middleware stack:                                      │  │   │
│  │  │   1. CORS (allow riftbound.app only)                   │  │   │
│  │  │   2. Rate limiter (auth endpoints)                     │  │   │
│  │  │   3. Better Auth session handler                       │  │   │
│  │  │   4. Route handlers                                    │  │   │
│  │  │                                                         │  │   │
│  │  │  Routes:                                                │  │   │
│  │  │   /api/auth/**       → Better Auth (login, register)   │  │   │
│  │  │   /api/cards/**      → Card database (public, read)    │  │   │
│  │  │   /api/collection/** → User collection (authed CRUD)   │  │   │
│  │  │   /api/decks/**      → Deck builder (authed CRUD)      │  │   │
│  │  │   /api/prices/**     → Price data (public, read)       │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                      │                                       │   │
│  │                      │ Docker internal network (backend)     │   │
│  │                      │ (only api can reach db:5432)          │   │
│  │                      ▼                                       │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │ POSTGRES 16 (container, NO ports exposed)              │  │   │
│  │  │                                                         │  │   │
│  │  │  DB: riftbound                                         │  │   │
│  │  │  User: riftbound_app (limited privileges)              │  │   │
│  │  │  Password: via Docker secret                           │  │   │
│  │  │                                                         │  │   │
│  │  │  Volume: pg_data (persistent)                          │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Host filesystem (mounted into containers as volumes):              │
│                                                                     │
│   /opt/riftbound/data/cards/     → card images (→ Caddy)           │
│     └── origins/                                                    │
│         ├── RB-001.webp                                            │
│         ├── RB-001-foil.webp                                       │
│         └── ...                                                     │
│   /opt/riftbound/data/web/       → SPA build output (→ Caddy)      │
│   /opt/riftbound/data/caddy/     → TLS certs + Caddy state         │
│   /opt/riftbound/data/backups/   → daily pg_dump files             │
│                                                                     │
│  Cron jobs (host-level):                                            │
│   Daily 03:00 → docker exec db pg_dump > backups/                  │
│   Daily 04:00 → docker exec api node price-scraper.js              │
│   Weekly      → docker exec api node card-sync.js                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Docker Compose

### Production

```yaml
# docker-compose.yml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./data/web:/var/www/web:ro
      - ./data/cards:/var/www/cards:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
    networks:
      - frontend

  api:
    build:
      context: .
      dockerfile: ./apps/api/Dockerfile
    restart: unless-stopped
    expose:
      - "3000"
    env_file:
      - .env.production
    depends_on:
      db:
        condition: service_healthy
    networks:
      - frontend
      - backend

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    # NO ports — not exposed to host or internet
    volumes:
      - pg_data:/var/lib/postgresql/data
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U riftbound_app -d riftbound"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - backend

volumes:
  caddy_data:
  caddy_config:
  pg_data:

networks:
  frontend:    # caddy <-> api
  backend:     # api <-> db
```

Note the two networks: `frontend` and `backend`. Caddy can reach the
API but cannot reach Postgres directly. The API bridges both networks.
This is defense in depth — even if Caddy had a vulnerability, the
attacker still can't touch the database.

### Development

```yaml
# docker-compose.dev.yml
# Usage: docker compose -f docker-compose.dev.yml up
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"          # exposed for local dev tools (pgAdmin, etc.)
    volumes:
      - pg_dev_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: riftbound
      POSTGRES_USER: riftbound_app
      POSTGRES_PASSWORD: dev_password

volumes:
  pg_dev_data:
```

In development, only Postgres runs in Docker. You run the Hono API
and Vite dev server natively with `pnpm dev` (via Turborepo) for
fast hot reload without Docker volume performance issues.

---

## Communication Flows

### Flow 1: Unauthenticated — Browse Card Database

```
User opens riftbound.app/cards

Browser                 Cloudflare         Caddy              Hono           Postgres
  │                        │                 │                  │                │
  │── GET / ──────────────▶│── if cached ──▶ │                  │                │
  │◀── index.html + JS ───│◀── or proxy ───│ (static file)    │                │
  │                        │                 │                  │                │
  │── GET /api/cards ─────▶│────────────────▶│── proxy ────────▶│                │
  │   ?set=origins         │                 │                  │── SELECT ─────▶│
  │   &domain=shadow       │                 │                  │   cards WHERE  │
  │                        │                 │                  │◀── rows ──────│
  │◀── JSON [{card},...] ──│◀───────────────│◀────────────────│                │
  │                        │                 │                  │                │
  │── GET /cards/origins/ ─▶│                 │                  │                │
  │   RB-001.webp          │ ◀── CF cache    │                  │                │
  │◀── image (from edge) ──│   hit! ────────│                  │                │
```

No auth required. Card data and images are public.
TanStack Query on the client caches API responses.
Cloudflare caches images at edge — after the first request, your
VPS doesn't even see subsequent image requests.

---

### Flow 2: Registration & Login

```
User clicks "Sign up"

Browser                    Caddy              Hono + Better Auth     Postgres
  │                          │                       │                   │
  │── POST /api/auth/sign-up▶│── proxy ────────────▶│                   │
  │   {email, password}      │                       │── hash password  │
  │                          │                       │   INSERT users ──▶│
  │                          │                       │   INSERT sessions │
  │                          │                       │◀── session_id ───│
  │◀── Set-Cookie: ─────────│◀─────────────────────│                   │
  │    session=abc123;       │                       │                   │
  │    HttpOnly; Secure;     │                       │                   │
  │    SameSite=Lax          │                       │                   │
```

Better Auth handles: password hashing (argon2), session creation,
cookie management, and optionally OAuth flows (Discord login would
be a natural fit for a gaming audience).

The session cookie is HttpOnly (JS can't read it → XSS safe) and
sent automatically with every subsequent request.

---

### Flow 3: Add Card to Collection (authenticated)

```
User clicks "+" on a card

Browser                    Caddy              Hono                  Postgres
  │                          │                       │                   │
  │── POST /api/collection ─▶│── proxy ────────────▶│                   │
  │   Cookie: session=abc123 │                       │                   │
  │   {cardId: "RB-042",    │                  ┌────┤                   │
  │    variant: "normal",    │                  │ Middleware:            │
  │    quantity: 1}          │                  │ 1. Read session cookie │
  │                          │                  │ 2. Verify session ───▶│
  │                          │                  │    SELECT sessions     │
  │                          │                  │ 3. Attach userId  ◀───│
  │                          │                  │ 4. Zod validate body  │
  │                          │                  └────┤                   │
  │                          │                       │── UPSERT ────────▶│
  │                          │                       │   user_cards       │
  │                          │                       │   (userId, cardId, │
  │                          │                       │    variant, qty)   │
  │                          │                       │◀── updated row ───│
  │◀── 200 {card, qty} ────│◀─────────────────────│                   │

On the client side, TanStack Query does an optimistic update:
the UI shows +1 immediately before the server responds.
If the request fails, it rolls back.
```

---

### Flow 4: View Collection Completion

```
User opens "My Collection" for Origins set

Browser                    Caddy              Hono                  Postgres
  │                          │                       │                   │
  │── GET /api/collection/ ─▶│── proxy ────────────▶│                   │
  │   ?set=origins           │                       │                   │
  │   Cookie: session=abc123 │                       │── Complex query: ─▶│
  │                          │                       │                   │
  │   Response:              │                       │   SELECT           │
  │   {                      │                       │     c.*,           │
  │     total: 200,          │                       │     uc.quantity,   │
  │     owned: 142,          │                       │     uc.variant     │
  │     completion: 0.71,    │                       │   FROM cards c     │
  │     missing: [...],      │                       │   LEFT JOIN        │
  │     byRarity: {          │                       │     user_cards uc  │
  │       common: 60/80,     │                       │     ON c.id =      │
  │       rare: 40/50,       │                       │     uc.card_id     │
  │       ...                │                       │     AND uc.user_id │
  │     }                    │                       │     = $userId      │
  │   }                      │                       │   WHERE c.set_id   │
  │                          │                       │     = 'origins'    │
  │◀── JSON ────────────────│◀─────────────────────│◀──────────────────│
```

---

### Flow 5: Deployment (CI/CD)

```
Developer pushes to main branch on GitHub

GitHub Actions
  │
  ├── pnpm install
  ├── pnpm build             (Turborepo builds shared → web + api)
  │
  ├── SSH into Hetzner VPS
  │     │
  │     ├── rsync apps/web/dist/ → /opt/riftbound/data/web/
  │     │   (Caddy picks up new static files immediately, no restart)
  │     │
  │     ├── rsync full repo (or just api/) → /opt/riftbound/
  │     ├── docker compose build api
  │     └── docker compose up -d api
  │         (Caddy + Postgres stay running, zero-downtime for static)
  │
  └── done (< 90 seconds typically)
```

Alternative: build the API Docker image in GitHub Actions, push to
GitHub Container Registry (ghcr.io, free for public repos), and
just `docker compose pull && docker compose up -d` on the VPS.
Avoids building on the small VPS.

---

### Flow 6: Disaster Recovery

```
VPS dies or you want to migrate to a new server

New VPS
  │
  ├── Install Docker
  ├── git clone your repo
  ├── Copy .env.production (from password manager / secrets)
  ├── Restore Postgres backup:
  │     cat backup.sql | docker exec -i db psql -U riftbound_app riftbound
  ├── rsync card images from backup / old server
  ├── docker compose up -d
  ├── Update Cloudflare DNS to new IP
  └── Caddy auto-provisions new TLS cert
      │
      └── Back online in ~15 minutes
```

This is the main advantage of Docker-everything: your entire
infrastructure is code. The only stateful things are the Postgres
data (backed up daily) and card images (which are scraped/imported
and can be regenerated).

---

### Flow 7: Future React Native App

```
                    ┌──────────────────────────┐
                    │  Monorepo addition:       │
                    │  apps/mobile/ (Expo)      │
                    │  imports from packages/   │
                    │  shared/ (same types,     │
                    │  same Zod schemas)        │
                    └──────────┬───────────────┘
                               │
                               │ Same HTTPS API calls
                               │ to riftbound.app/api/*
                               ▼
                    ┌──────────────────────────┐
                    │  Hono API (unchanged)     │
                    │                           │
                    │  Only difference: mobile  │
                    │  uses token-based auth    │
                    │  (Bearer header) instead  │
                    │  of cookies, since native │
                    │  apps don't have cookies. │
                    │  Better Auth supports     │
                    │  both out of the box.     │
                    └──────────────────────────┘
```

The API doesn't change at all. The mobile app is just another
client. The shared package means your card types, validation
schemas, and utility functions are reused — you only build
the UI layer fresh in React Native.

---

## Caddyfile

```caddyfile
riftbound.app {
    # API — proxy to Hono container (checked first)
    handle /api/* {
        reverse_proxy api:3000
    }

    # Card images — static files with aggressive caching
    handle /cards/* {
        root * /var/www
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }

    # SPA — serve static files, fall back to index.html for client routing
    handle {
        root * /var/www/web
        try_files {path} /index.html
        file_server
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Compression
    encode gzip zstd
}
```

---

## Security Model Summary

```
Internet
  │
  │  Only ports 80 + 443 open (Caddy container)
  │
  ▼
┌─────────┐     frontend network     ┌──────────┐    backend network    ┌──────────┐
│  Caddy  │◄────────────────────────►│   Hono   │◄────────────────────►│ Postgres │
│         │                          │          │                       │          │
│ Public  │  Can't reach db:5432     │ Bridges  │  Validates all input  │ Isolated │
│ facing  │  (different network)     │ both     │  Checks auth session  │ No ports │
│         │                          │ networks │  Parameterized queries│ exposed  │
└─────────┘                          └──────────┘                       └──────────┘

Auth: httpOnly Secure SameSite=Lax cookies (Better Auth)
  → JS can't read the token (XSS safe)
  → Browser sends it automatically (no localStorage)
  → SameSite=Lax prevents CSRF on mutations

DB access: riftbound_app user with only CONNECT, SELECT, INSERT,
  UPDATE, DELETE on application tables. No CREATE, DROP, or
  superuser privileges.
```

---

## Summary

| Component      | Technology              | Where                     | Exposed?         |
|----------------|-------------------------|---------------------------|------------------|
| CDN / DNS      | Cloudflare (free)       | Cloudflare edge           | Public           |
| Reverse proxy  | Caddy (container)       | Hetzner VPS, ports 80+443 | Public           |
| Frontend SPA   | Vite + React            | Host volume → Caddy       | Public via Caddy |
| Card images    | Static .webp files      | Host volume → Caddy       | Public via Caddy |
| API server     | Hono + Better Auth      | Container, port 3000      | Only via Caddy   |
| Database       | Postgres 16 (container) | Container, port 5432      | Only via API     |
| Monorepo       | Turborepo               | GitHub                    | —                |
| CI/CD          | GitHub Actions          | GitHub                    | —                |
| **Total cost** |                         |                           | **~€4/month**    |

**One monorepo, three packages** (web, api, shared).
**Three containers** (Caddy, Hono, Postgres) orchestrated by Docker Compose.
**Two Docker networks** (frontend, backend) for isolation.
**One deployment target** (Hetzner VPS).
**Fifteen-minute disaster recovery** (Docker + backup restore).