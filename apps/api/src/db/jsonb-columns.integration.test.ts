import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: the guard rails around jsonb writes.
//
// postgres.js serializes a bound parameter according to the type Postgres
// describes for it, and for a jsonb parameter that means JSON.stringify. Pass
// the value and the column gets the right structure; pass JSON *text* and it is
// encoded twice, landing as a jsonb string scalar. That bug corrupted nine
// columns and hid for months, because a defensive JSON.parse on every read
// repaired the shape before any caller could see it.
//
// Two things stop it coming back. The write-side column types in `tables.ts`
// make a stringified value a compile error, which this file cannot check. The
// other is a `jsonb_typeof` CHECK constraint per column, which it can: the
// first test fails when a new jsonb column ships without one, so the guard
// arrives with the column rather than after the next incident.
// ---------------------------------------------------------------------------

const ctx = createDbContext("jsonb-columns");

/**
 * `job_runs.result` is every job's own summary shape and has no single one — a
 * job may legitimately return an object, an array, or a scalar — so it is the
 * one column whose shape is not constrained. It still must never hold
 * double-encoded text, which the second test covers for every column alike.
 */
const SHAPE_EXEMPT = new Set(["job_runs.result"]);

describe.skipIf(!ctx)("jsonb columns", () => {
  const db = ctx!.db;

  /** @returns Every jsonb column in the public schema as `table.column`. */
  async function jsonbColumns(): Promise<string[]> {
    const rows = await sql<{ name: string }>`
      SELECT c.table_name || '.' || c.column_name AS name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.data_type = 'jsonb'
      ORDER BY 1
    `.execute(db);
    return rows.rows.map((row) => row.name);
  }

  it("guards every jsonb column with a jsonb_typeof CHECK", async () => {
    // Matched on the constraint's expression, not its name, so a column that
    // came with its own check (stage_presets, tier_lists) counts too.
    const guarded = await sql<{ name: string }>`
      SELECT rel.relname || '.' || att.attname AS name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
      WHERE ns.nspname = 'public'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%jsonb_typeof%'
    `.execute(db);

    const guardedNames = new Set(guarded.rows.map((row) => row.name));
    const columns = await jsonbColumns();
    const unguarded = columns.filter((name) => !guardedNames.has(name) && !SHAPE_EXEMPT.has(name));

    expect(unguarded).toEqual([]);
  });

  it("holds no double-encoded values in any jsonb column", async () => {
    // Both failure shapes a stringified write produces: `JSON.stringify(obj)`
    // lands as a jsonb string, and `JSON.stringify(null)` as a jsonb null
    // (which is not SQL NULL and satisfies no shape). Absence is SQL NULL.
    const offenders: string[] = [];
    for (const name of await jsonbColumns()) {
      const [table, column] = name.split(".");
      const row = await sql<{ scalars: string }>`
        SELECT count(*) AS scalars
        FROM ${sql.ref(table!)}
        WHERE jsonb_typeof(${sql.ref(column!)}) IN ('string', 'null')
      `.execute(db);
      if (Number(row.rows[0]!.scalars) > 0) {
        offenders.push(name);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("writes a JS null as SQL NULL, not as a jsonb null", async () => {
    // The legacy writers stringified an explicit null into the text "null",
    // which double-encoded and then unwrapped to a jsonb null that no shape
    // constraint accepts. Passing the value straight through does the right
    // thing, and this pins that so a helper can't quietly come back.
    await sql`CREATE TABLE jsonb_null_probe (v jsonb)`.execute(db);

    try {
      await db
        .insertInto("jsonb_null_probe" as never)
        .values({ v: null } as never)
        .execute();

      const row = await sql<{ isSqlNull: boolean; shape: string | null }>`
        SELECT v IS NULL AS "isSqlNull", jsonb_typeof(v) AS shape FROM jsonb_null_probe
      `.execute(db);
      expect(row.rows[0]!.isSqlNull).toBe(true);
      expect(row.rows[0]!.shape).toBeNull();
    } finally {
      await sql`DROP TABLE jsonb_null_probe`.execute(db);
    }
  });

  it("stores a value passed as an object, and refuses one passed as JSON text", async () => {
    // The end-to-end statement of the rule, on a throwaway table shaped like a
    // real one: the same call that used to corrupt silently now raises.
    // A real table rather than a TEMPORARY one, because the pool can run the
    // create and the insert on different connections and a temp table is
    // session-scoped. Dropped in `finally` so a failure cannot leak it into the
    // shared database.
    await sql`
      CREATE TABLE jsonb_rule_probe (
        v jsonb NOT NULL CONSTRAINT chk_probe CHECK (jsonb_typeof(v) = 'object')
      )
    `.execute(db);

    try {
      await db
        .insertInto("jsonb_rule_probe" as never)
        .values({ v: { a: 1 } } as never)
        .execute();
      const stored = await sql<{ t: string }>`
        SELECT jsonb_typeof(v) AS t FROM jsonb_rule_probe
      `.execute(db);
      expect(stored.rows[0]!.t).toBe("object");

      await expect(
        db
          .insertInto("jsonb_rule_probe" as never)
          .values({ v: JSON.stringify({ a: 1 }) } as never)
          .execute(),
      ).rejects.toThrow(/chk_probe/u);
    } finally {
      await sql`DROP TABLE jsonb_rule_probe`.execute(db);
    }
  });
});
