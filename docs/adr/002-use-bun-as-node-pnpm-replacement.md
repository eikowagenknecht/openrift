---
status: accepted
date: 2026-02-28
---

# ADR-002: Use Bun as Node.js and pnpm Replacement

## Context and Problem Statement

The project ran on Node.js 22 across the stack (Vite dev server, Hono API server via `@hono/node-server`, database migrations/seeds via `node --import tsx`, production Docker image `node:22-alpine`) and used pnpm 10.x as its package manager. This created a multi-tool setup: Node.js as runtime, `tsx` for TypeScript execution, pnpm for dependency management, and `pg` as the PostgreSQL driver.

Bun is a JavaScript runtime with native TypeScript execution, built-in `.env` loading, a built-in zero-dependency PostgreSQL client (`Bun.sql`), and workspace-aware package management. It is MIT-licensed with strong long-term corporate backing.

## Considered Options

### Runtime

- Migrate from Node.js to Bun
- Stay on Node.js

### Package manager

- Copy `package.json` files + `bun install --production` (chosen)
- `bun build --compile` (drop pnpm entirely)
- Keep `pnpm deploy` in Docker
- `turbo prune` + `bun install --production`
- Copy full `node_modules` from build

## Decision Outcome

We migrate fully to Bun, for both runtime and package management. It removes `tsx`, `pg`, and `@hono/node-server`, ends the dual-tool setup, and produces smaller Docker images.

### Runtime migration (phased)

**Phase 1, Dev scripts (low risk):** Replace `node --env-file-if-exists=../../.env --import tsx` with `bun` in all package.json scripts. Remove `tsx` dependency. Verify migrations, seeds, and the API dev server work correctly, particularly queries involving `text[]` columns.

**Phase 2, API server adapter:** Replace `@hono/node-server` with Bun's native server. Swap `PostgresDialect` + `pg` for `PostgresJSDialect` + `Bun.sql` via `kysely-postgres-js`. Remove `pg` and `@hono/node-server` dependencies.

**Phase 3, Docker and deployment:** Update `Dockerfile` from `node:22-alpine` to `oven/bun:1.3.14-alpine` (build stage uses the full Debian-based `oven/bun:1.3.14` so apt-installed `git` is available for the Sentry release tag). API stage runs `bun run apps/api/src/index.ts` against copied sources rather than a compiled binary. This keeps the migration runner in the same image and avoids a separate compile step. A second app stage on `oven/bun:1.3.14-alpine` runs the TanStack Start SSR server (`bun run .output/server/index.mjs`). An `nginx:alpine` stage serves the built static assets and acts as the reverse proxy.

### Package manager migration

1. **Root `package.json`**: Add `workspaces` field, replace `pnpm` script references with `bun`, set `packageManager` to `bun@1.3.9`, replace `pnpm.onlyBuiltDependencies` with `trustedDependencies`.
2. **Lockfile**: Replace `pnpm-lock.yaml` with `bun.lock` (migrated automatically by `bun install`).
3. **Removed files**: `pnpm-workspace.yaml` (replaced by `workspaces` in package.json), `.npmrc` (settings were pnpm-specific).
4. **Dockerfile**:
   - Build stage: `bun install --frozen-lockfile` replaces `pnpm install --frozen-lockfile`; `bun run build` builds the SSR bundle for the web app. No compile-to-binary step.
   - API stage: `oven/bun:1.3.14-alpine` with production deps installed natively (so `sharp` gets the musl binary), running `bun run apps/api/src/index.ts`. Migrations run from the same image.
   - Web stage: `oven/bun:1.3.14-alpine` running `bun run .output/server/index.mjs` (TanStack Start SSR server).
   - Proxy stage: `nginx:alpine` serves built static assets and reverse-proxies the app stages.
5. **Lefthook**: `pnpm exec` → `bunx`, `pnpm --filter ... exec` → `bun run --cwd`.
6. **Documentation**: All `pnpm` references updated to `bun` equivalents.

### Fallback

**Runtime:** If `Bun.sql` issues surface (especially with `text[]` arrays), the project can run `pg` under Bun's Node compatibility layer with no code changes beyond reverting the dialect. Kysely's abstraction makes this a one-line swap.

