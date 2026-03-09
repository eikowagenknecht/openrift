# Architecture

OpenRift is a Turborepo monorepo with a React frontend, a Hono API server, and a shared types/logic package, backed by PostgreSQL.

```plaintext
openrift/
├── apps/
│   ├── api/              # Hono API server (Bun)
│   └── web/              # Vite + React 19 SPA
├── nginx/                # Nginx configs (container + host)
├── packages/
│   └── shared/           # Types, schemas, filters, DB migrations
├── docker-compose.yml    # Dev: just Postgres. Prod: all services.
└── Dockerfile            # Multi-stage build (api, web)
```

## Packages

### `apps/web` — Frontend

Vite + React 19 single-page app with TanStack Router. Filter/sort state is synced to URL query parameters via nuqs. The app is installable as a PWA with offline image caching.

For PR previews, the built SPA is deployed to Cloudflare Workers. A thin Worker script (`src/worker.ts`) proxies `/api/*` requests to the preview backend, keeping all requests same-origin so auth cookies work on mobile browsers without cross-site tracking exceptions.

**Key libraries:**

- [shadcn/ui](https://ui.shadcn.com/) (base-nova style) — component primitives, built on [Base UI](https://base-ui.com/), [Tailwind CSS 4](https://tailwindcss.com/) and [Lucide](https://lucide.dev/) icons
- [React Compiler](https://react.dev/learn/react-compiler) — auto-memoizes components and hooks
- [TanStack Router](https://tanstack.com/router) — file-based routing with type-safe search params
- [React Query](https://tanstack.com/query) — data fetching and caching for API calls
- [nuqs](https://nuqs.47ng.com/) — syncs filter/sort state to URL query params (every view is a shareable link)
- [TanStack Virtual](https://tanstack.com/virtual) — virtualized scrolling for the card grid
- [Vite PWA](https://vite-pwa-org.netlify.app/) — service worker generation, offline support, install prompt

### `apps/api` — Backend

Lightweight [Hono](https://hono.dev/) server on [Bun](https://bun.sh/). Uses [Kysely](https://kysely.dev/) as a type-safe query builder with [PostgreSQL](https://www.postgresql.org/). Exposes a REST API consumed by the frontend.

See [Data Layer](data-layer.md) for endpoints and schema. See [Authentication](authentication.md) for the account creation and session management flows.

### `packages/shared` — Shared Logic

Consumed by both `apps/web` and `apps/api`. Contains shared TypeScript types, Zod validation schemas, card filter/sort logic, and Kysely database migrations.

## Infrastructure

### Development

```plaintext
┌────────────────────────────────────────────────────────┐
│  Local machine                                         │
│                                                        │
│  ┌─────────────────────────┐                           │
│  │ Vite dev server         │  apps/web (HMR)           │
│  │ :5173                   │                           │
│  └──┬──────────────────────┘                           │
│     │ /api/*                                           │
│     ▼                                                  │
│  ┌─────────────────────────┐                           │
│  │ Hono (bun --watch)      │  apps/api (live reload)   │
│  │ :3000                   │                           │
│  └──┬──────────────────────┘                           │
│     │                                                  │
│     ▼                                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Docker Compose                                   │  │
│  │                                                  │  │
│  │  ┌─────────────────────────┐                     │  │
│  │  │ db (postgres:16-alpine) │  PostgreSQL         │  │
│  │  │ :5432                   │  Persistent volume  │  │
│  │  └─────────────────────────┘                     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Only the database runs in Docker (`docker compose up db`). The API and frontend run natively via `bun dev`.

### Production — Docker Compose (`openrift.app` / `preview.openrift.app`)

```plaintext
                  Internet
                      │
                ┌─────▼──────┐
                │ Cloudflare  │  CDN, DDoS protection, DNS proxy
                └─────┬──────┘
                      │
┌─────────────────────▼────────────────────────────────────────────┐
│  Hetzner VPS        │  :443                                      │
│                     ▼                                            │
│  ┌──────────────────────────┐                                    │
│  │ Host nginx               │   Nginx - TLS termination          │
│  │ :443                     │   (Cloudflare Origin Certificate)  │
│  └────────────┬─────────────┘                                    │
│               │ :8080                                            │
│  ┌────────────▼───────────────────────────────────────────────┐  │
│  │ Docker Compose                                             │  │
│  │                                                            │  │
│  │  ┌─────────────────────────┐                               │  │
│  │  │ web (nginx:alpine)      │  Nginx - reverse proxy        │  │
│  │  │ :8080                   │  SPA static files (apps/web)  │  │
│  │  └──┬──────────────────────┘                               │  │
│  │     │ /api/*                                               │  │
│  │     ▼                                                      │  │
│  │  ┌─────────────────────────┐                               │  │
│  │  │ api (distroless)        │  Hono API + migrations +      │  │
│  │  │ :3000                   │  cron (compiled binary)       │  │
│  │  └──┬──────────────────────┘                               │  │
│  │     │                                                      │  │
│  │     ▼                                                      │  │
│  │  ┌─────────────────────────┐                               │  │
│  │  │ db (postgres:16-alpine) │  PostgreSQL - Database        │  │
│  │  │ :5432                   │  Persistent volume (pg_data)  │  │
│  │  └─────────────────────────┘                               │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Images are pre-built in GitHub Actions and pulled from GHCR.
The `api` container runs migrations on startup and schedules price refresh cron jobs in-process.

**Request flow:** Cloudflare terminates the public TLS connection and forwards traffic to host nginx, which terminates a second TLS hop using a Cloudflare Origin Certificate. Host nginx proxies everything to the `web` container on `:8080`. The `web` container serves static SPA files for all routes and reverse-proxies `/api/*` to the `api` container via Docker DNS.
