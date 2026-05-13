---
status: accepted
date: 2026-02-25
---

# ADR-003: Adopt SSR via TanStack Start

## Context and Problem Statement

OpenRift was originally a Vite + React 19 single-page application with a separate Hono API server (`apps/web` + `apps/api`), deployed as three Docker containers (nginx serving static files, Node.js API, PostgreSQL) behind Cloudflare and host nginx on a Hetzner VPS.

TanStack Start is a full-stack React framework built on TanStack Router and Nitro. It offers server-side rendering (SSR), file-based routing, type-safe server functions, and a single deployable artifact. The question was whether migrating to TanStack Start would meaningfully benefit OpenRift.

## Decision Drivers

- SSR with streaming would improve perceived load time and SEO
- Server functions would eliminate the REST API layer and manual fetch code
- Type-safe file-based routing would replace nuqs for URL state
- Simpler deployment (single artifact vs 3 Docker containers)
- Framework maturity risk (RC quality, shifting API surface)
- Large migration scope touching nearly every frontend layer
- A future mobile app requires a standalone API

## Considered Options

- Migrate to TanStack Start
- Keep SPA, add SSR via a lightweight layer (e.g., Vike)
- Adopt Next.js or Remix
- Keep the current Vite SPA + Hono architecture

## Decision Outcome

Chosen option: "Migrate to TanStack Start", because SEO became a real requirement (public card pages, social embeds), the framework matured to a point where the build pipeline and deployment patterns were stable enough to commit, and the Hono API can stay standalone for any future mobile client.

This is a reversal of the original 2026-02-25 verdict ("Keep the current Vite SPA + Hono architecture"). The factors that flipped the decision are the same ones called out at the time as "what would change this decision": the framework stabilized, SEO mattered after all, and the architecture below keeps the Hono API standalone — so the mobile-app concern from the original analysis is preserved.

### Consequences

- Good, because public card and rules pages can render server-side for SEO and social embeds.
- Good, because route loaders eliminate the web → API round-trip for initial page loads.
- Good, because the Hono API stays standalone, ready to serve future mobile clients.
- Bad, because nearly every frontend file was touched — nuqs was replaced with TanStack Router search params (see ADR-004), React Query usage shifted to route loaders for data needed at first paint, and the PWA service worker was reworked.
- Bad, because SSR requires ~200–400 MB resident memory vs. ~50–100 MB for the previous nginx + Hono setup.
- Neutral, because two server stacks now coexist (TanStack Start on Nitro/h3 for the web, Hono for the API), connected only through the shared types in `packages/shared`.

## Production Architecture

The Hono API stays as a standalone service so that mobile clients can consume it directly.

```plaintext
                  Internet
                      │
                ┌─────▼──────┐
                │ Cloudflare  │  CDN, DDoS protection, DNS proxy
                └──┬──────┬──┘
                   │      │
         Browser   │      │   Mobile app
         (SSR)     │      │   (REST API)
                   │      │
┌──────────────────▼──────▼──────────────────────────────────────┐
│  Hetzner VPS        :443                                       │
│                     │                                          │
│  ┌──────────────────▼───────┐                                  │
│  │ Host nginx               │   TLS termination                │
│  │ :443                     │   (Cloudflare Origin Cert)       │
│  └────────┬─────────┬───────┘                                  │
│           │         │                                          │
│      /app/*     /api/*                                         │
│           │         │                                          │
│  ┌────────▼─────────▼────────────────────────────────────────┐ │
│  │ Docker Compose                                            │ │
│  │                                                           │ │
│  │  ┌──────────────────────────┐                             │ │
│  │  │ web (TanStack Start)     │  SSR + server functions     │ │
│  │  │ :3001                    │  Serves browser clients     │ │
│  │  └──┬───────────────────────┘                             │ │
│  │     │                                                     │ │
│  │     │  ┌─────────────────────────┐                        │ │
│  │     │  │ api (node:22-alpine)    │  Hono - REST API       │ │
│  │     │  │ :3000                   │  Serves mobile clients │ │
│  │     │  └──┬──────────────────────┘                        │ │
│  │     │     │                                               │ │
│  │     ▼     ▼                                               │ │
│  │  ┌─────────────────────────┐                              │ │
│  │  │ db (postgres:16-alpine) │  PostgreSQL - Database       │ │
│  │  │ :5432                   │  Persistent volume (pg_data) │ │
│  │  └─────────────────────────┘                              │ │
│  │                                                           │ │
│  │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                              │ │
│  │  | migrate (tools profile) |   One-off migration runner   │ │
│  │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                              │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Key changes from the original architecture:**

- A new `web` container runs the TanStack Start SSR server (Bun). Browser requests get server-rendered HTML on first load, then hydrate into a SPA. nginx stays in the stack as a proxy and serves the hashed client bundles directly.
- Route loaders and server functions handle data needed at first paint, so the initial render isn't blocked by a web → API round-trip. React Query is still in use for client-side queries after hydration; the ADR's original phrasing ("server functions replace React Query") was an overshoot.
- The Hono API container stays unchanged, serving mobile clients and any future third-party consumers via the same REST endpoints.
- Both the Start server and Hono API connect to PostgreSQL via the shared layer in `packages/shared` — the same TypeScript types and Zod schemas. The server code itself (Hono vs. Nitro/h3) does not converge.
- Host nginx routes `/api/*` to Hono and everything else to the Start server (which itself sits behind the in-stack nginx proxy stage).
- Memory footprint increases: the Start server needs ~200–400 MB for SSR vs. ~10 MB for the original static-only nginx setup.

## Pros and Cons of the Options

### Migrate to TanStack Start

- Good, because SSR with streaming improves perceived load time and SEO.
- Good, because server functions replace the REST API layer, eliminating manual fetch code, Zod request validation, and the separate Hono server.
- Good, because type-safe file-based routing replaces nuqs for URL state, with route-level data loaders that run on the server during SSR.
- Good, because deployment simplifies from 3 containers (web + api + db) to 2 (app + db).
- Bad, because TanStack Start is at 1.x but effectively RC quality — the API surface is still shifting (Nitro v2 → v3, upcoming "Vite-native" mode).
- Bad, because the refactor touches nearly every frontend layer: nuqs → TanStack Router search params, React Query → route loaders, Hono → server functions, Vite SPA → Nitro SSR, PWA service worker rethinking.
- Bad, because SSR requires ~200–400 MB resident memory vs ~50–100 MB for nginx + Hono on a Hetzner CPX32 (8 GB RAM).
- Bad, because server functions are not callable from external clients — a future mobile app would need the API extracted back out or kept alongside.

### Keep SPA, add SSR via a lightweight layer

Use a minimal SSR wrapper (e.g., `vite-plugin-ssr` / Vike) to add server rendering to the existing Vite app without adopting a full framework.

- Good, because it preserves the current architecture while gaining SSR for specific routes.
- Good, because it's incrementally adoptable later without a framework commitment.
- Bad, because SSR is not currently needed.

### Adopt Next.js or Remix

More mature full-stack React frameworks with larger ecosystems and proven deployment patterns.

- Good, because they are more mature than TanStack Start with larger ecosystems.
- Good, because they have proven deployment patterns.
- Bad, because the migration cost is not justified by current needs (same core objection).
- Bad, because the mobile app consideration still favors keeping a standalone API.
