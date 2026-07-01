import type { Logger } from "@openrift/shared/logger";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

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
