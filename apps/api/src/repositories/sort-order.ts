import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Rewrites a reference table's `sort_order` column so the rows land in the
 * given key order, in a single statement. Positions are always 0-based, so the
 * stored numbers stay comparable across taxonomies; nothing reads `sort_order`
 * as anything other than an `ORDER BY` term.
 *
 * Callers are expected to have validated `keys` against the table's current
 * rows first (see `assertValidReorder`) — a key that matches no row is silently
 * ignored here, and a row whose key is missing from `keys` keeps its old
 * position.
 *
 * Table and column names are Kysely's camelCase spellings; the
 * `CamelCasePlugin` converts them on the way out. `keyType` must match the
 * column's SQL type, since the joined VALUES list needs an explicit cast for
 * Postgres to infer the parameter types.
 *
 * @returns void once the update has run (a no-op for an empty key list).
 */
export async function reorderBySortOrder(
  db: Kysely<Database>,
  options: {
    /** Kysely table name, e.g. `"artVariants"`. */
    table: keyof Database;
    /** Kysely name of the column `keys` holds values for, e.g. `"slug"`. */
    keyColumn: string;
    /** The keys in their new order. */
    keys: readonly string[];
    /** SQL type of `keyColumn`. Defaults to `"text"`. */
    keyType?: "text" | "uuid";
  },
): Promise<void> {
  const { table, keyColumn, keys, keyType = "text" } = options;
  if (keys.length === 0) {
    return;
  }

  const cast = sql.raw(keyType);
  const values = sql.join(keys.map((key, i) => sql`(${key}::${cast}, ${i}::int)`));
  await sql`
    update ${sql.table(table)}
    set sort_order = d.new_order
    from (values ${values}) as d(key, new_order)
    where ${sql.ref(`${table}.${keyColumn}`)} = d.key
  `.execute(db);
}
