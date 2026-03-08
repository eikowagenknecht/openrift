---
status: rejected
date: 2026-02-25
---

# ADR-003: Adopt SSR via TanStack Start

## Context and Problem Statement

OpenRift is currently a Vite + React 19 single-page application with a separate Hono API server (`apps/web` + `apps/api`), deployed as three Docker containers (nginx serving static files, Node.js API, PostgreSQL) behind Cloudflare and host nginx on a Hetzner VPS.

TanStack Start is a full-stack React framework built on TanStack Router and Nitro. It offers server-side rendering (SSR), file-based routing, type-safe server functions, and a single deployable artifact. The question is whether migrating to TanStack Start would meaningfully benefit OpenRift.

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

Chosen option: "Keep the current Vite SPA + Hono architecture", because the migration cost is disproportionate to the benefit, framework maturity is insufficient for a production bet, and the standalone API is an asset for a future mobile app.

**The current architecture is working well.** The SPA loads fast (Vite builds are small, Cloudflare caches aggressively), the Hono API is clean and lightweight, and the deployment is stable. There is no user-facing pain that SSR would solve — OpenRift is a card collection browser, not a content site that needs SEO or instant first-paint for engagement.

**The migration cost is disproportionate to the benefit.** Nearly every frontend file would be touched. The nuqs → TanStack Router migration alone is substantial (every filter, sort, and view state parameter). The React Query → loader migration rewrites all data fetching. This is weeks of work for a lateral move in user experience.

**Framework maturity is insufficient for a production bet.** The Nitro v2 → v3 transition is in progress, the "Vite-native" mode is coming, and the community deployment ecosystem is still forming (Coolify guides are months old, Docker patterns are community-sourced, not official). Migrating now means migrating again when the framework stabilizes.

**The mobile app consideration tips the balance.** If a mobile app is on the roadmap, the standalone Hono API becomes an asset, not a liability. It can serve both the web frontend and mobile clients without modification. Merging it into server functions would create an extraction problem later.

### Consequences

- Good, because the current architecture remains stable and performant.
- Good, because the Hono API stays standalone, ready to serve future mobile clients.
- Bad, because there's no SSR for SEO or social media embeds.
- Neutral, because TanStack Start should be re-evaluated when it reaches stable maturity or when a natural rewrite opportunity arises.
- Neutral, because if SEO becomes a requirement before then, SSR can be added to specific routes via Vike rather than a full framework migration.

### What would change this decision

- TanStack Start reaches stable maturity with a settled build pipeline (Nitro v3 or Vite-native) and official deployment guides.
- SEO becomes a requirement — e.g., public card pages that need to rank in search results, social media embeds with card previews.
- The API is not needed standalone — i.e., no mobile app or third-party consumers are planned.
- A natural rewrite opportunity — e.g., a major feature that would require reworking routing and data fetching anyway.

## Architecture If Adopted

For reference, this is what the production architecture would look like with TanStack Start. The Hono API stays as a standalone service so that mobile clients can consume it directly.

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

**Key changes from current architecture:**

- The `web` container runs TanStack Start (Node.js with SSR) instead of nginx serving static files. Browser requests get server-rendered HTML on first load, then hydrate into a SPA.
- Server functions replace React Query fetches for the web app — data loads happen on the server during SSR, eliminating the web → API round-trip for initial page loads.
- The Hono API container stays unchanged, serving mobile app clients (and any future third-party consumers) via the same REST endpoints.
- Both the Start server and Hono API connect to PostgreSQL via a shared query layer in `packages/shared` — the same Kysely query functions, row-to-domain mapping, and TypeScript types. This guarantees both servers return identical data for the same request. Hono routes and Start server functions become thin wrappers over the shared layer.
- Host nginx routes `/api/*` to Hono and everything else to the Start server.
- Memory footprint increases: the Start server needs ~200–400 MB for SSR vs ~10 MB for the current nginx container.
- Two different server stacks coexist: TanStack Start runs on Nitro (h3), while the API stays on Hono. The `packages/shared` layer (types, Kysely queries, Zod schemas) is shared, but the server code itself doesn't converge.

## Pros and Cons of the Options

### Migrate to TanStack Start

- Good, because SSR with streaming improves perceived load time and SEO.
- Good, because server functions replace the REST API layer, eliminating manual fetch code, Zod request validation, and the separate Hono server.
- Good, because type-safe file-based routing replaces nuqs for URL state, with route-level data loaders that run on the server during SSR.
- Good, because deployment simplifies from 3 containers (web + api + db) to 2 (app + db).
- Bad, because TanStack Start is at 1.x but effectively RC quality — the API surface is still shifting (Nitro v2 → v3, upcoming "Vite-native" mode).
- Bad, because the refactor touches nearly every frontend layer: nuqs → TanStack Router search params, React Query → route loaders, Hono → server functions, Vite SPA → Nitro SSR, PWA service worker rethinking.
- Bad, because SSR requires ~200–400 MB resident memory vs ~50–100 MB for nginx + Hono on a Hetzner CX22 (4 GB RAM).
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
