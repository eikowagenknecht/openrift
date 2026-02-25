# ADR-002: Evaluate TanStack Start as a Replacement for the Vite SPA + Hono Architecture

**Date:** 2026-02-25
**Status:** Rejected
**Deciders:** @eiko

## Context

OpenRift is currently a Vite + React 19 single-page application with a separate Hono API server (`apps/web` + `apps/api`), deployed as three Docker containers (nginx serving static files, Node.js API, PostgreSQL) behind Cloudflare and host nginx on a Hetzner VPS.

TanStack Start is a full-stack React framework built on TanStack Router and Nitro. It offers server-side rendering (SSR), file-based routing, type-safe server functions, and a single deployable artifact. The question is whether migrating to TanStack Start would meaningfully benefit OpenRift.

### What TanStack Start would give us

- **SSR with streaming** — cards render in the initial HTML, improving perceived load time and SEO.
- **Server functions** — type-safe RPCs replace the REST API layer, eliminating manual fetch code, Zod request validation, and the separate Hono server.
- **Type-safe file-based routing** — TanStack Router replaces nuqs for URL state, with route-level data loaders that run on the server during SSR.
- **Simpler deployment** — a single `.output/` directory containing a standalone Node.js server, reducing Docker Compose from 3 containers (web + api + db) to 2 (app + db).
- **Collocated data fetching** — loaders defined per route replace the React Query fetch layer for server-rendered data.

### What TanStack Start would cost

- **RC maturity risk** — TanStack Start is at 1.x but effectively release-candidate quality. The API surface is still shifting (Nitro v2 → v3 transition, upcoming "Vite-native" mode that may remove the Nitro dependency entirely). Building on it means accepting periodic breaking changes.
- **Large migration scope** — the refactor touches nearly every layer of the frontend:
  - nuqs query-parameter state → TanStack Router search params
  - React Query data fetching → route loaders + server functions
  - Hono REST endpoints → server functions (or keep Hono alongside)
  - Vite SPA build → Nitro SSR build
  - PWA service worker → needs rethinking for SSR (cache strategies change)
- **Higher runtime resource usage** — SSR requires ~200–400 MB resident memory (React rendering on every request) vs ~50–100 MB for nginx serving static files + Hono handling API calls. On a Hetzner CX22 (4 GB RAM), this is manageable but tighter.
- **Mobile app story** — a future mobile app (React Native or native) needs a standalone API. Server functions are not callable from external clients. If we merge the API into server functions, we would later need to either: (a) extract them back into a standalone API, (b) expose server functions via an HTTP adapter, or (c) keep Hono alongside TanStack Start — negating much of the simplification.

## Decision

**Do not migrate to TanStack Start at this time.**

### Rationale

**The current architecture is working well.** The SPA loads fast (Vite builds are small, Cloudflare caches aggressively), the Hono API is clean and lightweight, and the deployment is stable. There is no user-facing pain that SSR would solve — OpenRift is a card collection browser, not a content site that needs SEO or instant first-paint for engagement.

**The migration cost is disproportionate to the benefit.** Nearly every frontend file would be touched. The nuqs → TanStack Router migration alone is substantial (every filter, sort, and view state parameter). The React Query → loader migration rewrites all data fetching. This is weeks of work for a lateral move in user experience.

**Framework maturity is insufficient for a production bet.** The Nitro v2 → v3 transition is in progress, the "Vite-native" mode is coming, and the community deployment ecosystem is still forming (Coolify guides are months old, Docker patterns are community-sourced, not official). Migrating now means migrating again when the framework stabilizes.

**The mobile app consideration tips the balance.** If a mobile app is on the roadmap, the standalone Hono API becomes an asset, not a liability. It can serve both the web frontend and mobile clients without modification. Merging it into server functions would create an extraction problem later.

### What would change this decision

- **TanStack Start reaches stable maturity** with a settled build pipeline (Nitro v3 or Vite-native) and official deployment guides.
- **SEO becomes a requirement** — e.g., public card pages that need to rank in search results, social media embeds with card previews.
- **The API is not needed standalone** — i.e., no mobile app or third-party consumers are planned.
- **A natural rewrite opportunity** — e.g., a major feature that would require reworking routing and data fetching anyway.

## Alternatives considered

### Keep SPA, add SSR via a lightweight layer

Use a minimal SSR wrapper (e.g., `vite-plugin-ssr` / Vike) to add server rendering to the existing Vite app without adopting a full framework. This preserves the current architecture while gaining SSR for specific routes (e.g., public card detail pages).

**Rejected** because SSR is not currently needed, and adding it incrementally is possible later without a framework commitment.

### Adopt Next.js or Remix instead

More mature full-stack React frameworks with larger ecosystems and proven deployment patterns.

**Rejected** for the same core reasons — the migration cost is not justified by current needs, and the mobile app consideration favors keeping a standalone API. If a framework migration ever becomes necessary, these should be evaluated alongside TanStack Start at that time.

## Consequences

- The current Vite SPA + Hono + Docker Compose architecture remains the production stack.
- The Hono API stays as a standalone service, ready to serve future mobile clients.
- TanStack Start should be re-evaluated when it reaches stable maturity or when a natural rewrite opportunity arises.
- If SEO becomes a requirement before then, consider adding SSR to specific routes via Vike or a similar lightweight approach rather than a full framework migration.
