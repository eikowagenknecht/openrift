import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

/**
 * Callers must validate `keys` against the table's current rows first: an
 * unmatched key is silently ignored, and a row missing from `keys` keeps its old position.
 */
export async function reorderBySortOrder(
  db: Kysely<Database>,
  options: {
    table: keyof Database;
    keyColumn: string;
    keys: readonly string[];
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
