/* oxlint-disable import/no-nodejs-modules -- standalone test script that shells out to pg_dump */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Logger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { Migrator } from "kysely/migration";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestDb } from "../../test/integration-setup.js";
import { migrate, rollback } from "../migrate.js";
import type { Database } from "../types.js";
import { migrations } from "./index.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("migrations up/down cycle", () => {
  let db: Kysely<Database>;
  let log: Logger;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, log, teardown } = await setupTestDb(DATABASE_URL!, "migrations"));
  });

  afterAll(async () => {
    await teardown();
  });

  it("reports already up to date on second migrate", async () => {
    // setupTestDb already ran all migrations, so this is a no-op
    await migrate(db, log);
  });

  it("rolls back all migrations one by one", async () => {
    const count = Object.keys(migrations).length;
    for (let i = 0; i < count; i++) {
      await rollback(db, log);
    }
  });

  it("reports nothing to roll back on empty database", async () => {
    await rollback(db, log);
  });

  it("re-applies all migrations from scratch", async () => {
    await migrate(db, log);
  });
});

describe.skipIf(!DATABASE_URL)("migration order is clock-step resilient", () => {
  let db: Kysely<Database>;
  let log: Logger;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, log, teardown } = await setupTestDb(DATABASE_URL!, "migration_clock"));
  });

  afterAll(async () => {
    await teardown();
  });

  it("repairs a non-monotonic recorded order left by a backward clock step", async () => {
    const rows = await sql<{ name: string }>`SELECT name FROM kysely_migration`.execute(db);
    const canonicalNames = rows.rows.map((row) => row.name).sort();

    // Reproduce the corruption a mid-run backward wall-clock step leaves behind:
    // give the alphabetically-last migration the earliest timestamp, so ordering
    // the executed migrations by timestamp no longer matches the name order.
    const lastName = canonicalNames.at(-1);
    await sql`
      UPDATE kysely_migration SET timestamp = '1900-01-01T00:00:00.000Z' WHERE name = ${lastName}
    `.execute(db);

    // A plain Kysely migrator rejects the corrupted order outright — this is the
    // failure that made the up/down cycle flaky under load before the repair.
    const unrepaired = await new Migrator({
      db,
      // oxlint-disable-next-line prefer-await-to-then -- MigrationProvider wants a Promise
      provider: { getMigrations: () => Promise.resolve(migrations) },
    }).migrateToLatest();
    expect(unrepaired.error).toBeInstanceOf(Error);
    expect(String(unrepaired.error)).toContain("corrupted migrations");

    // migrate() normalizes the timestamps first, so it repairs the order and
    // succeeds instead of throwing.
    await migrate(db, log);

    // The recorded order (by timestamp, as Kysely reads it) now matches the
    // canonical name order again.
    const after = await sql<{ name: string; timestamp: string }>`
      SELECT name, timestamp FROM kysely_migration
    `.execute(db);
    const recordedOrder = [...after.rows]
      .sort(
        (first, second) =>
          new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime(),
      )
      .map((row) => row.name);
    expect(recordedOrder).toEqual(canonicalNames);
  });
});

/**
 * Strip pg_dump boilerplate so two dumps can be compared purely on schema content.
 * Removes: restrict tokens, SET statements, comments, empty lines, schema preamble.
 */
/**
 * Strip pg_dump boilerplate and normalize named NOT NULL constraints so two
 * dumps can be compared purely on schema content.
 *
 * Kysely's `.notNull()` produces unnamed NOT NULL constraints, while the
 * original hand-written migrations used named ones (e.g. `CONSTRAINT
 * sources_id_not_null NOT NULL`). PostgreSQL treats them identically but
 * pg_dump renders them differently, so we normalise both to plain `NOT NULL`.
 *
 * @returns The normalized dump string.
 */
function normalizeDump(raw: string): string {
  return raw
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("--") &&
        !line.startsWith(String.raw`\restrict`) &&
        !line.startsWith(String.raw`\unrestrict`) &&
        !line.startsWith("SET ") &&
        !line.startsWith("SELECT pg_catalog.") &&
        !line.startsWith("COMMENT ON SCHEMA") &&
        // The dev database carries out-of-band state for the experimental
        // Electric sync container (REPLICA IDENTITY FULL plus its
        // electric_publication_default publication); it is environment state,
        // not migration output, so snapshots taken from dev must not diff on
        // it. Scoped to electric_ publications so a real one in a migration
        // would still be compared.
        !line.includes("REPLICA IDENTITY") &&
        !line.startsWith("CREATE PUBLICATION electric_") &&
        !line.startsWith("ALTER PUBLICATION electric_") &&
        line.trim() !== "",
    )
    .map((line) => line.replaceAll("\t", "    ").trimEnd())
    .map((line) =>
      // Normalize named NOT NULL constraints to plain NOT NULL
      // e.g. "CONSTRAINT sources_id_not_null NOT NULL" → "NOT NULL"
      line.replaceAll(/\bCONSTRAINT \w+ NOT NULL\b/gu, "NOT NULL"),
    )
    .join("\n");
}

describe.skipIf(!DATABASE_URL)("schema snapshot matches migrations", () => {
  let db: Kysely<Database>;
  let dbName: string;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, teardown } = await setupTestDb(DATABASE_URL!, "schema_snapshot"));

    // Extract the database name from the connection
    const { rows } = await sql<{ name: string }>`select current_database() as name`.execute(db);
    dbName = rows[0]!.name;
  });

  afterAll(async () => {
    await teardown();
  });

  it("migrations produce the same schema as docs/schema.sql", () => {
    // Dump the freshly-migrated test database
    const testDump = execSync(
      `docker exec openrift-db-1 pg_dump -U openrift --schema-only --no-owner --no-privileges "${dbName}"`,
      { encoding: "utf-8", timeout: 15_000 },
    );

    // Read the committed schema snapshot
    const snapshotPath = resolve(import.meta.dirname, "../../../../../docs/schema.sql");
    const snapshotDump = readFileSync(snapshotPath, "utf-8");

    expect(normalizeDump(testDump)).toBe(normalizeDump(snapshotDump));
  });
});
