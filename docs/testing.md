# Testing

## Overview

All workspaces use **Vitest** as the test runner. `apps/web` runs with `jsdom`; `apps/api` and `packages/shared` run in node. Always invoke tests via `bun run test` (which goes through Turbo) — never `bun test`, which runs Bun's built-in runner and bypasses each package's vitest config.

## Running Tests

```bash
# All workspaces (via Turbo) — always use `bun run test` at the root
bun run test

# One workspace — go through Turbo so the result is cached
bunx turbo test --filter=shared
bunx turbo test --filter=web
bunx turbo test --filter=api

# A single file — the dev-loop default
bun run --cwd apps/web test src/stores/display-store.test.ts
```

Reserve `bun run --cwd <pkg> test` for a single file. Without a file argument it invokes vitest directly, bypasses the Turbo cache, and forces the pre-push hook to redo identical work.

## Writing Tests

### Placement

Colocate test files next to the source files they test, using the `.test.ts` (or `.test.tsx`) suffix:

```plaintext
src/
  lib/
    format.ts
    format.test.ts
  filters.ts
  filters.test.ts
```

### Test Helpers

In `apps/web`, the shared helpers are mandatory rather than optional:

- **Factories** — `apps/web/src/test/factories.ts` builds `Card`, `Printing` and friends. Import from there instead of hand-rolling a stub, so a shape change lands in one file.
- **Store resets** — Zustand stores are singletons, so a store test must call `createStoreResetter()` from `apps/web/src/test/store-helpers.ts` in `beforeEach`/`afterEach`. Without it, state leaks between tests in the same file.

Elsewhere, or for a shape the factories don't cover, define a local factory at the top of the test file that returns a valid object with sensible defaults and override only the fields each test cares about:

```ts
function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "SET1-001",
    name: "Test Card",
    // ... sensible defaults
    ...overrides,
  };
}
```

For functions that take simple inputs (strings, numbers, `null`), just call them directly — no factory needed.

### What needs a test

Every new or modified store, hook with real logic, or `lib/` utility gets a sibling `*.test.ts`. Aim for the happy path, the edges (empty input, boundaries), and the error path. Every bug fix gets a regression test that fails without the fix — if the path genuinely can't be tested (a third-party SSR quirk, browser-only behavior), say so in the commit message rather than shipping it uncovered.

### Imports

All test files import from `"vitest"`:

```ts
import { describe, expect, it } from "vitest";
```

### Configs

Each workspace has its own `vitest.config.ts`:

- `packages/shared/vitest.config.ts` — node environment, no aliases.
- `apps/api/vitest.config.ts` — node environment, loads `DATABASE_URL` from the root `.env` so integration tests can find it.
- `apps/web/vitest.config.ts` — `jsdom` environment, `@/` → `src/` alias, React SWC plugin via Vite.

Use `vi.mock()` when the module under test imports something with side effects or heavy dependencies (React components, DOM APIs, browser globals). If a utility only imports plain constants or types from such a module, mock just that export to avoid pulling in the entire dependency tree.

## Integration Tests

Integration tests hit a real PostgreSQL database. They use the `.integration.test.ts` filename suffix and are excluded from `bun run test` — run them separately via:

```bash
bun run test:integration          # all integration tests (via Turbo)
```

The pre-push hook runs this, so there is no need to run it yourself as a verification step. The runner ignores file arguments — it is always the whole suite. It also needs the local Docker database, which is not reachable from a worktree, so run it from the main checkout only.

### One shared temporary database

Never hit the development or production database from tests. `apps/api/src/test/run-integration.ts` owns the database for the whole run: it creates one `openrift_test_shared_<timestamp>` database, migrates it, loads the seed fixtures, inserts the test users, and drops it at the end. Test files never create or drop a database — they connect to the one the runner passes down via `INTEGRATION_DB_URL`.

Files are discovered by glob (`src/**/*.integration.test.ts`), so a new test runs as soon as it exists. Nothing to register.

The migrations test is the one exception: it rolls every migration back and re-applies it, so the runner gives it its own temp database via `setupTestDb()`. No other test should use that helper.

### Two contexts

Call one of these once at module scope, then guard the suite with `describe.skipIf(!ctx)` so the file skips cleanly when the runner isn't providing a database.

```ts
// Repo-level test — database only.
import { createDbContext } from "../test/integration-context.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("priceRefreshRepo (integration)", () => {
  const { db } = ctx!;
  // ...
});
```