**Package manager:** If `bun install --production` against copied package.json files breaks (e.g., resolution differences vs. the build environment), the API stage can revert to copying the build's full `node_modules`. This is a Dockerfile-only change with no source code impact.

### Consequences

- Good, because it removes `tsx`, `pg`, and `@hono/node-server`, ending the dual-tool setup and simplifying script invocations.
- Good, because native TypeScript execution and `.env` loading reduce tooling friction.
- Good, because Bun's native PostgreSQL bindings avoid the Node compatibility layer, and `kysely-postgres-js` (maintained by the Kysely core team) keeps queries and migrations untouched.
- Good, because the alpine runtime image plus production-only `node_modules` is meaningfully smaller than the Node + pnpm equivalent, and contributors no longer need pnpm installed.
- Bad, because `TEXT[]` array handling in Bun.sql has an open issue directly relevant to the schema.
- Bad, because connection pool leak during hot reload requires a `globalThis` workaround in dev.
- Bad, because `pg` is battle-tested over 10+ years, and Bun.sql is ~1 year old.
- Neutral, because Bun's workspace support is stable but less mature than pnpm's.

## Pros and Cons of the Options

### Migrate from Node.js to Bun (runtime)

#### Current Node.js usage

| Area                    | How Node is used                                                                                             | Files involved                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **API server**          | `@hono/node-server` adapter, started via `node --import tsx --watch`                                         | `apps/api/src/index.ts`, `apps/api/package.json`           |
| **Database driver**     | `pg` (node-postgres) pool via Kysely `PostgresDialect`                                                       | `packages/shared/src/db/connect.ts`                        |
| **Migrations/seeds**    | `node --env-file-if-exists=../../.env --import tsx`                                                          | `packages/shared/package.json` scripts                     |
| **Build tooling**       | Vite 7.3, Turbo 2.8, oxlint/oxfmt                                                                            | `apps/web/vite.config.ts`, `turbo.json`                    |
| **Docker**              | `node:22-alpine` base image, `node dist/index.js` CMD                                                        | `Dockerfile`                                               |
| **Node APIs in source** | `node:fs`, `node:path`, `node:url` in scripts; `node:child_process` in vite config; `process.env` throughout | `packages/shared/src/db/migrate.ts`, `seed.ts`, `scripts/` |

#### Kysely usage is minimal

Only 7 queries exist across the entire codebase: 3 SELECTs in the cards route, 1 health-check raw SQL, 2 upserts in the seed script, and 1 DELETE. There are no joins, transactions, or complex WHERE clauses. Two migration files use the schema builder. This makes driver swaps low-risk.

#### Bun compatibility assessment

| Component                          | Compatible? | Notes                                                                                                                 |
| ---------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `node:fs`, `node:path`, `node:url` | Yes         | Bun supports these natively                                                                                           |
| `process.env` / `process.exit()`   | Yes         | Fully supported                                                                                                       |
| ESM (`"type": "module"`)           | Yes         | Already set in all package.json files                                                                                 |
| Vite, Turbo, oxlint/oxfmt          | Yes         | Runtime-independent tooling                                                                                           |
| Hono                               | Yes         | Hono has first-class Bun support; swap `@hono/node-server` for Bun's native server                                    |
| `pg` via Node compat               | Yes         | Works but uses Node compatibility layer, not native                                                                   |
| Native C++ addons                  | Yes         | `sharp` was added later for image processing; production deps are installed natively on alpine to get the musl binary |
| `node --env-file-if-exists` flag   | No          | Bun does not support this flag; not needed since Bun loads `.env` by default                                          |
| `--import tsx`                     | No          | Not needed; Bun runs TypeScript natively                                                                              |

#### Database layer: `kysely-postgres-js` bridges Kysely and Bun.sql

