/**
 * Generic Kysely helpers for dynamic upsert operations.
 */

import type { SqlBool } from "kysely";
import { sql } from "kysely";

/**
 * Build a `doUpdateSet` record that maps each column to its `excluded.*` value.
 * raw sql: columns are dynamic at runtime — eb.ref('excluded.col') only works for static columns.
 * @returns A record mapping column names to `excluded.<col>` SQL expressions.
 */
export function buildExcludedSet(columns: string[]) {
  // oxlint-disable-next-line typescript/no-explicit-any -- dynamic column mapping for Kysely doUpdateSet
  const set: Record<string, any> = {};
  for (const col of columns) {
    set[col] = sql.raw(`excluded.${col}`);
  }
  return set;
}

/**
 * Build a WHERE clause that checks if any of the given columns changed
 * (using IS DISTINCT FROM to handle NULLs correctly).
 * raw sql: columns are dynamic at runtime — Kysely supports 'is distinct from' operator
 * but only for static column refs; here columns come from a runtime array.
 * @returns A raw SQL boolean expression for the conflict WHERE clause.
 */
export function buildDistinctWhere(table: string, columns: string[]) {
  return sql.raw<SqlBool>(
    columns.map((c) => `excluded.${c} IS DISTINCT FROM ${table}.${c}`).join("\n              OR "),
  );
}
