# ADR-004: Migrate from pnpm to Bun as Package Manager

**Date:** 2026-02-28
**Status:** Accepted
**Deciders:** @eiko

## Context

The project used pnpm 10.x as its package manager alongside Bun as the JavaScript runtime. This created a dual-tooling situation: Bun ran TypeScript natively (dev scripts, API server, migrations), while pnpm handled dependency installation, workspace resolution, and — critically — the `pnpm deploy` command that produced lean production `node_modules` for Docker images.

ADR-002 accepted Bun as the runtime but left the package manager question open, noting "pnpm workspace compatibility with Bun needs testing (or a switch to Bun's built-in workspaces)."

The `pnpm deploy` command is unique to pnpm — no other package manager offers an equivalent that copies a single workspace package into an isolated directory with only its production dependencies resolved. This was the main blocker to dropping pnpm.

## Analysis

### Approaches to replace `pnpm deploy`

| Approach | Drops pnpm? | Image size | Reliability | Notes |
|---|---|---|---|---|
| `bun build --compile` | Yes | Smallest (~96-110 MB binary on distroless) | High (stable Bun feature) | Bundles everything into a single executable |
| Keep `pnpm deploy` in Docker | No | Small (current behavior) | High (proven) | Requires maintaining both lockfiles |
| `turbo prune` + `bun install --production` | Yes | Medium | Low | Multiple open Turborepo bugs with `bun.lock` |
| Copy full `node_modules` from build | Yes | Large (500+ MB) | High | Includes all devDependencies |

### `bun build --compile`

Bun can compile a TypeScript entry point into a single self-contained executable that bundles all dependencies, workspace packages, and the Bun runtime (JavaScriptCore). The resulting binary needs no `node_modules` at all and can run on a bare distroless image.

This sidesteps the `pnpm deploy` problem entirely — there are no `node_modules` to prune because everything is statically linked into one file.

The API server is a good fit: Hono has first-class Bun support, and the dependency tree is small (`hono`, `better-auth`, `kysely`, `kysely-postgres-js`, `@openrift/shared`). No native C++ addons are involved.

### Migration runner caveat

The migration runner (`packages/shared/src/db/migrate.ts`) uses Kysely's `FileMigrationProvider`, which dynamically imports migration files at runtime via `fs.readdir` + `import()`. This prevents compilation into a single binary. Instead, the migrate Docker stage copies only the migration source files and two runtime dependencies (`kysely`, `kysely-postgres-js`), reducing image size dramatically compared to the previous approach of copying the entire build tree.

### Known issues

- `bun install --production` in workspaces does not properly exclude devDependencies for workspace packages ([oven-sh/bun#8033](https://github.com/oven-sh/bun/issues/8033), [#25804](https://github.com/oven-sh/bun/issues/25804)). Not relevant here since the API stage uses `bun build --compile` instead of `node_modules`.
- `turbo prune` has multiple open bugs with `bun.lock` serialization ([vercel/turborepo#10782](https://github.com/vercel/turborepo/issues/10782), [#11007](https://github.com/vercel/turborepo/issues/11007), [#11074](https://github.com/vercel/turborepo/issues/11074)). Not relevant since we don't use `turbo prune`.
- The compiled binary requires AVX2 instructions (supported by all modern x86-64 servers).

## Decision

Migrate from pnpm to Bun as the sole package manager and use `bun build --compile` for production Docker builds.

### Changes

1. **Root `package.json`**: Add `workspaces` field, replace `pnpm` script references with `bun`, set `packageManager` to `bun@1.3.9`, replace `pnpm.onlyBuiltDependencies` with `trustedDependencies`.
2. **Lockfile**: Replace `pnpm-lock.yaml` with `bun.lock` (migrated automatically by `bun install`).
3. **Removed files**: `pnpm-workspace.yaml` (replaced by `workspaces` in package.json), `.npmrc` (settings were pnpm-specific).
4. **Dockerfile**:
   - Build stage: `bun install --frozen-lockfile` replaces `pnpm install --frozen-lockfile`; `bun build --compile` produces a single API binary.
   - API stage: `gcr.io/distroless/base` with just the compiled binary (was `oven/bun:1-alpine` with `node_modules` + `dist/`).
   - Migrate stage: copies only `packages/shared/src/db/`, `kysely`, and `kysely-postgres-js` from the build (was copying the entire `/app`).
5. **Lefthook**: `pnpm exec` → `bunx`, `pnpm --filter ... exec` → `bun run --cwd`.
6. **Documentation**: All `pnpm` references updated to `bun` equivalents across docs/contributing.md, development.md, contributing.md, architecture.md, data-layer.md, README.md, and script usage comments.

### Rationale

- Eliminates dual-tooling (Bun runtime + pnpm package manager).
- The compiled API binary is smaller than `node_modules` + runtime, and runs on a minimal distroless image.
- The lean migrate stage copies ~2 packages instead of the entire monorepo build tree.
- Bun's workspace support (`workspaces` field + `workspace:*` protocol) is stable and sufficient for this project's needs.
- One fewer prerequisite for contributors (no pnpm installation needed).

### Fallback

If `bun build --compile` encounters issues in production (e.g., runtime behavior differences, memory characteristics), the API stage can revert to `oven/bun:1-alpine` running `bun dist/index.js` with production `node_modules` copied from the build stage. This is a Dockerfile-only change with no source code impact.
