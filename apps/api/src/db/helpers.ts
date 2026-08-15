/**
 * Generic Kysely helpers for dynamic upsert operations.
 */

import type { SqlBool } from "kysely";
import { sql } from "kysely";

/**
 * Build a WHERE clause that checks if any of the given columns changed
 * (using IS DISTINCT FROM to handle NULLs correctly).
 * raw sql: columns are dynamic at runtime — Kysely supports 'is distinct from' operator
 * but only for static column refs; here columns come from a runtime array.
 * @returns A raw SQL boolean expression for the conflict WHERE clause.
 */
export function buildDistinctWhere(table: string, columns: readonly string[]) {
  return sql.raw<SqlBool>(
    columns.map((c) => `excluded.${c} IS DISTINCT FROM ${table}.${c}`).join("\n              OR "),
  );
}

/**
 * jsonb values need no serialization helper here, and adding one back would be
 * a mistake worth understanding.
 *
 * postgres.js picks a parameter's serializer from the type Postgres describes
 * for it, and for a jsonb parameter that serializer is `JSON.stringify`. So
 * hand it the value itself (`{ a: 1 }`, `[1, 2]`, `null`) and the column gets
 * the right structure. Hand it JSON *text* and the text is encoded a second
 * time, leaving a jsonb string scalar: `"{\"a\":1}"` rather than `{"a": 1}`.
 * The same rule applies on the way back, so a read only ever returns a string
 * when a string is genuinely what the column holds.
 *
 * That double encoding was the repo's longest-lived data bug. It corrupted nine
 * columns, and it stayed invisible because a defensive `JSON.parse` on every
 * read repaired the shape before any caller could notice. What makes it stay
 * fixed is the pair of guards, not vigilance:
 *
 * 1. Every jsonb column in `tables.ts` is typed as its parsed shape on the
 *    write side too, so `JSON.stringify(...)` at a call site is a type error.
 * 2. Every jsonb column carries a `jsonb_typeof` CHECK constraint, so a write
 *    that slips past the types (an `as never`, a raw `sql` fragment) is
 *    refused by the database instead of being stored. `jsonb-columns.integration.test.ts`
 *    fails if a new jsonb column ships without one.
 */
