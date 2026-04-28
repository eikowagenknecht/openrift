import type { Kysely, RawBuilder } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Resolve card_id dynamically: direct card name match → alias match → candidate printing match.
 * candidate_cards no longer stores card_id — matching is always derived from the
 * card name or a previously-created card_name_alias.
 * Uses indexed norm_name columns for fast equality lookups.
 *
 * @param alias — the candidate_cards table alias used in the query (e.g. "cs")
 * @returns A raw SQL expression resolving to the card UUID or NULL.
 */
export const resolveCardId = (alias: string): RawBuilder<string | null> =>
  sql<string | null>`COALESCE(
    (SELECT c_res.id FROM cards c_res WHERE c_res.norm_name = ${sql.ref(`${alias}.normName`)} LIMIT 1),
    (SELECT cna_res.card_id FROM card_name_aliases cna_res WHERE cna_res.norm_name = ${sql.ref(`${alias}.normName`)} LIMIT 1),
    (SELECT p_res.card_id FROM candidate_printings ps_res JOIN printings p_res ON p_res.short_code = ps_res.short_code JOIN candidate_cards cs_res ON cs_res.id = ps_res.candidate_card_id WHERE cs_res.norm_name = ${sql.ref(`${alias}.normName`)} LIMIT 1)
  )`;

/**
 * Resolves the image_files.id (UUID) for a self-hosted image. Returns NULL
 * when the row hasn't been rehosted yet, so callers can keep the existing
 * `IS NOT NULL` filter to exclude external-only entries from public pages.
 * The client constructs variant URLs from this ID via `imageUrl()` in shared.
 * @returns A raw SQL expression: alias.id (or NULL if not rehosted)
 */
export function imageId(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`CASE WHEN ${sql.ref(`${alias}.rehostedUrl`)} IS NOT NULL THEN ${sql.ref(`${alias}.id`)} ELSE NULL END`;
}

/**
 * Resolves the best available image URL, falling back to the original provider URL.
 * Use this only in admin contexts where showing external images is acceptable.
 * @returns A raw SQL expression: COALESCE(alias.rehosted_url, alias.original_url)
 */
export function imageUrlWithOriginal(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`COALESCE(${sql.ref(`${alias}.rehostedUrl`)}, ${sql.ref(`${alias}.originalUrl`)})`;
}

/**
 * Base query: copies → printings → cards → front-face printing images → image files
 * (aliases: cp, p, c, pi, imgf).
 * @returns A Kysely SelectQueryBuilder with the five tables joined.
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
    )
    .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId");
}
