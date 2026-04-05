/* oxlint-disable import/no-nodejs-modules -- standalone test script that shells out to pg_dump */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Logger } from "../../logger.js";
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
        line.trim() !== "",
    )
    .map((line) => line.replaceAll("\t", "    ").trimEnd())
    .map((line) =>
      // Normalize named NOT NULL constraints to plain NOT NULL
      // e.g. "CONSTRAINT sources_id_not_null NOT NULL" → "NOT NULL"
      line.replaceAll(/\bCONSTRAINT \w+ NOT NULL\b/g, "NOT NULL"),
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
    const [row] = await db
      .selectFrom(db.fn("current_database", []).as("name"))
      .select("name")
      .execute();
    dbName = row.name as string;
  });

  afterAll(async () => {
    await teardown();
  });

  it("migrations produce the same schema as docs/schema.sql", () => {
    // Dump the freshly-migrated test database
    const testDump = execSync(
      `docker exec openrift-db-1 pg_dump -U openrift --schema-only --no-owner --no-privileges "${dbName}"`,
      { encoding: "utf8", timeout: 15_000 },
    );

    // Read the committed schema snapshot
    const snapshotPath = resolve(import.meta.dirname, "../../../../../docs/schema.sql");
    const snapshotDump = readFileSync(snapshotPath, "utf8");

    expect(normalizeDump(testDump)).toBe(normalizeDump(snapshotDump));
  });
});
