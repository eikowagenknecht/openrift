/* oxlint-disable import/no-nodejs-modules, typescript/no-non-null-assertion -- standalone script */
/**
 * Integration test orchestrator.
 *
 * Creates ONE shared temporary database, runs migrations, loads seed data,
 * inserts test users, then spawns bun test processes. Drops the DB on exit.
 *
 * Usage: bun --env-file=../../.env run src/test/run-integration.ts
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { bootstrapSeededTestDb, dropTempDb, sweepStaleTestDatabases } from "./integration-setup.js";

// ---------------------------------------------------------------------------
// Test file groups
// ---------------------------------------------------------------------------

/**
 * Files that can all run in a single parallel bun test invocation.
 *
 * This list is kept in sync with the actual integration test files — `bun test`
 * silently ignores file args that don't exist, so a stale/mistyped path means a
 * test file is dropped from the run without any error. Earlier these had drifted
 * (route tests live under routes/authenticated/, several files moved to
 * routes/public/, and a few listed files had been deleted), which silently
 * dropped ~124 tests. If you add/move/delete an integration test file, update
 * this list (it must equal every src/**\/*.integration.test.ts except the
 * migrations file, which runs separately below).
 */
const PARALLEL_FILES = [
  "src/auth-rate-limit.integration.test.ts",
  "src/authorization.integration.test.ts",
  // Authenticated routes
  "src/routes/authenticated/collections.integration.test.ts",
  "src/routes/authenticated/copies.integration.test.ts",
  "src/routes/authenticated/collection-events.integration.test.ts",
  "src/routes/authenticated/lists.integration.test.ts",
  "src/routes/authenticated/deck-check-player.integration.test.ts",
  "src/routes/authenticated/tournament-deck-check.integration.test.ts",
  "src/routes/authenticated/decks.integration.test.ts",
  "src/routes/authenticated/preferences.integration.test.ts",
  // Unified tournaments umbrella (ADR-033)
  "src/routes/authenticated/organizations.integration.test.ts",
  "src/routes/authenticated/tournaments.integration.test.ts",
  "src/routes/authenticated/tournaments-run.integration.test.ts",
  "src/routes/public/tournaments.integration.test.ts",
  "src/routes/public/deck-check-ingest.integration.test.ts",
  // Public routes
  "src/routes/public/health.integration.test.ts",
  "src/routes/public/init.integration.test.ts",
  "src/routes/public/site-settings.integration.test.ts",
  "src/routes/public/prices.integration.test.ts",
  "src/routes/public/catalog.integration.test.ts",
  "src/routes/public/landing-summary.integration.test.ts",
  "src/routes/public/optional-auth-caching.integration.test.ts",
  // Admin routes
  "src/routes/admin/admin-core.integration.test.ts",
  "src/routes/admin/catalog.integration.test.ts",
  "src/routes/admin/marketplace-groups.integration.test.ts",
  "src/routes/admin/marketplace-mapping.integration.test.ts",
  "src/routes/admin/unified-mappings.integration.test.ts",
  "src/routes/admin/ignored-products.integration.test.ts",
  "src/routes/admin/feature-flags.integration.test.ts",
  "src/routes/admin/ignored-candidates.integration.test.ts",
  "src/routes/admin/operations.integration.test.ts",
  "src/routes/admin/images.integration.test.ts",
  "src/routes/admin/provider-settings.integration.test.ts",
  "src/routes/admin/site-settings.integration.test.ts",
  "src/routes/admin/rules.integration.test.ts",
  "src/routes/admin/cards/queries.integration.test.ts",
  "src/routes/admin/cards/mutations.integration.test.ts",
  "src/routes/admin/cards/images.integration.test.ts",
  // Services
  "src/services/price-refresh/upsert.integration.test.ts",
  "src/services/ingest-candidates.integration.test.ts",
  "src/services/ingest-user-submission.integration.test.ts",
  "src/services/printing-admin.integration.test.ts",
  // Repositories
  "src/repositories/admins.integration.test.ts",
  "src/repositories/candidate-cards.integration.test.ts",
  "src/repositories/catalog.integration.test.ts",
  "src/repositories/collection-events.integration.test.ts",
  "src/repositories/collections.integration.test.ts",
  "src/repositories/copies.integration.test.ts",
  "src/repositories/decks.integration.test.ts",
  "src/repositories/feature-flags.integration.test.ts",
  "src/repositories/friend-groups.integration.test.ts",
  "src/repositories/health.integration.test.ts",
  "src/repositories/ignored-candidates.integration.test.ts",
  "src/repositories/job-runs.integration.test.ts",
  "src/repositories/keywords.integration.test.ts",
  "src/repositories/lists.integration.test.ts",
  "src/repositories/marketplace-admin.integration.test.ts",
  "src/repositories/marketplace-mapping.integration.test.ts",
  "src/repositories/marketplace.integration.test.ts",
  "src/repositories/price-refresh.integration.test.ts",
  "src/repositories/printing-images.integration.test.ts",
  "src/repositories/provider-settings.integration.test.ts",
  "src/repositories/rules.integration.test.ts",
  "src/repositories/sets.integration.test.ts",
  "src/repositories/site-settings.integration.test.ts",
  "src/repositories/user-preferences.integration.test.ts",
  "src/repositories/user-shares.integration.test.ts",
  "src/repositories/user-contact-methods.integration.test.ts",
  "src/repositories/deck-plans.integration.test.ts",
  "src/repositories/organizations-rebalance.integration.test.ts",
  "src/repositories/pod-tournaments.integration.test.ts",
  // Unified tournaments umbrella (ADR-033)
  "src/repositories/tournaments-schema.integration.test.ts",
  // Card trades (ADR-019)
  "src/repositories/card-trades.integration.test.ts",
  // Trade email notifications (ADR-030)
  "src/services/trade-request-email.integration.test.ts",
  "src/services/trade-request-coalesce.integration.test.ts",
  "src/services/trade-status-email.integration.test.ts",
  "src/services/trade-match-digest.integration.test.ts",
  "src/routes/public/unsubscribe.integration.test.ts",
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

// Fail loudly if any listed test file is missing. bun test silently ignores
// non-existent file args, so without this a mistyped/stale path drops a whole
// test file from the run with no error (this is how ~124 tests went dark).
{
  const repoRoot = resolve(import.meta.dirname!, "../..");
  const missing = [...PARALLEL_FILES, ...MOCK_MODULE_FILES, MIGRATIONS_FILE].filter(
    (file) => !existsSync(resolve(repoRoot, file)),
  );
  if (missing.length > 0) {
    console.error(
      `Integration runner: ${missing.length} listed test file(s) do not exist:\n  ${missing.join("\n  ")}\n` +
        "Update PARALLEL_FILES in run-integration.ts to match the real files.",
    );
    process.exit(1);
  }
}

// The reverse guard: fail loudly if any integration test file on disk is NOT
// registered above. Without this, simply forgetting to add a new file to
// PARALLEL_FILES silently drops it from every run (that is how the trade-request
// -coalesce and trade-status-email tests went dark). Together with the existence
// check above, the registered set must be exactly the files on disk.
{
  const repoRoot = resolve(import.meta.dirname!, "../..");
  const registered = new Set([...PARALLEL_FILES, ...MOCK_MODULE_FILES, MIGRATIONS_FILE]);
  const onDisk = [...new Bun.Glob("src/**/*.integration.test.ts").scanSync({ cwd: repoRoot })].map(
    (file) => file.replaceAll("\\", "/"),
  );
  const unregistered = onDisk.filter((file) => !registered.has(file)).sort();
  if (unregistered.length > 0) {
    console.error(
      `Integration runner: ${unregistered.length} integration test file(s) exist but are not registered:\n  ${unregistered.join("\n  ")}\n` +
        "Add each to PARALLEL_FILES (or MOCK_MODULE_FILES / MIGRATIONS_FILE) in run-integration.ts.",
    );
    process.exit(1);
  }
}

const coverageArgs = process.env.COVERAGE
  ? ["--coverage", "--coverage-reporter=text", "--coverage-reporter=lcov"]
  : [];

let tempDbName = "";

// Best-effort cleanup if the run is interrupted. The `finally` below only runs
// on a normal exit or a thrown error, not on SIGINT/SIGTERM, so without this a
// Ctrl-C or a `kill` leaks the shared DB. (SIGKILL and hard crashes still can't
// be caught. The startup sweep reclaims those on the next run.)
let shuttingDown = false;
async function cleanupAndExit(code: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (tempDbName) {
    console.log(`\nInterrupted, dropping ${tempDbName}...`);
    try {
      await dropTempDb(DATABASE_URL!, tempDbName);
    } catch {
      // Nothing more we can do while going down. The sweep catches it later.
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => void cleanupAndExit(130));
process.on("SIGTERM", () => void cleanupAndExit(143));

try {
  // 0. Reclaim leftovers from earlier interrupted runs (killed processes never
  // reach teardown). Age cutoff keeps a concurrently-running run's fresh DBs.
  const STALE_TEST_DB_AGE_MS = 30 * 60 * 1000;
  const swept = await sweepStaleTestDatabases(DATABASE_URL, STALE_TEST_DB_AGE_MS);
  if (swept.length > 0) {
    console.log(`Swept ${swept.length} stale test database(s): ${swept.join(", ")}`);
  }

  // 1. Create shared temp database, migrate, seed, insert test users
  console.log("Creating shared integration database...");
  const bootstrap = await bootstrapSeededTestDb(DATABASE_URL, "shared", {
    refreshMaterializedViews: true,
  });
  tempDbName = bootstrap.tempDbName;
  const testUrl = bootstrap.testUrl;

  // 2. Run tests
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

  // Batch 3: migrations test (own temp DB, uses DATABASE_URL directly).
  // Needs a longer timeout than bun's 5s default: setupTestDb applies all ~100
  // migrations in beforeAll, and the up/down cycle rolls every one back and
  // re-applies — comfortably over 5s under DB contention from the parallel batch.
  console.log(`\nRunning ${MIGRATIONS_FILE} (own temp DB)...`);
  const migrationsCoverageDir =
    coverageArgs.length > 0 ? ["--coverage-dir=./coverage/integration-migrations"] : [];
  const migrationsResult = Bun.spawnSync(
    [
      "bun",
      "test",
      "--timeout",
      "60000",
      ...coverageArgs,
      ...migrationsCoverageDir,
      MIGRATIONS_FILE,
    ],
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
  // 3. Drop temp database
  if (tempDbName) {
    console.log(`\nDropping ${tempDbName}...`);
    await dropTempDb(DATABASE_URL, tempDbName);
  }
}
