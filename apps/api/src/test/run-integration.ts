/* oxlint-disable import/no-nodejs-modules, typescript/no-non-null-assertion -- standalone script */
/**
 * Integration test orchestrator.
 *
 * Creates ONE shared temporary database, runs migrations, loads seed data,
 * inserts test users, then spawns bun test processes. Drops the DB on exit.
 *
 * Usage: bun --env-file=../../.env run src/test/run-integration.ts
 */

import { resolve } from "node:path";

import { bootstrapSeededTestDb, dropTempDb, sweepStaleTestDatabases } from "./integration-setup.js";

const repoRoot = resolve(import.meta.dirname!, "../..");

/** Migrations test — always gets its own temp DB, so it is excluded from the shared batch. */
const MIGRATIONS_FILE = "src/db/migrations/migrations.integration.test.ts";

/**
 * Every integration test file, discovered from disk rather than hand-listed.
 *
 * A hand-maintained list had two silent-failure modes, both of which bit us:
 * `bun test` ignores file args that don't exist, so a stale path dropped a file
 * from the run without an error (~124 tests once went dark), and a new test file
 * nobody remembered to register never ran at all. Globbing removes both by
 * construction. Sorted because every file in the parallel batch shares one
 * database, so the execution order has to be deterministic across machines.
 */
const ALL_FILES = [...new Bun.Glob("src/**/*.integration.test.ts").scanSync({ cwd: repoRoot })]
  .map((file) => file.replaceAll("\\", "/"))
  .sort();

const PARALLEL_FILES = ALL_FILES.filter((file) => file !== MIGRATIONS_FILE);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("DATABASE_URL not set — skipping integration tests");
  process.exit(0);
}

// The glob is the only thing standing between us and a run that quietly tests
// nothing, so verify it actually found something. An empty result means the cwd
// or the pattern is wrong, and every downstream step would still report success.
if (ALL_FILES.length === 0) {
  console.error(
    `Integration runner: no src/**/*.integration.test.ts files found under ${repoRoot}.`,
  );
  process.exit(1);
}

// MIGRATIONS_FILE is the one path still written by hand. If it is renamed the
// filter above stops matching, and bun test silently ignores the stale arg — so
// the migrations test would vanish from the run while everything looked green.
if (!ALL_FILES.includes(MIGRATIONS_FILE)) {
  console.error(
    `Integration runner: ${MIGRATIONS_FILE} does not exist.\n` +
      "Update MIGRATIONS_FILE in run-integration.ts to match the real path.",
  );
  process.exit(1);
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
  // Reclaim leftovers from earlier interrupted runs (killed processes never
  // reach teardown). Age cutoff keeps a concurrently-running run's fresh DBs.
  const STALE_TEST_DB_AGE_MS = 30 * 60 * 1000;
  const swept = await sweepStaleTestDatabases(DATABASE_URL, STALE_TEST_DB_AGE_MS);
  if (swept.length > 0) {
    console.log(`Swept ${swept.length} stale test database(s): ${swept.join(", ")}`);
  }

  console.log("Creating shared integration database...");
  const bootstrap = await bootstrapSeededTestDb(DATABASE_URL, "shared", {
    refreshMaterializedViews: true,
  });
  tempDbName = bootstrap.tempDbName;
  const testUrl = bootstrap.testUrl;

  const env = { ...process.env, INTEGRATION_DB_URL: testUrl };
  let failed = false;

  console.log(`\nRunning ${PARALLEL_FILES.length} test files in parallel...`);
  const parallelCoverageDir =
    coverageArgs.length > 0 ? ["--coverage-dir=./coverage/integration-parallel"] : [];
  // Same 60s as the migrations spawn below, for the same reason: enum-checks
  // applies every migration through setupTestDb in beforeAll, which passed
  // bun's 5s default once the migration count grew and then failed whenever the
  // machine was busy. The batch shares one database across 118 files, so bun's
  // default is too tight a budget for anything DB-bound under contention.
  const parallelResult = Bun.spawnSync(
    [
      "bun",
      "test",
      "--timeout",
      "60000",
      ...coverageArgs,
      ...parallelCoverageDir,
      ...PARALLEL_FILES,
    ],
    {
      cwd: repoRoot,
      env,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (parallelResult.exitCode !== 0) {
    failed = true;
  }

  // Migrations test gets its own temp DB and uses DATABASE_URL directly.
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
      cwd: repoRoot,
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
  if (tempDbName) {
    console.log(`\nDropping ${tempDbName}...`);
    await dropTempDb(DATABASE_URL, tempDbName);
  }
}
