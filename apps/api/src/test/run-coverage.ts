/* oxlint-disable import/no-nodejs-modules, typescript/no-non-null-assertion -- standalone script */
/**
 * Unified coverage runner.
 *
 * Runs unit tests and integration tests in separate bun test processes
 * (to avoid mock pollution), both producing bun-native coverage into the
 * same coverage directory. Bun merges lcov data automatically when the
 * same --coverage-dir is reused across invocations.
 *
 * This gives one unified coverage report with consistent line counting,
 * unlike the old vitest+bun split which produced incompatible lcov data.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import postgres from "postgres";

import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { createTempDb, dropTempDb, noop, noopLogger, replaceDbName } from "./integration-setup.js";

// ---------------------------------------------------------------------------
// Test user registry (same as run-integration.ts)
// ---------------------------------------------------------------------------

interface TestUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

const TEST_USERS: TestUser[] = [
  { id: "a0000000-0001-4000-a000-000000000001", email: "user-0001@test.com", isAdmin: false },
  { id: "a0000000-0002-4000-a000-000000000001", email: "user-0002@test.com", isAdmin: false },
  { id: "a0000000-0003-4000-a000-000000000001", email: "user-0003@test.com", isAdmin: false },
  { id: "a0000000-0004-4000-a000-000000000001", email: "user-0004@test.com", isAdmin: false },
  { id: "a0000000-0005-4000-a000-000000000001", email: "user-0005@test.com", isAdmin: false },
  { id: "a0000000-0006-4000-a000-000000000001", email: "user-0006@test.com", isAdmin: false },
  { id: "a0000000-0007-4000-a000-000000000001", email: "user-0007@test.com", isAdmin: false },
  { id: "a0000000-0008-4000-a000-000000000001", email: "user-0008@test.com", isAdmin: false },
  { id: "a0000000-0009-4000-a000-000000000001", email: "user-0009@test.com", isAdmin: false },
  { id: "a0000000-0010-4000-a000-000000000001", email: "admin-0010@test.com", isAdmin: false },
  { id: "a0000000-0011-4000-a000-000000000001", email: "admin-0011@test.com", isAdmin: true },
  { id: "a0000000-0012-4000-a000-000000000001", email: "admin-0012@test.com", isAdmin: true },
  { id: "a0000000-0013-4000-a000-000000000001", email: "admin-0013@test.com", isAdmin: true },
  { id: "a0000000-0014-4000-a000-000000000001", email: "admin-0014@test.com", isAdmin: true },
  { id: "a0000000-0015-4000-a000-000000000001", email: "admin-0015@test.com", isAdmin: true },
  { id: "a0000000-0016-4000-a000-000000000001", email: "admin-0016@test.com", isAdmin: false },
  { id: "a0000000-0017-4000-a000-000000000001", email: "admin-0017@test.com", isAdmin: true },
  { id: "a0000000-0018-4000-a000-000000000001", email: "admin-0018@test.com", isAdmin: true },
  { id: "a0000000-0019-4000-a000-000000000001", email: "admin-0019@test.com", isAdmin: true },
  { id: "a0000000-0020-4000-a000-000000000001", email: "admin-0020@test.com", isAdmin: true },
  { id: "a0000000-0021-4000-a000-000000000001", email: "admin-0021@test.com", isAdmin: true },
  { id: "a0000000-0022-4000-a000-000000000001", email: "svc-0022@test.com", isAdmin: false },
  { id: "a0000000-0023-4000-a000-000000000001", email: "user-0023@test.com", isAdmin: false },
  { id: "a0000000-0024-4000-a000-000000000001", email: "user-0024@test.com", isAdmin: false },
  { id: "a0000000-0025-4000-a000-000000000001", email: "repo-0025@test.com", isAdmin: false },
  { id: "a0000000-0026-4000-a000-000000000001", email: "repo-0026@test.com", isAdmin: false },
  { id: "a0000000-0027-4000-a000-000000000001", email: "repo-0027@test.com", isAdmin: false },
  { id: "a0000000-0028-4000-a000-000000000001", email: "repo-0028@test.com", isAdmin: false },
  { id: "a0000000-0029-4000-a000-000000000001", email: "repo-0029@test.com", isAdmin: false },
  { id: "a0000000-0030-4000-a000-000000000001", email: "repo-0030@test.com", isAdmin: false },
  { id: "a0000000-0031-4000-a000-000000000001", email: "repo-0031@test.com", isAdmin: true },
  { id: "a0000000-0032-4000-a000-000000000001", email: "repo-0032@test.com", isAdmin: false },
  { id: "a0000000-0033-4000-a000-000000000001", email: "repo-0033@test.com", isAdmin: false },
  { id: "a0000000-0034-4000-a000-000000000001", email: "repo-0034@test.com", isAdmin: false },
  { id: "a0000000-0035-4000-a000-000000000001", email: "repo-0035@test.com", isAdmin: false },
  { id: "a0000000-0036-4000-a000-000000000001", email: "repo-0036@test.com", isAdmin: false },
  { id: "a0000000-0037-4000-a000-000000000001", email: "repo-0037@test.com", isAdmin: false },
  { id: "a0000000-0038-4000-a000-000000000001", email: "repo-0038@test.com", isAdmin: false },
  { id: "a0000000-0039-4000-a000-000000000001", email: "repo-0039@test.com", isAdmin: false },
  { id: "a0000000-0040-4000-a000-000000000001", email: "repo-0040@test.com", isAdmin: false },
  { id: "a0000000-0041-4000-a000-000000000001", email: "repo-0041@test.com", isAdmin: false },
  { id: "a0000000-0042-4000-a000-000000000001", email: "repo-0042@test.com", isAdmin: false },
  { id: "a0000000-0043-4000-a000-000000000001", email: "repo-0043@test.com", isAdmin: false },
  { id: "a0000000-0044-4000-a000-000000000001", email: "user-0044@test.com", isAdmin: false },
  { id: "a0000000-0045-4000-a000-000000000001", email: "admin-0045@test.com", isAdmin: true },
  { id: "a0000000-0046-4000-a000-000000000001", email: "admin-0046@test.com", isAdmin: true },
  { id: "a0000000-0047-4000-a000-000000000001", email: "admin-0047@test.com", isAdmin: true },
  { id: "a0000000-0048-4000-a000-000000000001", email: "admin-0048@test.com", isAdmin: true },
  { id: "a0000000-0049-4000-a000-000000000001", email: "user-0049@test.com", isAdmin: false },
];

// ---------------------------------------------------------------------------
// Files that use vi.mock() — skip from bun, run via vitest separately
// ---------------------------------------------------------------------------

const VI_MOCK_FILES = new Set([
  "src/services/accept-gallery.test.ts",
  "src/services/printing-admin.test.ts",
  "src/services/image-rehost.test.ts",
]);

// ---------------------------------------------------------------------------
// Collect test files
// ---------------------------------------------------------------------------

function collectFiles(dir: string, rootDir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath, rootDir, pattern));
    } else if (pattern.test(entry)) {
      const relative = fullPath.slice(rootDir.length + 1);
      if (!VI_MOCK_FILES.has(relative)) {
        files.push(relative);
      }
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("DATABASE_URL not set — skipping");
  process.exit(0);
}

const cwd = resolve(import.meta.dirname!, "../..");
const coverageArgs = [
  "--coverage",
  "--coverage-reporter=text",
  "--coverage-reporter=lcov",
  "--coverage-dir=./coverage",
];

// Collect unit test files (excluding vi.mock files and integration tests)
const unitFiles = collectFiles(resolve(cwd, "src"), cwd, /^(?!.*integration).*\.test\.ts$/);

// Use the exact same curated list from run-integration.ts for integration tests
// (bun test finds files by pattern, so paths like "src/routes/collections.integration.test.ts"
// resolve to "src/routes/authenticated/collections.integration.test.ts" automatically)
const integrationFiles = [
  "src/authorization.integration.test.ts",
  "src/routes/collections.integration.test.ts",
  "src/routes/copies.integration.test.ts",
  "src/routes/collection-events.integration.test.ts",
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
  "src/routes/admin/cards/queries.integration.test.ts",
  "src/routes/admin/cards/mutations.integration.test.ts",
  "src/services/price-refresh/upsert.integration.test.ts",
  "src/services/ingest-candidates.integration.test.ts",
  "src/routes/prices.integration.test.ts",
  "src/routes/catalog.integration.test.ts",
  "src/routes/admin/operations.integration.test.ts",
  "src/routes/admin/images.integration.test.ts",
  "src/routes/admin/cards/images.integration.test.ts",
  "src/repositories/collection-events.integration.test.ts",
  "src/repositories/collections.integration.test.ts",
  "src/repositories/copies.integration.test.ts",
  "src/repositories/decks.integration.test.ts",
  "src/repositories/sources.integration.test.ts",
  "src/repositories/marketplace.integration.test.ts",
  "src/repositories/feature-flags.integration.test.ts",
  "src/repositories/trade-lists.integration.test.ts",
  "src/repositories/wish-lists.integration.test.ts",
  "src/repositories/site-settings.integration.test.ts",
  "src/repositories/provider-settings.integration.test.ts",
  "src/repositories/promo-types.integration.test.ts",
  "src/repositories/user-preferences.integration.test.ts",
  "src/repositories/admins.integration.test.ts",
  "src/repositories/ignored-candidates.integration.test.ts",
  "src/repositories/health.integration.test.ts",
  "src/repositories/catalog.integration.test.ts",
  "src/repositories/sets.integration.test.ts",
  "src/repositories/keywords.integration.test.ts",
  "src/routes/public/health.integration.test.ts",
  "src/routes/public/init.integration.test.ts",
  "src/routes/public/site-settings.integration.test.ts",
  "src/routes/authenticated/preferences.integration.test.ts",
  "src/routes/admin/promo-types.integration.test.ts",
  "src/routes/admin/provider-settings.integration.test.ts",
  "src/routes/admin/site-settings.integration.test.ts",
  "src/routes/admin/ignored-candidates.integration.test.ts",
  "src/repositories/printing-images.integration.test.ts",
  "src/repositories/price-refresh.integration.test.ts",
  "src/repositories/marketplace-transfer.integration.test.ts",
  "src/repositories/candidate-cards.integration.test.ts",
  "src/repositories/marketplace-admin.integration.test.ts",
];

console.log(`Unit tests: ${unitFiles.length} files (${VI_MOCK_FILES.size} vi.mock excluded)`);
console.log(`Integration tests: ${integrationFiles.length} files\n`);

let tempDbName = "";
let failed = false;

try {
  // 1. Run unit tests (no DB needed)
  console.log("Running unit tests...");
  const unitResult = Bun.spawnSync(["bun", "test", ...coverageArgs, ...unitFiles], {
    cwd,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (unitResult.exitCode !== 0) {
    failed = true;
  }

  // 2. Create shared temp database for integration tests
  console.log("\nCreating shared test database...");
  tempDbName = await createTempDb(DATABASE_URL, "coverage");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  console.log(`  → ${tempDbName}`);

  console.log("Running migrations...");
  const { db } = createDb(testUrl);
  await migrate(db, noopLogger);

  console.log("Loading seed data...");
  const seedSql = readFileSync(resolve(import.meta.dirname!, "fixtures/seed.sql"), "utf-8");
  const sql = postgres(testUrl, { onnotice: noop });
  await sql.unsafe(seedSql);
  await sql.end();

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

  // 3. Run integration tests
  console.log(`\nRunning ${integrationFiles.length} integration test files...`);
  const intEnv = { ...process.env, INTEGRATION_DB_URL: testUrl };
  const intCoverageArgs = [...coverageArgs.slice(0, -1), "--coverage-dir=./coverage/integration"];
  const intResult = Bun.spawnSync(["bun", "test", ...intCoverageArgs, ...integrationFiles], {
    cwd,
    env: intEnv,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (intResult.exitCode !== 0) {
    failed = true;
  }

  // 4. Migrations test (own temp DB)
  console.log("\nRunning migrations test (own temp DB)...");
  const migResult = Bun.spawnSync(
    ["bun", "test", ...coverageArgs, "src/db/migrations/migrations.integration.test.ts"],
    { cwd, env: { ...process.env }, stdout: "inherit", stderr: "inherit" },
  );
  if (migResult.exitCode !== 0) {
    failed = true;
  }

  if (failed) {
    console.error("\nSome tests failed.");
    process.exit(1);
  }

  console.log("\nAll tests passed!");
} finally {
  if (tempDbName) {
    console.log(`\nDropping ${tempDbName}...`);
    await dropTempDb(DATABASE_URL, tempDbName);
  }
}
