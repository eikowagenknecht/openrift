# Architecture

OpenRift is a Turborepo monorepo with a React frontend, a Hono API server, and a shared types/logic package, backed by PostgreSQL.

```plaintext
openrift/
├── apps/
│   ├── api/              # Hono API server (Bun)
│   └── web/              # TanStack Start SSR app (Bun)
├── nginx/                # Nginx configs (container + host)
├── packages/
│   └── shared/           # Types, schemas, filters, DB migrations
├── docker-compose.yml    # Dev: just Postgres. Prod: all services.
└── Dockerfile            # Multi-stage build (api, web, proxy)
```

## Packages

### `apps/web` — Frontend

TanStack Start app with streaming SSR, built on React 19 and TanStack Router. Data fetching uses server functions that call the API over HTTP internally. Filter/sort state is synced to URL query parameters via nuqs.

In production, the Start server runs on Bun and streams HTML using `<Suspense>` boundaries. An nginx reverse proxy (`proxy` container) sits in front, serving static assets directly and proxying everything else to the SSR server.

**Key libraries:**

- [TanStack Start](https://tanstack.com/start) — SSR framework with streaming and server functions
- [shadcn/ui](https://ui.shadcn.com/) (base-nova style) — component primitives, built on [Base UI](https://base-ui.com/), [Tailwind CSS 4](https://tailwindcss.com/) and [Lucide](https://lucide.dev/) icons
- [React Compiler](https://react.dev/learn/react-compiler) — auto-memoizes components and hooks
- [TanStack Router](https://tanstack.com/router) — file-based routing with type-safe search params
- [React Query](https://tanstack.com/query) — data fetching and caching
- [nuqs](https://nuqs.47ng.com/) — syncs filter/sort state to URL query params (every view is a shareable link)
- [TanStack Virtual](https://tanstack.com/virtual) — virtualized scrolling for the card grid
- [Nitro](https://nitro.build/) — production server preset (Bun)

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
│  │ TanStack Start (Vite)   │  apps/web (HMR + SSR)    │
│  │ :5173                   │                           │
│  └──┬──────────────────────┘                           │
│     │ /api/auth/* (proxy)                              │
│     │ server fns call API internally                   │
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
│  │  │ db (postgres:18-alpine) │  PostgreSQL         │  │
│  │  │ :5432                   │  Persistent volume  │  │
│  │  └─────────────────────────┘                     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Only the database runs in Docker (`docker compose up db`). The API and frontend run natively via `bun dev`. In dev, server functions call the API at `localhost:3000` directly. Only `/api/auth/*` is proxied through Vite (needed for OAuth redirects and cookie setting).

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
│  │  │ proxy (nginx:alpine)    │  Nginx - reverse proxy        │  │
│  │  │ :8080                   │  Static assets + card images  │  │
│  │  └──┬──────────┬───────────┘                               │  │
│  │     │ /*       │ /api/*                                    │  │
│  │     ▼          ▼                                           │  │
│  │  ┌────────────────────┐  ┌─────────────────────────┐       │  │
│  │  │ web (bun:alpine)   │  │ api (bun:alpine)        │       │  │
│  │  │ :3001 (internal)   │  │ :3000                   │       │  │
│  │  │ TanStack Start SSR │  │ Hono API + migrations + │       │  │
│  │  └────────┬───────────┘  │ cron                    │       │  │
│  │           │ server fns   └──┬──────────────────────┘       │  │
│  │           └──────────────▶──┘                              │  │
│  │                          │                                 │  │
│  │                          ▼                                 │  │
│  │  ┌─────────────────────────┐                               │  │
│  │  │ db (postgres:18-alpine) │  PostgreSQL - Database        │  │
│  │  │ :5432                   │  Persistent volume            │  │
│  │  └─────────────────────────┘                               │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Images are pre-built in GitHub Actions and pulled from GHCR.
The `api` container runs migrations on startup and schedules price refresh cron jobs in-process.

**Request flow:** Cloudflare terminates the public TLS connection and forwards traffic to host nginx, which terminates a second TLS hop using a Cloudflare Origin Certificate. Host nginx proxies everything to the `proxy` container on `:8080`. The `proxy` container serves static assets (hashed JS/CSS, card images) directly and proxies all other requests to the `web` container (TanStack Start SSR on `:3001`). The `web` container renders pages server-side using server functions that call the `api` container over HTTP. `/api/*` requests are proxied directly from `proxy` to `api`.
