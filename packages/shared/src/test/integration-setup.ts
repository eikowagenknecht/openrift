import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { migrate } from "../db/migrate.js";
import type { Database } from "../db/types.js";
import type { Logger } from "../logger.js";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
export const noop = () => {};

export const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
} as unknown as Logger;

export function replaceDbName(url: string, dbName: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
}

/**
 * Create a temporary database (drops first if leftover from a crash).
 *
 * @returns The generated database name.
 */
export async function createTempDb(databaseUrl: string, label: string): Promise<string> {
  const name = `openrift_test_${label}_${Date.now()}`;
  const adminSql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  await adminSql.end();
  return name;
}

/** Drop a temporary database. */
export async function dropTempDb(databaseUrl: string, name: string): Promise<void> {
  const sql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  await sql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await sql.end();
}

/**
 * Creates a temporary test database, runs all migrations, and returns a
 * Kysely instance pointed at it.  Call `teardown()` in afterAll to drop the
 * database and close connections.
 *
 * @returns The Kysely db, a noop logger, and a teardown function.
 */
export async function setupTestDb(databaseUrl: string, label?: string) {
  const dbName = label ? `openrift_test_${label}_${Date.now()}` : `openrift_test_${Date.now()}`;
  const adminUrl = replaceDbName(databaseUrl, "postgres");

  // Create the test database via the maintenance DB
  const adminSql = postgres(adminUrl, { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
  await adminSql.end();

  // Connect and run migrations
  const testUrl = replaceDbName(databaseUrl, dbName);
  const db = new Kysely<Database>({
    dialect: new PostgresJSDialect({ postgres: postgres(testUrl, { onnotice: noop }) }),
  });
  await migrate(db, noopLogger);

  if (process.env.KEEP_TEST_DB) {
    console.log(`Test database: ${dbName}`);
  }

  return {
    db,
    log: noopLogger,
    teardown: async () => {
      await db.destroy();
      const sql = postgres(adminUrl, { onnotice: noop });
      await sql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
      await sql.end();
    },
  };
}
