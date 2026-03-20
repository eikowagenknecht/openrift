/* oxlint-disable import/no-nodejs-modules, typescript/no-non-null-assertion -- standalone script */
/**
 * Integration test orchestrator.
 *
 * Creates ONE shared temporary database, runs migrations, loads seed data,
 * inserts test users, then spawns bun test processes. Drops the DB on exit.
 *
 * Usage: bun --env-file=../../.env run src/test/run-integration.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { createTempDb, dropTempDb, noop, noopLogger, replaceDbName } from "./integration-setup.js";

// ---------------------------------------------------------------------------
// Test user registry — one per test file
// ---------------------------------------------------------------------------

interface TestUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

const TEST_USERS: TestUser[] = [
  // User-scoped tests
  { id: "a0000000-0001-4000-a000-000000000001", email: "user-0001@test.com", isAdmin: false },
  { id: "a0000000-0002-4000-a000-000000000001", email: "user-0002@test.com", isAdmin: false },
  { id: "a0000000-0003-4000-a000-000000000001", email: "user-0003@test.com", isAdmin: false },
  { id: "a0000000-0004-4000-a000-000000000001", email: "user-0004@test.com", isAdmin: false },
  { id: "a0000000-0005-4000-a000-000000000001", email: "user-0005@test.com", isAdmin: false },
  { id: "a0000000-0006-4000-a000-000000000001", email: "user-0006@test.com", isAdmin: false },
  { id: "a0000000-0007-4000-a000-000000000001", email: "user-0007@test.com", isAdmin: false },
  { id: "a0000000-0008-4000-a000-000000000001", email: "user-0008@test.com", isAdmin: false },
  { id: "a0000000-0009-4000-a000-000000000001", email: "user-0009@test.com", isAdmin: false },
  // Admin tests (not pre-promoted — admin-core tests non-admin access first)
  { id: "a0000000-0010-4000-a000-000000000001", email: "admin-0010@test.com", isAdmin: false },
  // Admin tests (pre-promoted)
  { id: "a0000000-0011-4000-a000-000000000001", email: "admin-0011@test.com", isAdmin: true },
  { id: "a0000000-0012-4000-a000-000000000001", email: "admin-0012@test.com", isAdmin: true },
  { id: "a0000000-0013-4000-a000-000000000001", email: "admin-0013@test.com", isAdmin: true },
  { id: "a0000000-0014-4000-a000-000000000001", email: "admin-0014@test.com", isAdmin: true },
  { id: "a0000000-0015-4000-a000-000000000001", email: "admin-0015@test.com", isAdmin: true },
  // feature-flags: NOT pre-promoted — tests non-admin access first, then self-promotes
  { id: "a0000000-0016-4000-a000-000000000001", email: "admin-0016@test.com", isAdmin: false },
  { id: "a0000000-0017-4000-a000-000000000001", email: "admin-0017@test.com", isAdmin: true },
  { id: "a0000000-0018-4000-a000-000000000001", email: "admin-0018@test.com", isAdmin: true },
  // admin operations + images tests (pre-promoted)
  { id: "a0000000-0019-4000-a000-000000000001", email: "admin-0019@test.com", isAdmin: true },
  { id: "a0000000-0020-4000-a000-000000000001", email: "admin-0020@test.com", isAdmin: true },
  { id: "a0000000-0021-4000-a000-000000000001", email: "admin-0021@test.com", isAdmin: true },
  // Service tests
  { id: "a0000000-0022-4000-a000-000000000001", email: "svc-0022@test.com", isAdmin: false },
  // Public read-endpoint tests (prices + catalog)
  { id: "a0000000-0023-4000-a000-000000000001", email: "user-0023@test.com", isAdmin: false },
  { id: "a0000000-0024-4000-a000-000000000001", email: "user-0024@test.com", isAdmin: false },
  // Repository integration tests
  { id: "a0000000-0025-4000-a000-000000000001", email: "repo-0025@test.com", isAdmin: false },
  { id: "a0000000-0026-4000-a000-000000000001", email: "repo-0026@test.com", isAdmin: false },
  { id: "a0000000-0027-4000-a000-000000000001", email: "repo-0027@test.com", isAdmin: false },
  { id: "a0000000-0028-4000-a000-000000000001", email: "repo-0028@test.com", isAdmin: false },
  { id: "a0000000-0029-4000-a000-000000000001", email: "repo-0029@test.com", isAdmin: false },
  { id: "a0000000-0030-4000-a000-000000000001", email: "repo-0030@test.com", isAdmin: false },
  { id: "a0000000-0031-4000-a000-000000000001", email: "repo-0031@test.com", isAdmin: true },
  { id: "a0000000-0032-4000-a000-000000000001", email: "repo-0032@test.com", isAdmin: false },
  { id: "a0000000-0033-4000-a000-000000000001", email: "repo-0033@test.com", isAdmin: false },
];

// ---------------------------------------------------------------------------
// Test file groups
// ---------------------------------------------------------------------------

/** Files that can all run in a single parallel bun test invocation */
const PARALLEL_FILES = [
  "src/authorization.integration.test.ts",
  "src/routes/collections.integration.test.ts",
  "src/routes/copies.integration.test.ts",
  "src/routes/activities.integration.test.ts",
  "src/routes/wish-lists.integration.test.ts",
  "src/routes/trade-lists.integration.test.ts",
  "src/routes/shopping-list.integration.test.ts",
  "src/routes/decks.integration.test.ts",
  "src/routes/sources.integration.test.ts",
  "src/routes/admin/admin-core.integration.test.ts",
  "src/routes/admin/catalog.integration.test.ts",
  "src/routes/admin/marketplace-groups.integration.test.ts",
  "src/routes/admin/marketplace-mapping.integration.test.ts",
  "src/routes/admin/unified-mappings.integration.test.ts",
  "src/routes/admin/ignored-products.integration.test.ts",
  "src/routes/admin/feature-flags.integration.test.ts",
  "src/routes/admin/candidate-cards/queries.integration.test.ts",
  "src/routes/admin/candidate-cards/mutations.integration.test.ts",
  "src/services/price-refresh/upsert.integration.test.ts",
  "src/services/ingest-candidates.integration.test.ts",
  "src/routes/prices.integration.test.ts",
  "src/routes/catalog.integration.test.ts",
  "src/routes/admin/operations.integration.test.ts",
  "src/routes/admin/images.integration.test.ts",
  "src/routes/admin/candidate-cards/images.integration.test.ts",
  // Repository integration tests
  "src/repositories/activities.integration.test.ts",
  "src/repositories/collections.integration.test.ts",
  "src/repositories/copies.integration.test.ts",
  "src/repositories/decks.integration.test.ts",
  "src/repositories/sources.integration.test.ts",
  "src/repositories/marketplace.integration.test.ts",
  "src/repositories/feature-flags.integration.test.ts",
  "src/repositories/trade-lists.integration.test.ts",
  "src/repositories/wish-lists.integration.test.ts",
];

