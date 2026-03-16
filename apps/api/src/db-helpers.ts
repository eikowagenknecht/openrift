import type { Kysely, RawBuilder } from "kysely";
import { sql } from "kysely";

import type { Database } from "./db/index.js";

/**
 * Resolves the best available image URL for a printing (prefers rehosted).
 * @returns A raw SQL expression: COALESCE(alias.rehosted_url, alias.original_url)
 */
export function imageUrl(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`COALESCE(${sql.ref(`${alias}.rehostedUrl`)}, ${sql.ref(`${alias}.originalUrl`)})`;
}

/**
 * Base query: copies → printings → cards → front-face printing images (aliases: cp, p, c, pi).
 * @returns A Kysely SelectQueryBuilder with the four tables joined.
 */
export function selectCopyWithCard(db: Kysely<Database>) {
  return db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .innerJoin("cards as c", "c.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    );
}
