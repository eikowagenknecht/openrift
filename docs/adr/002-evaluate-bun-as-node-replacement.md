# ADR-002: Evaluate Bun as Node.js Replacement

**Date:** 2026-02-25
**Status:** Pending
**Deciders:** @eiko

## Context

The project runs on Node.js 22 across the stack: Vite dev server, Hono API server (`@hono/node-server`), database migrations/seeds (via `node --import tsx`), and the production Docker image (`node:22-alpine`). TypeScript execution requires the `tsx` package, and the PostgreSQL driver is `pg` (node-postgres) accessed through Kysely's `PostgresDialect`.

Bun is a JavaScript runtime with native TypeScript execution, built-in `.env` loading, and — as of Bun 1.2+ — a built-in zero-dependency PostgreSQL client (`Bun.sql`). It is MIT-licensed with strong long-term corporate backing.

This ADR documents the feasibility analysis and recommended migration path.

## Analysis

### Current Node.js usage

| Area | How Node is used | Files involved |
|------|-----------------|----------------|
| **API server** | `@hono/node-server` adapter, started via `node --import tsx --watch` | `apps/api/src/index.ts`, `apps/api/package.json` |
| **Database driver** | `pg` (node-postgres) pool via Kysely `PostgresDialect` | `packages/shared/src/db/connect.ts` |
| **Migrations/seeds** | `node --env-file-if-exists=../../.env --import tsx` | `packages/shared/package.json` scripts |
| **Build tooling** | Vite 7.3, Turbo 2.8, oxlint/oxfmt | `apps/web/vite.config.ts`, `turbo.json` |
| **Docker** | `node:22-alpine` base image, `node dist/index.js` CMD | `Dockerfile` |
| **Node APIs in source** | `node:fs`, `node:path`, `node:url` in scripts; `node:child_process` in vite config; `process.env` throughout | `packages/shared/src/db/migrate.ts`, `seed.ts`, `scripts/` |

### Kysely usage is minimal

Only 7 queries exist across the entire codebase: 3 SELECTs in the cards route, 1 health-check raw SQL, 2 upserts in the seed script, and 1 DELETE. There are no joins, transactions, or complex WHERE clauses. Two migration files use the schema builder. This makes driver swaps low-risk.

### Bun compatibility assessment

| Component | Compatible? | Notes |
|-----------|-------------|-------|
| `node:fs`, `node:path`, `node:url` | Yes | Bun supports these natively |
| `process.env` / `process.exit()` | Yes | Fully supported |
| ESM (`"type": "module"`) | Yes | Already set in all package.json files |
| Vite, Turbo, oxlint/oxfmt | Yes | Runtime-independent tooling |
| Hono | Yes | Hono has first-class Bun support; swap `@hono/node-server` for Bun's native server |
| `pg` via Node compat | Yes | Works but uses Node compatibility layer, not native |
| Native C++ addons | N/A | None in the project (no bcrypt, sharp, node-gyp, etc.) |
| `node --env-file-if-exists` flag | No | Bun does not support this flag; not needed since Bun loads `.env` by default |
| `--import tsx` | No | Not needed; Bun runs TypeScript natively |

### Database layer: `kysely-postgres-js` bridges Kysely and Bun.sql

The [`kysely-postgres-js`](https://github.com/kysely-org/kysely-postgres-js) package (maintained by the Kysely core team) supports Bun's native `SQL` class as of v3.0.0. This means Kysely queries, migrations, and type definitions remain unchanged — only the dialect configuration changes:

```typescript
// Before (Node + pg)
import { Pool } from "pg";
import { PostgresDialect } from "kysely";
new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
});

// After (Bun + native SQL)
import { SQL } from "bun";
import { PostgresJSDialect } from "kysely-postgres-js";
new Kysely<Database>({
  dialect: new PostgresJSDialect({ postgres: new SQL(connectionString) }),
});
```

### Bun.sql caveats

Bun.sql is comprehensive (transactions, connection pooling, prepared statements, savepoints) but has open issues relevant to this project:

- **`TEXT[]` array handling** ([oven-sh/bun#17798](https://github.com/oven-sh/bun/issues/17798)) — the schema uses `text[]` for `keywords`, `super_types`, and `tags`. Kysely's parameterization may insulate us, but this needs verification.
- **Connection pool leak during hot reload** ([oven-sh/bun#23215](https://github.com/oven-sh/bun/issues/23215)) — workaround: store the SQL instance on `globalThis` in dev.
- **No `LISTEN`/`NOTIFY`** — not currently used, but worth noting if real-time features are planned.
- **No built-in migration framework** — not an issue since Kysely's `FileMigrationProvider` + `Migrator` handles this.

### What Bun eliminates

- `tsx` package — Bun runs `.ts` natively
- `--env-file-if-exists` flags — Bun loads `.env` automatically
- `@hono/node-server` — Hono runs natively on Bun
- `pg` driver — replaced by Bun's built-in `SQL`

## Decision (Pending)

Migrate from Node.js to Bun using a phased approach:

### Phase 1 — Dev scripts (low risk)

Replace `node --env-file-if-exists=../../.env --import tsx` with `bun` in all package.json scripts. Remove `tsx` dependency. Verify migrations, seeds, and the API dev server work correctly — particularly queries involving `text[]` columns.

### Phase 2 — API server adapter

Replace `@hono/node-server` with Bun's native server. Swap `PostgresDialect` + `pg` for `PostgresJSDialect` + `Bun.sql` via `kysely-postgres-js`. Remove `pg` and `@hono/node-server` dependencies.

### Phase 3 — Docker and deployment

Update `Dockerfile` from `node:22-alpine` to `oven/bun:1-alpine`. Update CMD from `node dist/index.js` to `bun dist/index.js`. Verify production behavior under load.

### Fallback

If Bun.sql issues surface (especially with `text[]` arrays), the project can run `pg` under Bun's Node compatibility layer with no code changes beyond reverting the dialect. Kysely's abstraction makes this a one-line swap.

### Rationale

**Arguments for migrating:**

- Removes 3 dependencies (`tsx`, `pg`, `@hono/node-server`) and simplifies script invocations.
- Native TypeScript execution and `.env` loading reduce tooling friction.
- Bun's native PostgreSQL bindings avoid the Node compatibility layer overhead.
- `kysely-postgres-js` is maintained by the Kysely core team and is production-ready, so Kysely queries and migrations remain untouched.
- Hono has first-class Bun support — no adapter needed.
- Bun has strong long-term backing and an MIT license.

**Arguments against migrating:**

- `TEXT[]` array issue in Bun.sql is open and directly relevant to the schema.
- Connection pool leak during hot reload requires a `globalThis` workaround in dev.
- `pg` (node-postgres) is battle-tested over 10+ years; Bun.sql is ~1 year old.
- Adds Bun as a runtime requirement for all contributors.
- pnpm workspace compatibility with Bun needs testing (or a switch to Bun's built-in workspaces).