/** Files that formerly used mock.module() — now empty since services are injected via context */
const MOCK_MODULE_FILES: string[] = [];

/** Migrations test — always gets its own temp DB (unchanged) */
const MIGRATIONS_FILE = "src/db/migrations/migrations.integration.test.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("DATABASE_URL not set — skipping integration tests");
  process.exit(0);
}

const coverageArgs = process.env.COVERAGE
  ? ["--coverage", "--coverage-reporter=text", "--coverage-reporter=lcov"]
  : [];

let tempDbName = "";

try {
  // 1. Create shared temp database
  console.log("Creating shared integration database...");
  tempDbName = await createTempDb(DATABASE_URL, "shared");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  console.log(`  → ${tempDbName}`);

  // 2. Run migrations
  console.log("Running migrations...");
  const { db } = createDb(testUrl);
  await migrate(db, noopLogger);

  // 3. Load seed data
  console.log("Loading seed data...");
  const seedSql = readFileSync(resolve(import.meta.dirname!, "fixtures/seed.sql"), "utf8");
  const sql = postgres(testUrl, { onnotice: noop });
  await sql.unsafe(seedSql);
  await sql.end();

  // 4. Insert test users
  console.log("Inserting test users...");
  for (const user of TEST_USERS) {
    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        name: "Test User",
        emailVerified: true,
        image: null,
      })
      .execute();
    if (user.isAdmin) {
      await db.insertInto("admins").values({ userId: user.id }).execute();
    }
  }

  await db.destroy();

  // 5. Run tests
  const env = { ...process.env, INTEGRATION_DB_URL: testUrl };
  let failed = false;

  // Batch 1: parallel tests
  console.log(`\nRunning ${PARALLEL_FILES.length} test files in parallel...`);
  const parallelCoverageDir =
    coverageArgs.length > 0 ? ["--coverage-dir=./coverage/integration-parallel"] : [];
  const parallelResult = Bun.spawnSync(
    ["bun", "test", ...coverageArgs, ...parallelCoverageDir, ...PARALLEL_FILES],
    {
      cwd: resolve(import.meta.dirname!, "../.."),
      env,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (parallelResult.exitCode !== 0) {
    failed = true;
  }

  // Batch 2: mock.module tests (separate processes)
  for (const [i, file] of MOCK_MODULE_FILES.entries()) {
    console.log(`\nRunning ${file} (separate process)...`);
    const mockCoverageDir =
      coverageArgs.length > 0 ? [`--coverage-dir=./coverage/integration-mock-${i}`] : [];
    const result = Bun.spawnSync(["bun", "test", ...coverageArgs, ...mockCoverageDir, file], {
      cwd: resolve(import.meta.dirname!, "../.."),
      env,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) {
      failed = true;
    }
  }

  // Batch 3: migrations test (own temp DB, uses DATABASE_URL directly)
  console.log(`\nRunning ${MIGRATIONS_FILE} (own temp DB)...`);
  const migrationsCoverageDir =
    coverageArgs.length > 0 ? ["--coverage-dir=./coverage/integration-migrations"] : [];
  const migrationsResult = Bun.spawnSync(
    ["bun", "test", ...coverageArgs, ...migrationsCoverageDir, MIGRATIONS_FILE],
    {
      cwd: resolve(import.meta.dirname!, "../.."),
      env: { ...process.env },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (migrationsResult.exitCode !== 0) {
    failed = true;
  }

  if (failed) {
    console.error("\nSome integration tests failed.");
    process.exit(1);
  }

  console.log("\nAll integration tests passed!");
} finally {
  // 6. Drop temp database
  if (tempDbName) {
    console.log(`\nDropping ${tempDbName}...`);
    await dropTempDb(DATABASE_URL, tempDbName);
  }
}
