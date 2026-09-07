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

const MIGRATIONS_FILE = "src/db/migrations/migrations.integration.test.ts";

const ALL_FILES = [...new Bun.Glob("src/**/*.integration.test.ts").scanSync({ cwd: repoRoot })]
  .map((file) => file.replaceAll("\\", "/"))
  .sort();

const PARALLEL_FILES = ALL_FILES.filter((file) => file !== MIGRATIONS_FILE);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("DATABASE_URL not set — skipping integration tests");
  process.exit(0);
}

if (ALL_FILES.length === 0) {
  console.error(
    `Integration runner: no src/**/*.integration.test.ts files found under ${repoRoot}.`,
  );
  process.exit(1);
}

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

// `finally` below doesn't run on SIGINT/SIGTERM, so without this a Ctrl-C
// leaks the shared DB. SIGKILL still isn't caught; the startup sweep reclaims it.
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
  // 60s: bun's 5s default is too tight for DB-bound tests under the
  // contention of 118 files sharing one database.
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
