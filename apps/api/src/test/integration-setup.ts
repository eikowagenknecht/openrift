// oxlint-disable-next-line import/no-nodejs-modules -- test bootstrap reads the seed fixture from disk
import { readFileSync } from "node:fs";

import type { Logger } from "@openrift/shared/logger";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import type { Database } from "../db/types.js";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
export const noop = () => {};

export const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
} as unknown as Logger;

export function replaceDbName(url: string, dbName: string): string {
  return url.replace(/\/[^/?]+(?<tail>\?|$)/u, `/${dbName}$<tail>`);
}

/**
 * Monotonic per-process counter so two temp DBs created within the same
 * millisecond in one process still get distinct names.
 */
let tempDbSeq = 0;

/**
 * Create a temporary database (drops first if leftover from a crash).
 *
 * The name is `openrift_test_<label>_<epoch-ms>_<pid>_<seq>`. The timestamp
 * stays first so {@link sweepStaleTestDatabases} can drop old leftovers by age;
 * the `<pid>_<seq>` suffix guarantees uniqueness. Without it, two runs on the
 * shared server (all worktrees point at one `.env`/DB) could generate the same
 * `Date.now()` name, then one run's `DROP IF EXISTS` would delete the other's
 * fresh DB and both would `migrate()` the same database concurrently, leaving a
 * corrupted (partial) migration table.
 *
 * @returns The generated database name.
 */
export async function createTempDb(databaseUrl: string, label: string): Promise<string> {
  const name = `openrift_test_${label}_${Date.now()}_${process.pid}_${tempDbSeq++}`;
  const adminSql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  // WITH (FORCE) terminates any lingering sessions before dropping (PG13+), so a
  // leftover DB with a stray connection can't block the create.
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  await adminSql.end();
  return name;
}

/**
 * Drop a temporary database.
 * Skipped when KEEP_TEST_DB is set — use `bun run db:cleanup` to drop later.
 */
export async function dropTempDb(databaseUrl: string, name: string): Promise<void> {
  if (process.env.KEEP_TEST_DB) {
    console.log(`KEEP_TEST_DB: preserving ${name}`);
    return;
  }
  const sql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  // WITH (FORCE) terminates other sessions then drops, atomically (PG13+) —
  // replaces the old terminate-then-drop pair.
  await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await sql.end();
}

/**
 * List all test databases (names starting with `openrift_test_`).
 *
 * @returns An array of database names.
 */
