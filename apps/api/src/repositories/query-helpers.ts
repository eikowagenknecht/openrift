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
 * Resolves the best available image URL from a card_images alias (prefers rehosted).
 * @returns A raw SQL expression: COALESCE(alias.rehosted_url, alias.original_url)
 */
export function imageUrl(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`COALESCE(${sql.ref(`${alias}.rehostedUrl`)}, ${sql.ref(`${alias}.originalUrl`)})`;
}

/**
 * Scalar subquery that assembles a card's domains from the junction table,
 * ordered by `ordinal`, as a Postgres text array.
 *
 * @param cardIdRef — SQL reference to the card ID column (e.g. "c.id", "cards.id")
 * @returns A raw SQL expression resolving to text[] (never NULL — empty cards shouldn't exist).
 */
export function domainsArray(cardIdRef: string): RawBuilder<string[]> {
  return sql<string[]>`(
    SELECT COALESCE(array_agg(cd.domain_slug ORDER BY cd.ordinal), '{}')
    FROM card_domains cd WHERE cd.card_id = ${sql.ref(cardIdRef)}
  )`;
}

/**
 * Scalar subquery that assembles a card's super types from the junction table
 * as a Postgres text array.
 *
 * @param cardIdRef — SQL reference to the card ID column (e.g. "c.id", "cards.id")
 * @returns A raw SQL expression resolving to text[].
 */
export function superTypesArray(cardIdRef: string): RawBuilder<string[]> {
  return sql<string[]>`(
    SELECT COALESCE(array_agg(cst.super_type_slug), '{}')
    FROM card_super_types cst WHERE cst.card_id = ${sql.ref(cardIdRef)}
  )`;
}

/**
 * Base query: copies → printings → cards → front-face printing images → card images
 * (aliases: cp, p, c, pi, ci).
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
    .leftJoin("cardImages as ci", "ci.id", "pi.cardImageId");
}
