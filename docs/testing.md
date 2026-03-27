# Testing

## Overview

The project uses two test runners:

- **`bun test`** — for `packages/shared` and `apps/api` (zero-config, uses Bun's built-in Jest-compatible runner)
- **Vitest** — for `apps/web` (integrates with Vite for alias resolution, `import.meta.env`, JSX, and jsdom)

This split follows the standard pattern for Vite+Bun monorepos: bun's native runner for backend/pure logic, Vitest for frontend code that needs Vite plugin integration and browser-like environments.

## Running Tests

```bash
# All workspaces (via Turbo) — always use `bun run test` at the root
bun run test

# Individual workspaces
bun test --cwd packages/shared       # bun test
bun run --cwd apps/web test          # vitest run

# With coverage
bun test --coverage --cwd packages/shared
bun run --cwd apps/web -- vitest run --coverage
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

### packages/shared (bun test)

- Import from `"bun:test"`:

  ```ts
  import { describe, expect, it } from "bun:test";
  ```

- No config file needed — `bun test` discovers `*.test.ts` files automatically.

### apps/web (Vitest)

- Import from `"vitest"`:

  ```ts
  import { describe, expect, it } from "vitest";
  ```

- Config lives in `apps/web/vitest.config.ts`. The `@/` alias and `jsdom` environment are preconfigured.
- Use `vi.mock()` when the module under test imports something that has side effects or heavy dependencies (React components, DOM APIs, browser globals). If a utility only imports plain constants or types from such a module, mock just that export to avoid pulling in the entire dependency tree.

## Integration Tests

Integration tests hit a real PostgreSQL database. They use the `.integration.test.ts` filename suffix and are excluded from `bun run test` — run them separately via:

```bash
bun run test:integration          # all integration tests (via Turbo)
```

### Temporary databases are mandatory

Every integration test **must** use a temporary database. Never hit the development or production database from tests.

Use `setupTestDb()` from `@openrift/shared/test/integration-setup` (or its inline equivalent for API tests that need dynamic imports). It:

1. Creates a fresh `openrift_test_<timestamp>` database
2. Runs all migrations
3. Returns a Kysely instance and a `teardown()` that drops the database

```ts
// packages/shared example (static imports)
import { setupTestDb } from "../../test/integration-setup.js";

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

Both runners print a summary table to the terminal with `--coverage`. If file-based reports are needed, they write to `coverage/` (gitignored).

```bash
# Terminal summary only
bun test --coverage --cwd packages/shared
bun run --cwd apps/web -- vitest run --coverage

# Write lcov files to coverage/
bun test --coverage --coverage-reporter=lcov --cwd packages/shared
bun run --cwd apps/web -- vitest run --coverage --coverage.reporter=lcov
```

## What to Test

Aim for high coverage on pure logic and utility functions.
Don't chase 100% on UI components — those are better covered by integration/E2E tests.

**High priority:** Pure functions and utilities — no I/O, no DOM, no React. These hold the core logic and are easy to test thoroughly.

**Medium priority:** React hooks (via `renderHook`) and API route handlers (via Hono's `app.request()`). These need more setup (mocking fetch, wrapping in providers) but cover important data-flow and integration logic.

**Low priority (defer to E2E):** Heavily visual components, device sensor hooks, and scaffolded `shadcn/ui` components. Tightly coupled to the browser — unit tests add friction without meaningful confidence beyond what E2E covers.