The [`kysely-postgres-js`](https://github.com/kysely-org/kysely-postgres-js) package (maintained by the Kysely core team) supports Bun's native `SQL` class as of v3.0.0. This means Kysely queries, migrations, and type definitions remain unchanged, only the dialect configuration changes:

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

#### Bun.sql caveats

Bun.sql covers transactions, connection pooling, prepared statements, and savepoints, but has open issues relevant to this project:

- **`TEXT[]` array handling** ([oven-sh/bun#17798](https://github.com/oven-sh/bun/issues/17798)): the schema uses `text[]` for `keywords`, `super_types`, and `tags`. Kysely's parameterization may insulate us, but this needs verification.
- **Connection pool leak during hot reload** ([oven-sh/bun#23215](https://github.com/oven-sh/bun/issues/23215)): workaround is to store the SQL instance on `globalThis` in dev.
- **No `LISTEN`/`NOTIFY`**: not currently used, but relevant if real-time features are planned.
- **No built-in migration framework**: not an issue since Kysely's `FileMigrationProvider` + `Migrator` handles this.

#### What Bun eliminates

- `tsx` package: Bun runs `.ts` natively
- `--env-file-if-exists` flags: Bun loads `.env` automatically
- `@hono/node-server`: Hono runs natively on Bun
- `pg` driver: replaced by Bun's built-in `SQL`

- Good, because Hono has first-class Bun support, no adapter needed.
- Good, because Bun has strong long-term backing and an MIT license.
- Bad, because it adds Bun as a runtime requirement for all contributors.

### Stay on Node.js

- Good, because `pg` is battle-tested and stable.
- Bad, because `tsx` dependency is still needed for TypeScript execution.
- Bad, because script invocations require `--env-file-if-exists` and `--import tsx` flags.
- Bad, because `@hono/node-server` adapter is an extra dependency.

### Copy `package.json` files + `bun install --production` (chosen)

The build stage runs `bun install --frozen-lockfile` once. The API stage then copies only the workspace `package.json` files plus `bun.lock` and runs `bun install --frozen-lockfile --production --ignore-scripts` natively on alpine, then copies source files in. This installs the musl-flavored `sharp` binary and excludes devDependencies, all without a separate prune step.

- Good, because the migration runner stays as plain TypeScript invoked via `bun run`, with no compile-step surgery for dynamic imports.
- Good, because the API stage compiles native addons (sharp) on the same OS/libc it will run on.
- Neutral, because pnpm is still gone, Bun is the single package manager.
- Bad, because the resulting image is larger than a distroless compiled binary would be (still well under the previous Node + pnpm equivalent).

### `bun build --compile` (drop pnpm entirely)

Bun compiles a TypeScript entry point into a single self-contained executable that bundles all dependencies, workspace packages, and the Bun runtime (JavaScriptCore). The resulting binary needs no `node_modules` and can run on a bare distroless image.

This was considered but not chosen. Two issues bit. The migration runner (`packages/shared/src/db/migrate.ts`) uses Kysely's `FileMigrationProvider`, which dynamically imports migration files at runtime via `fs.readdir` + `import()`, so that path can't be compiled into a single binary without surgery. And `sharp` (added later for image processing) is a native C++ addon that doesn't fit the compile-and-ship model. Both problems disappear when the runtime image just runs `bun run` against installed deps.

- Good, because smallest possible image size (~96–110 MB binary on distroless).
- Good, because no `node_modules` to prune (everything is statically linked).
- Good, because `bun build --compile` is a stable Bun feature.
- Bad, because the compiled binary requires AVX2 instructions (supported by all modern x86-64 servers).
- Bad, because the migration runner cannot be compiled due to dynamic imports.
- Bad, because native addons like `sharp` don't fit the compile model.

### Keep `pnpm deploy` in Docker

- Good, because it already produces small, clean production images.
- Bad, because it requires maintaining both lockfiles and dual-tooling.

### `turbo prune` + `bun install --production`

- Bad, because multiple open Turborepo bugs with `bun.lock` make it unreliable ([vercel/turborepo#10782](https://github.com/vercel/turborepo/issues/10782), [#11007](https://github.com/vercel/turborepo/issues/11007), [#11074](https://github.com/vercel/turborepo/issues/11074)).

### Copy full `node_modules` from build

- Bad, because it results in large images (500+ MB including all devDependencies).

## More Information

### Known issues

- `bun install --production` in workspaces does not properly exclude devDependencies for workspace packages ([oven-sh/bun#8033](https://github.com/oven-sh/bun/issues/8033), [#25804](https://github.com/oven-sh/bun/issues/25804)). Worked around in the API stage by copying only the runtime workspace `package.json` files before running `bun install --production`.
- `turbo prune` has multiple open bugs with `bun.lock` serialization. Not relevant since we don't use `turbo prune`.
