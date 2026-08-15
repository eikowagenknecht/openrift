/**
 * Generic Kysely helpers for dynamic upsert operations.
 */

import type { RawBuilder, SqlBool } from "kysely";
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
 * Binds a JSON-serialized value as real jsonb. postgres.js serializes a bound
 * parameter according to the type Postgres describes for it, and for a jsonb
 * parameter that means another `JSON.stringify` — so JSON text lands in the
 * column as a jsonb *string scalar*, `"{\"a\":1}"` rather than `{"a": 1}`.
 * Reads survive that because {@link parseJsonb} unwraps either shape, but the
 * database sees a string: `jsonb_array_elements` fails with "cannot extract
 * elements from a scalar", and a `jsonb_typeof(col) = 'object'` check constraint
 * rejects the write outright.
 *
 * The double cast is what fixes it, and `::jsonb` alone does not: with a lone
 * cast Postgres still describes the parameter as jsonb and postgres.js still
 * re-encodes. Going through `::text` describes it as text, so the string is
 * sent verbatim and the database parses it into the actual structure. Use this
 * for every jsonb write — older tables predating it hold string scalars, which
 * is why reads stay defensive.
 *
 * @param value The JSON text, or null for a NULL column.
 * @returns A raw expression usable wherever the column's write type is string.
 */
export function asJsonb(value: string): RawBuilder<string> {
  return sql<string>`${value}::text::jsonb`;
}

/**
 * Nullable companion of {@link asJsonb} for optional jsonb columns.
 * @param value The JSON text, or null/undefined for a NULL column.
 * @returns The cast expression, or null.
 */
export function asJsonbNullable(value: string | null | undefined): RawBuilder<string> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asJsonb(value);
}

/**
 * Defensively parse a JSONB column value. postgres.js under Bun returns JSONB
 * columns as raw JSON strings even though the Kysely row type claims the
 * parsed shape, so repository reads of jsonb columns must go through this.
 * @returns The parsed value, or the value unchanged when already parsed.
 */
export function parseJsonb<T>(value: T | string | null): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

/**
 * {@link parseJsonb} for a NOT NULL jsonb column, where the null branch is
 * unreachable and a fallback value would only hide a schema change.
 * @returns The parsed value, or the value unchanged when already parsed.
 */
export function parseJsonbRequired<T>(value: T | string): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
