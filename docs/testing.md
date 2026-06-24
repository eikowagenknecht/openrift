# Testing

## Overview

All workspaces use **Vitest** as the test runner. `apps/web` runs with `jsdom`; `apps/api` and `packages/shared` run in node. Always invoke tests via `bun run test` (which goes through Turbo) — never `bun test`, which runs Bun's built-in runner and bypasses each package's vitest config.

## Running Tests

```bash
# All workspaces (via Turbo) — always use `bun run test` at the root
bun run test

# Individual workspaces
bun run --cwd packages/shared test    # vitest run
bun run --cwd apps/web test           # vitest run
bun run --cwd apps/api test           # vitest run

# With coverage
bun run --cwd packages/shared test:coverage
bun run --cwd apps/web test:coverage
```

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

When a function takes a complex object (like `Card` or `CardFilters`), build minimal stubs instead of importing real data.
Define a factory at the top of the test file that returns a valid object with sensible defaults, then override only the fields relevant to each test:

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

### Imports

All test files import from `"vitest"`:

```ts
import { describe, expect, it } from "vitest";
```

### Configs

Each workspace has its own `vitest.config.ts`:

- `packages/shared/vitest.config.ts` — node environment, no aliases.
- `apps/api/vitest.config.ts` — node environment, sequential pool (`forks`, `fileParallelism: false`), loads `DATABASE_URL` from the root `.env` so integration tests can find it.
- `apps/web/vitest.config.ts` — `jsdom` environment, `@/` → `src/` alias, React SWC plugin via Vite.

Use `vi.mock()` when the module under test imports something with side effects or heavy dependencies (React components, DOM APIs, browser globals). If a utility only imports plain constants or types from such a module, mock just that export to avoid pulling in the entire dependency tree.

## Integration Tests

Integration tests hit a real PostgreSQL database. They use the `.integration.test.ts` filename suffix and are excluded from `bun run test` — run them separately via:

```bash
bun run test:integration          # all integration tests (via Turbo)
```

### Temporary databases are mandatory

Every integration test **must** use a temporary database. Never hit the development or production database from tests.

Use `setupTestDb()` from `apps/api/src/test/integration-setup.ts` (or its inline equivalent for API tests that need dynamic imports). It:

1. Creates a fresh `openrift_test_<timestamp>` database
2. Runs all migrations
3. Returns a Kysely instance and a `teardown()` that drops the database

```ts
// apps/api example (static imports)
import { setupTestDb } from "./test/integration-setup.js";

let db: Kysely<Database>;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await setupTestDb(DATABASE_URL!));
});

afterAll(async () => {
  await teardown();
});
```

For API integration tests where modules must see the temp DB URL at import time, create the temp database via top-level `await` **before** dynamically importing app modules:

```ts
// apps/api example (dynamic imports)
const tempDbName = `openrift_test_auth_${Date.now()}`;
// ... create temp DB ...
process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

const { app } = await import("./app.js");
const { db } = await import("./db.js");

// Run migrations, then run tests, then drop the temp DB in afterAll
```

### Writing a new integration test

1. Name the file `*.integration.test.ts`
2. Guard with `describe.skipIf(!DATABASE_URL)` so tests skip gracefully without a database
3. Create a temp database (see patterns above)
4. Always drop the temp database in `afterAll`

## Coverage

Vitest prints a summary table to the terminal with `--coverage`. File-based reports are written to `coverage/` (gitignored). The repo-level `test:coverage` script merges per-package `lcov.info` files into `coverage/lcov.info` at the repo root.

```bash
# Per-package
bun run --cwd packages/shared test:coverage
bun run --cwd apps/web test:coverage

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
