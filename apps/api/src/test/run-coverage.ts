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
import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import { bootstrapSeededTestDb, dropTempDb } from "./integration-setup.js";

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
const unitFiles = collectFiles(resolve(cwd, "src"), cwd, /^(?!.*integration).*\.test\.ts$/u);

// Use the exact same curated list from run-integration.ts for integration tests
// (bun test finds files by pattern, so paths like "src/routes/collections.integration.test.ts"
// resolve to "src/routes/authenticated/collections.integration.test.ts" automatically)
const integrationFiles = [
  "src/authorization.integration.test.ts",
  "src/routes/collections.integration.test.ts",
  "src/routes/copies.integration.test.ts",
  "src/routes/collection-events.integration.test.ts",
  "src/routes/lists.integration.test.ts",
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
  "src/repositories/lists.integration.test.ts",
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
  "src/routes/admin/rules.integration.test.ts",
  "src/repositories/rules.integration.test.ts",
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

  // 2. Create shared temp database for integration tests (migrate + seed +
  // test users)
  console.log("\nCreating shared test database...");
  const bootstrap = await bootstrapSeededTestDb(DATABASE_URL, "coverage");
  tempDbName = bootstrap.tempDbName;
  const testUrl = bootstrap.testUrl;

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
