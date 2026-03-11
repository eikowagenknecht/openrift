import type { RawBuilder } from "kysely";
import { sql } from "kysely";

/**
 * Resolves the best available image URL for a printing (prefers rehosted).
 * @returns A raw SQL expression: COALESCE(alias.rehosted_url, alias.original_url)
 */
export function imageUrl(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`COALESCE(${sql.ref(`${alias}.rehosted_url`)}, ${sql.ref(`${alias}.original_url`)})`;
}
