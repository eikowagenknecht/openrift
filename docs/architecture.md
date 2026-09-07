# Architecture

OpenRift is a Turborepo monorepo: a TanStack Start frontend, a Hono API server that implements oRPC contracts, a Discord bot, a browser extension, and a shared types/logic package, backed by PostgreSQL.

```plaintext
openrift/
├── apps/
│   ├── api/              # Hono + oRPC API server, migrations, jobs (Bun)
│   ├── discord-bot/      # Discord card-lookup bot (Bun)
│   ├── extension/        # Browser extension that sends decklists to OpenRift (WXT)
│   └── web/              # TanStack Start SSR app (Bun)
├── nginx/                # Nginx configs (container + host)
├── packages/
│   ├── e2e/              # Playwright end-to-end tests
│   └── shared/           # Types, oRPC contracts, zod schemas, card logic
├── docker-compose.yml    # Dev: just Postgres. Prod: all services.
└── Dockerfile            # Multi-stage build (api, web, proxy)
```

## Packages

### `apps/web`: Frontend

TanStack Start app with streaming SSR, built on React 19 and TanStack Router. Data fetching goes through server functions: each one builds a typed oRPC client from the contract in `@openrift/shared/contracts/<module>` (`apiOrpcClient` in `src/lib/server-fns/orpc-client.ts`), calls the API over HTTP, and hands the result to React Query. Filter, sort and view state lives in TanStack Router search params, so every view is a shareable link (ADR-004).

In production, the Start server runs on Bun and streams HTML using `<Suspense>` boundaries. An nginx reverse proxy (`proxy` container) sits in front, serving static assets directly and proxying everything else to the SSR server.

**Key libraries:**

- [TanStack Start](https://tanstack.com/start): SSR framework with streaming and server functions
- [shadcn/ui](https://ui.shadcn.com/) (base-nova style): component primitives, built on [Base UI](https://base-ui.com/), [Tailwind CSS 4](https://tailwindcss.com/) and [Lucide](https://lucide.dev/) icons
- [React Compiler](https://react.dev/learn/react-compiler): auto-memoizes components and hooks
- [TanStack Router](https://tanstack.com/router): file-based routing with type-safe search params
- [React Query](https://tanstack.com/query): data fetching and caching
- [oRPC](https://orpc.unnoq.com/) client: typed calls against the shared contracts over the OpenAPI link
- [Zustand](https://zustand.docs.pmnd.rs/): client-side state (ADR-006)
- [TanStack Virtual](https://tanstack.com/virtual): virtualized scrolling for the card grid
- [Nitro](https://nitro.build/): production server preset (Bun)

### `apps/api`: Backend

[Hono](https://hono.dev/) server on [Bun](https://bun.sh/) with [Kysely](https://kysely.dev/) as the query builder against [PostgreSQL](https://www.postgresql.org/). Nearly every endpoint is an [oRPC](https://orpc.unnoq.com/) procedure: the contract (input and output zod schemas, HTTP method and path) lives in `packages/shared/src/contracts/`, the API implements it in `src/routes/{public,authenticated,admin}/`, and one `OpenAPIHandler` mounted under `/api/v1` serves them all. The same contracts generate the OpenAPI document (`/api/doc`, browsable at `/api/ui`) and the typed client the web app uses, so a route's wire shape is declared once. A handful of routes that do not speak JSON stay plain Hono: health, the Sentry tunnel, one-click unsubscribe, the chat-bot text endpoint, oEmbed, and the share-image renderers.

Sessions and accounts are [better-auth](https://www.better-auth.com/); see [Authentication](authentication.md). The API container also runs migrations on startup and the in-process job scheduler.

See [Data Layer](data-layer.md) for the schema and [contributing.md](contributing.md) ("API module layout") for where code goes.

### `apps/discord-bot`: Discord Bot

Stateless [discord.js](https://discord.js.org/) bot answering card-name lookups (`/card` slash command and `[[card name]]` message references) with the card image, a link to the card page, and marketplace prices. Reads everything from the public API; no database access. See [discord-bot.md](discord-bot.md).

### `apps/extension`: Browser Extension

Cross-browser extension (Chrome MV3, Firefox) built with [WXT](https://wxt.dev/) that sends the decklist on an external deck site to OpenRift. See [extension.md](extension.md).

### `packages/shared`: Shared Logic

Consumed by every app. Holds the oRPC contracts, the wire types and zod schemas, the enum well-knowns, and the pure card logic (filters, deck rules, deck codecs, scan geometry, pairing). There is no barrel: consumers import the leaf module (`@openrift/shared/deck-rules`), which keeps each consumer's bundle to what it uses. Database migrations live in `apps/api/src/db/migrations/`.

### `packages/e2e`: End-to-End Tests

Playwright specs that run against a real browser and a temporary database. See [testing.md](testing.md).

## Code layout

Both apps are layered, and imports only point down: `lib` < `stores` < `hooks` < `components` < `routes` in the web app, `db` < `repositories` < `lib` < `services` < `routes` in the API. oxlint enforces the direction per directory, type imports included, so a directory name tells you what a module may depend on. The rules, what belongs in each layer, and the shared-package import rule are in [contributing.md](contributing.md); the decision is [ADR-046](adr/046-layered-module-layout.md).

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
The `api` container runs migrations on startup and schedules jobs in-process from the `job_schedules` table; each job is off until enabled on `/admin/jobs`.

**Request flow:** Cloudflare terminates the public TLS connection and forwards traffic to host nginx, which terminates a second TLS hop using a Cloudflare Origin Certificate. Host nginx proxies everything to the `proxy` container on `:8080`. The `proxy` container serves static assets (hashed JS/CSS, card images) directly and proxies all other requests to the `web` container (TanStack Start SSR on `:3001`). The `web` container renders pages server-side using server functions that call the `api` container over HTTP. `/api/*` requests are proxied directly from `proxy` to `api`.