```ts
// Route-level test — Hono app with auth mocked for the given user.
import { createTestContext, req, seedTestUser } from "../../test/integration-context.js";

const USER_ID = crypto.randomUUID();
const ctx = createTestContext(USER_ID);

describe.skipIf(!ctx)("POST /collections/reset", () => {
  const { app, db } = ctx!;
  // await app.request(req("POST", "/collections/reset"))
});
```

`createUnauthenticatedTestContext()` is the anonymous-caller variant. `req` / `adminReq` build requests against `/api/v1` and `/api/admin/v1`.

### Every file owns its data

All files share one database, so a fixed user id is hidden coupling between files. Seed your own user with `seedTestUser(db)` (random UUID by default; pass `id` when the value has to exist at module scope for `createTestContext`), and delete what you inserted in `afterAll`. Do not delete rows you did not create — the seed fixtures belong to every other file too.

### Writing a new integration test

1. Name the file `*.integration.test.ts`
2. Create a `createDbContext` / `createTestContext` at module scope and guard with `describe.skipIf(!ctx)`
3. Seed your own user and rows rather than reusing another file's
4. Delete everything you inserted in `afterAll`

## Coverage

Vitest prints a summary table to the terminal with `--coverage`. File-based reports are written to `coverage/` (gitignored). The repo-level `test:coverage` script merges per-package `lcov.info` files into `coverage/lcov.info` at the repo root.

```bash
# Per-package
bunx turbo test:coverage --filter=shared
bunx turbo test:coverage --filter=web

# Merged across the monorepo
bun run test:coverage
```

## E2E Tests (Playwright)

End-to-end tests run in a real Chromium browser against a temporary PostgreSQL database. They live in `packages/e2e/`.

### Prerequisites

- Docker database running (`docker compose up db`)
- Chromium installed for Playwright: `bunx playwright install chromium` (run once, from `packages/e2e/`)

### Running

```bash
# From repo root
bun run test:e2e

# From packages/e2e/ directly
bunx playwright test              # headless
bunx playwright test --headed     # watch the browser
bunx playwright test --ui         # interactive UI mode
bunx playwright test --debug      # step-through debugger
```

### What happens when you run E2E tests

1. **Global setup** creates a temporary database (`openrift_test_e2e_<timestamp>`), runs all migrations, and loads seed data from `apps/api/src/test/fixtures/seed.sql`
2. The API server starts on port **3100** and the web dev server on port **5174** (dedicated ports to avoid colliding with your dev servers on 3000/5173)
3. An **auth setup** project signs up two test users (`e2e-user@test.com` and `e2e-admin@test.com`), bypasses email verification via direct DB update, and saves authenticated browser sessions to `.auth/` files
4. Test specs run in Chromium using the pre-authenticated sessions
5. **Global teardown** kills both servers and drops the temporary database

### Writing new E2E tests

Test files go in `packages/e2e/src/tests/` and use the `.spec.ts` suffix:

```
packages/e2e/src/tests/
  public/          # Pages that don't require login
  auth/            # Login, signup, logout flows
  authenticated/   # Pages behind auth
```

For tests that need an authenticated browser, import from the custom fixture:

```ts
import { test, expect } from "../../fixtures/test.js";

test("my test", async ({ authenticatedPage: page }) => {
  await page.goto("/collections");
  await expect(page.getByText("All Cards")).toBeVisible();
});
```

Available fixtures: `authenticatedPage` (regular user) and `adminPage` (admin user). For public pages, use the standard Playwright import:

```ts
import { expect, test } from "@playwright/test";
```

### Ports

| Service | E2E port | Dev port | Why separate                     |
| ------- | -------- | -------- | -------------------------------- |
| API     | 3100     | 3000     | Run E2E while dev servers are up |
| Web     | 5174     | 5173     | Same                             |

### Debugging failures

- HTML report: `packages/e2e/playwright-report/index.html` (generated after each run)
- Traces: saved on first retry, viewable with `bunx playwright show-trace <trace.zip>`
- Screenshots: captured on failure in `packages/e2e/test-results/`

## What to Test

Aim for high coverage on pure logic and utility functions.
Don't chase 100% on UI components — those are better covered by integration/E2E tests.

**High priority:** Pure functions and utilities — no I/O, no DOM, no React. These hold the core logic and are easy to test thoroughly.

**Medium priority:** React hooks (via `renderHook`) and API route handlers (via Hono's `app.request()`). These need more setup (mocking fetch, wrapping in providers) but cover important data-flow and integration logic.

**Low priority (defer to E2E):** Heavily visual components, device sensor hooks, and scaffolded `shadcn/ui` components. Tightly coupled to the browser — unit tests add friction without meaningful confidence beyond what E2E covers.
