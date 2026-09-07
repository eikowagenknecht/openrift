import type { SqlBool } from "kysely";
import { sql } from "kysely";

/**
 * Uses raw sql because Kysely's 'is distinct from' operator only supports
 * static column refs; here the columns come from a runtime array.
 */
export function buildDistinctWhere(table: string, columns: readonly string[]) {
  return sql.raw<SqlBool>(
    columns.map((c) => `excluded.${c} IS DISTINCT FROM ${table}.${c}`).join("\n              OR "),
  );
}

/**
 * postgres.js serializes a jsonb param from the raw value; JSON.stringify-ing
 * it first double-encodes into a jsonb string scalar. Never add one back.
 */