export async function listTestDatabases(databaseUrl: string): Promise<string[]> {
  const sql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  const rows = await sql<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE 'openrift_test_%'
  `;
  await sql.end();
  return rows.map((r) => r.datname);
}

/**
 * Extract the creation epoch-ms embedded in a temp-DB name
 * (`openrift_test_<label>_<epoch-ms>[_<pid>_<seq>]`). Tolerates the legacy
 * suffix-less format so old leftovers are still sweepable.
 *
 * @returns The epoch-ms timestamp, or `null` if the name doesn't match.
 */
export function parseTestDbTimestamp(name: string): number | null {
  const match = /^openrift_test_[^_]+_(?<timestamp>\d+)/u.exec(name);
  if (!match?.groups) {
    return null;
  }
  const timestamp = Number(match.groups.timestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Drop test databases older than `maxAgeMs`, judged by the epoch-ms in their
 * name. Run at the start of an integration run so leftovers from interrupted
 * runs (killed processes never reach teardown) are reclaimed automatically. The
 * age cutoff protects a concurrently-running run's fresh DB from being dropped.
 *
 * @returns The names that were dropped.
 */
export async function sweepStaleTestDatabases(
  databaseUrl: string,
  maxAgeMs: number,
  now: number = Date.now(),
): Promise<string[]> {
  const all = await listTestDatabases(databaseUrl);
  const stale = all.filter((name) => {
    const timestamp = parseTestDbTimestamp(name);
    return timestamp !== null && now - timestamp > maxAgeMs;
  });
  for (const name of stale) {
    await dropTempDb(databaseUrl, name);
  }
  return stale;
}

/** A pre-seeded user available to every integration test file. */
export interface TestUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Test user registry — pre-seeded users for test files that reference them
 * without inserting them. Shared by the integration and coverage runners so
 * the two can never drift apart (they once did: the coverage runner's copy
 * was missing users 0054+, so trade tests could not have run under it).
 *
 * Do NOT add entries for new test files. New files own their users: generate
 * IDs with `crypto.randomUUID()` at module scope and insert them via
 * `seedTestUser` (test/integration-context.ts) in `beforeAll`. Fixed IDs in a
 * shared database couple files together — a plain insert collides with a
 * pre-seeded row, and a teardown delete breaks any later file that still
 * needs the row.
 */
export const TEST_USERS: TestUser[] = [
  // User-scoped tests
  { id: "a0000000-0001-4000-a000-000000000001", email: "user-0001@test.com", isAdmin: false },
  { id: "a0000000-0002-4000-a000-000000000001", email: "user-0002@test.com", isAdmin: false },
  { id: "a0000000-0003-4000-a000-000000000001", email: "user-0003@test.com", isAdmin: false },
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
  { id: "a0000000-0026-4000-a000-000000000001", email: "repo-0026@test.com", isAdmin: false },
  { id: "a0000000-0027-4000-a000-000000000001", email: "repo-0027@test.com", isAdmin: false },
  { id: "a0000000-0028-4000-a000-000000000001", email: "repo-0028@test.com", isAdmin: false },
  { id: "a0000000-0029-4000-a000-000000000001", email: "repo-0029@test.com", isAdmin: false },
  { id: "a0000000-0030-4000-a000-000000000001", email: "repo-0030@test.com", isAdmin: false },
  { id: "a0000000-0031-4000-a000-000000000001", email: "repo-0031@test.com", isAdmin: true },
  // Batch 2 — repo coverage tests
  { id: "a0000000-0034-4000-a000-000000000001", email: "repo-0034@test.com", isAdmin: false },
  { id: "a0000000-0035-4000-a000-000000000001", email: "repo-0035@test.com", isAdmin: false },
  { id: "a0000000-0037-4000-a000-000000000001", email: "repo-0037@test.com", isAdmin: false },
  { id: "a0000000-0038-4000-a000-000000000001", email: "repo-0038@test.com", isAdmin: false },
  { id: "a0000000-0039-4000-a000-000000000001", email: "repo-0039@test.com", isAdmin: false },
  { id: "a0000000-0040-4000-a000-000000000001", email: "repo-0040@test.com", isAdmin: false },
  { id: "a0000000-0041-4000-a000-000000000001", email: "repo-0041@test.com", isAdmin: false },
  { id: "a0000000-0042-4000-a000-000000000001", email: "repo-0042@test.com", isAdmin: false },
  { id: "a0000000-0043-4000-a000-000000000001", email: "repo-0043@test.com", isAdmin: false },
  // Route integration tests — public + authenticated coverage
  { id: "a0000000-0044-4000-a000-000000000001", email: "user-0044@test.com", isAdmin: false },
  // Batch 3 — admin route integration tests (pre-promoted)
  { id: "a0000000-0045-4000-a000-000000000001", email: "admin-0045@test.com", isAdmin: true },
  { id: "a0000000-0046-4000-a000-000000000001", email: "admin-0046@test.com", isAdmin: true },
  { id: "a0000000-0047-4000-a000-000000000001", email: "admin-0047@test.com", isAdmin: true },
  { id: "a0000000-0048-4000-a000-000000000001", email: "admin-0048@test.com", isAdmin: true },
  // Non-admin user for admin route 403 checks
  { id: "a0000000-0049-4000-a000-000000000001", email: "user-0049@test.com", isAdmin: false },
  // Second user for the deck-clone route test ("clone as another user").
  { id: "a0000000-0008-4000-a000-000000000002", email: "user-0008b@test.com", isAdmin: false },
  // Second user for the preferences route test (clean-first-PATCH
  // emailNotifications round-trip, ADR-030).
  { id: "a0000000-0044-4000-a000-000000000002", email: "user-0044b@test.com", isAdmin: false },
  // user-contact-methods repo tests (0056, 0057) and deck-plans repo tests
  // (0058) reference these without inserting them
  { id: "a0000000-0056-4000-a000-000000000001", email: "repo-0056@test.com", isAdmin: false },
  { id: "a0000000-0057-4000-a000-000000000001", email: "req-0057@test.com", isAdmin: false },
  { id: "a0000000-0058-4000-a000-000000000001", email: "req-0058@test.com", isAdmin: false },
  // Products snapshot service tests (ADR-015)
  { id: "a0000000-0197-4000-a000-000000000001", email: "repo-0197@test.com", isAdmin: false },
  // card-review grant tests (ADR-040 lineage): one admin control, one
  // non-admin grant holder (the test file seeds its admin_grants row itself)
  { id: "a0000000-0198-4000-a000-000000000001", email: "admin-0198@test.com", isAdmin: true },
  { id: "a0000000-0199-4000-a000-000000000001", email: "crg-0199@test.com", isAdmin: false },
  // API key auth tests (migration 200)
  { id: "a0000000-0200-4000-a000-000000000001", email: "key-0200@test.com", isAdmin: false },
];

/**
 * Insert the {@link TEST_USERS} registry (promoting the admin-flagged ones).
 *
 * @returns Resolves once every user row (and admin row) is inserted.
 */
export async function insertTestUsers(db: Kysely<Database>): Promise<void> {
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
}

/**
 * Shared bootstrap for the integration/coverage runners: create a temporary
 * database, run migrations, load the seed fixture, and insert the test-user
 * registry, logging each step. On failure the temp database is dropped before
 * rethrowing, so the caller only has to drop it after a successful bootstrap.
 *
 * @returns The temp database name (for the caller's teardown) and the
 *   connection URL pointing at it.
 */
export async function bootstrapSeededTestDb(
  databaseUrl: string,
  label: string,
  options?: { refreshMaterializedViews?: boolean },
): Promise<{ tempDbName: string; testUrl: string }> {
  const tempDbName = await createTempDb(databaseUrl, label);
  const testUrl = replaceDbName(databaseUrl, tempDbName);
  console.log(`  → ${tempDbName}`);

  try {
    console.log("Running migrations...");
    const { db } = createDb(testUrl);
    await migrate(db, noopLogger);

    console.log("Loading seed data...");
    const seedSql = readFileSync(new URL("fixtures/seed.sql", import.meta.url), "utf-8");
    const sql = postgres(testUrl, { onnotice: noop });
    await sql.unsafe(seedSql);
    if (options?.refreshMaterializedViews) {
      // Migrations create the views before the seed data exists.
      console.log("Refreshing materialized views...");
      await sql`REFRESH MATERIALIZED VIEW mv_card_aggregates`;
      // Daily before latest — the latest view is defined over the daily one
      // (migration 219), so refreshing it first would publish an empty result.
      await sql`REFRESH MATERIALIZED VIEW mv_daily_printing_prices`;
      await sql`REFRESH MATERIALIZED VIEW mv_latest_printing_prices`;
      // Without this every seeded printing falls back to the sentinel rank and
      // `printings_ordered` returns them in arbitrary order (migration 215).
      await sql`REFRESH MATERIALIZED VIEW mv_printings_canonical_rank`;
    }
    await sql.end();

    console.log("Inserting test users...");
    await insertTestUsers(db);
    await db.destroy();
  } catch (error) {
    await dropTempDb(databaseUrl, tempDbName);
    throw error;
  }

  return { tempDbName, testUrl };
}

/**
 * Creates a temporary test database, runs all migrations, and returns a
 * Kysely instance pointed at it.  Call `teardown()` in afterAll to drop the
 * database and close connections.
 *
 * @returns The Kysely db, a noop logger, and a teardown function.
 */
export async function setupTestDb(databaseUrl: string, label: string) {
  const dbName = await createTempDb(databaseUrl, label);

  // Connect and run migrations
  const testUrl = replaceDbName(databaseUrl, dbName);
  const db = new Kysely<Database>({
    dialect: new PostgresJSDialect({ postgres: postgres(testUrl, { onnotice: noop }) }),
  });
  await migrate(db, noopLogger);

  return {
    db,
    log: noopLogger,
    teardown: async () => {
      await db.destroy();
      await dropTempDb(databaseUrl, dbName);
    },
  };
}
