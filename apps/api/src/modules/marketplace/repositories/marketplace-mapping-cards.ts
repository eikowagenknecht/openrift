import type { Marketplace } from "@openrift/shared/types/pricing";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { imageUrlWithOriginal, joinFrontImage } from "../../../repositories/query-helpers.js";

type Db = Kysely<Database>;

export function marketplaceMappingCardsRepo(db: Db) {
  return {
    allCardsWithPrintings(marketplace: Marketplace) {
      return (
        joinFrontImage(
          db
            .selectFrom("cards as c")
            .innerJoin("printings as p", "p.cardId", "c.id")
            .innerJoin("sets as s", "s.id", "p.setId")
            .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
            .leftJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
            .leftJoin("marketplaceProducts as mp", (join) =>
              join
                .onRef("mp.id", "=", "mpv.marketplaceProductId")
                .on("mp.marketplace", "=", marketplace),
            ),
        )
          .select([
            "c.id as cardId",
            "c.slug as cardSlug",
            "c.name as cardName",
            "mca.domains",
            "mca.superTypes",
            "c.energy",
            "c.might",
            "p.id as printingId",
            "s.slug as setId",
            "p.shortCode",
            "p.rarity",
            "s.name as setName",
            "p.artVariant",
            "p.isSigned",
            "p.isOvernumbered",
            "p.markerSlugs",
            "p.finish",
            "p.size",
            "p.language",
            imageUrlWithOriginal("imgf").as("imageUrl"),
            "mp.externalId as externalId",
            "mp.groupId as sourceGroupId",
            "mp.language as sourceLanguage",
            "mp.finish as productFinish",
          ])
          // A printing can have variants for multiple marketplaces. The variant join
          // returns one row per variant, but the product join filters by marketplace,
          // so variants from other marketplaces appear as null product rows. Drop
          // those here — keep only (a) printings with no variant at all, or (b) rows
          // where the variant's parent product matched the requested marketplace.
          .where((eb) => eb.or([eb("mpv.id", "is", null), eb("mp.id", "is not", null)]))
          .orderBy("s.slug")
          .orderBy("c.name")
          .orderBy("p.shortCode")
          .orderBy("p.finish", "desc")
          // Tiebreak on language then id so EN consistently lands before SC
          // (and printings stay in a stable order across refetches). Without
          // this the suggestion algorithm picked an arbitrary language when
          // two printings tied on score.
          .orderBy("p.language")
          .orderBy("p.id")
          .execute()
      );
    },

    /**
     * Like `allCardsWithPrintings` but returns variant rows for every
     * marketplace in a single query; the caller must filter rows down to the
     * per-marketplace shape (see deriveCardsForMarketplace).
     *
     * `cardIdentifier` accepts UUID or slug so callers don't have to serialize
     * a slug → id lookup before this query.
     */
    allCardsWithPrintingsUnified(cardIdentifier?: string) {
      let query = joinFrontImage(
        db
          .selectFrom("cards as c")
          .innerJoin("printings as p", "p.cardId", "c.id")
          .innerJoin("sets as s", "s.id", "p.setId")
          .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
          .leftJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
          .leftJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
          .leftJoin("marketplaceGroups as mg", (join) =>
            join
              .onRef("mg.marketplace", "=", "mp.marketplace")
              .onRef("mg.groupId", "=", "mp.groupId"),
          )
          .leftJoin("sets as gs", "gs.id", "mg.setId"),
      ).select([
        "c.id as cardId",
        "c.slug as cardSlug",
        "c.name as cardName",
        "mca.domains",
        "mca.superTypes",
        "c.energy",
        "c.might",
        "p.id as printingId",
        "s.slug as setId",
        "p.shortCode",
        "p.rarity",
        "s.name as setName",
        "p.artVariant",
        "p.isSigned",
        "p.isOvernumbered",
        "p.markerSlugs",
        "p.finish",
        "p.size",
        "p.language",
        imageUrlWithOriginal("imgf").as("imageUrl"),
        "mp.marketplace as variantMarketplace",
        "mp.externalId as externalId",
        "mp.groupId as sourceGroupId",
        "mg.name as sourceGroupName",
        "mg.groupKind as sourceGroupKind",
        "gs.slug as sourceGroupSetSlug",
        "mp.language as sourceLanguage",
        "mp.finish as productFinish",
      ]);
      if (cardIdentifier !== undefined) {
        query = query.where((eb) =>
          eb.or([
            eb(sql<string>`c.id::text`, "=", cardIdentifier),
            eb("c.slug", "=", cardIdentifier),
          ]),
        );
      }
      return (
        query
          .orderBy("s.slug")
          .orderBy("c.name")
          .orderBy("p.shortCode")
          .orderBy("p.finish", "desc")
          // Same tiebreakers as `allCardsWithPrintings` — keep printings in a
          // stable EN-before-SC order so suggestion ranking is deterministic.
          .orderBy("p.language")
          .orderBy("p.id")
          .execute()
      );
    },

    async assignableCards() {
      const result = await sql<{
        cardId: string;
        cardSlug: string;
        cardName: string;
        setName: string;
        shortCodes: string[];
      }>`
        SELECT
          c.id as "cardId",
          c.slug as "cardSlug",
          c.name as "cardName",
          s.name as "setName",
          COALESCE(array_agg(p.short_code ORDER BY p.short_code) FILTER (WHERE p.short_code IS NOT NULL), ARRAY[]::text[]) as "shortCodes"
        FROM cards c
        INNER JOIN printings p ON p.card_id = c.id
        INNER JOIN sets s ON s.id = p.set_id
        GROUP BY c.id, c.slug, c.name, s.name
      `.execute(db);
      return result.rows;
    },

    printingFinishesAndLanguages(printingIds: string[]) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "language"])
        .where("id", "in", printingIds)
        .execute();
    },

    /**
     * Every card alias as (cardId, normName), for the longest-alias tiebreak
     * done in JS. Rows include both the auto-seeded card-name alias and any
     * manually-added aliases (e.g. reprints, renamed cards) — a large share of
     * aliases differ from the card's name, so the cheaper "use cardName only"
     * shortcut would misroute products.
     */
    allCardAliases() {
      return db
        .selectFrom("cardNameAliases")
        .select(["cardId", "normName"])
        .where("normName", "<>", "")
        .execute();
    },

    /**
     * Staging rows across the given marketplaces that could belong to one
     * card, via manual override OR a normalized-name prefix/substring match
     * against the card's aliases. Used by the scoped card-detail endpoint so
     * it doesn't have to fetch every marketplace's full staging set.
     *
     * Does **not** perform the longest-alias tiebreak — returns every
     * name-match candidate and lets the caller drop rows whose longest
     * matching alias belongs to another card. The tiebreak as a SQL NOT EXISTS
     * anti-join measured ~10× slower on real data (nested loop over every
     * card's aliases per candidate row) than returning the small candidate set
     * and filtering in JS with an in-memory alias index.
     *
     * `cardIdentifier` can be UUID or slug — resolved inside the query so the
     * caller doesn't need a separate lookup. Ignored products (level 2) and
     * ignored variants (level 3) are filtered out. Each (marketplace,
     * external_id, finish, language) tuple is deduplicated to its most-recent
     * staging snapshot. `isOverride` is true when a manual override points at
     * this card for the given tuple.
     *
     * Relies on the GIN trigram index on marketplace_products.norm_name to
     * keep the LIKE filters index-backed.
     */
    async stagingForCardAcrossMarketplaces(cardIdentifier: string, marketplaces: Marketplace[]) {
      if (marketplaces.length === 0) {
        return [];
      }
      const result = await sql<{
        marketplace: Marketplace;
        externalId: number;
        productName: string;
        finish: string;
        /** `null` on the marketplaces that don't split SKUs by language (CM/TCG). */
        language: string | null;
        groupId: number;
        groupName: string | null;
        groupKind: "basic" | "special";
        groupSetSlug: string | null;
        marketCents: number | null;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
        recordedAt: Date;
        isOverride: boolean;
      }>`
        WITH target_card AS (
          SELECT id FROM cards WHERE id::text = ${cardIdentifier} OR slug = ${cardIdentifier} LIMIT 1
        ),
        target_aliases AS (
          SELECT cna.norm_name
          FROM card_name_aliases cna
          JOIN target_card tc ON cna.card_id = tc.id
          WHERE cna.norm_name <> ''
        ),
        -- Candidate product IDs. Three branches UNIONed so the planner can use
        -- the GIN trigram index on marketplace_products.norm_name for the LIKE
        -- filters. The prefix/substring matches may include rows that actually
        -- belong to a different card whose alias is longer (e.g. alias
        -- blastcone prefix-matches blastconefae product) — the caller does
        -- that tiebreak in JS where it is cheap against 1k aliases.
        candidate_ids AS (
          SELECT mp.id
          FROM marketplace_products mp
          JOIN marketplace_product_card_overrides ov ON ov.marketplace_product_id = mp.id
          JOIN target_card tc ON ov.card_id = tc.id
          WHERE mp.marketplace = ANY(${marketplaces}::text[])
          UNION
          SELECT mp.id
          FROM marketplace_products mp, target_aliases a
          WHERE mp.marketplace = ANY(${marketplaces}::text[])
            AND mp.norm_name LIKE a.norm_name || '%'
          UNION
          SELECT mp.id
          FROM marketplace_products mp, target_aliases a
          WHERE mp.marketplace = ANY(${marketplaces}::text[])
            AND length(a.norm_name) >= 5
            AND mp.norm_name LIKE '%' || a.norm_name || '%'
        ),
        matched AS (
          SELECT
            mp.id,
            mp.marketplace,
            mp.external_id,
            mp.product_name,
            mp.finish,
            mp.language,
            mp.group_id,
            latest.market_cents,
            latest.low_cents,
            latest.mid_cents,
            latest.high_cents,
            latest.trend_cents,
            latest.avg1_cents,
            latest.avg7_cents,
            latest.avg30_cents,
            latest.recorded_at
          FROM marketplace_products mp
          INNER JOIN LATERAL (
            SELECT *
            FROM marketplace_product_prices pp
            WHERE pp.marketplace_product_id = mp.id
            ORDER BY pp.recorded_at DESC
            LIMIT 1
          ) latest ON true
          WHERE mp.id IN (SELECT id FROM candidate_ids)
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_ignored_products ip
              WHERE ip.marketplace = mp.marketplace AND ip.external_id = mp.external_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_ignored_variants iv
              WHERE iv.marketplace_product_id = mp.id
            )
            -- Already-bound products aren't candidates for new suggestions.
            -- Matches today's behaviour where saveMappings deletes the staging
            -- row on assign.
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_product_variants mpv
              WHERE mpv.marketplace_product_id = mp.id
            )
        )
        SELECT
          m.marketplace,
          m.external_id as "externalId",
          m.product_name as "productName",
          m.finish,
          m.language,
          m.group_id as "groupId",
          g.name as "groupName",
          g.group_kind as "groupKind",
          gs.slug as "groupSetSlug",
          m.market_cents as "marketCents",
          m.low_cents as "lowCents",
          m.mid_cents as "midCents",
          m.high_cents as "highCents",
          m.trend_cents as "trendCents",
          m.avg1_cents as "avg1Cents",
          m.avg7_cents as "avg7Cents",
          m.avg30_cents as "avg30Cents",
          m.recorded_at as "recordedAt",
          EXISTS (
            SELECT 1 FROM marketplace_product_card_overrides ov, target_card tc
            WHERE ov.marketplace_product_id = m.id
              AND ov.card_id = tc.id
          ) as "isOverride"
        FROM matched m
        LEFT JOIN marketplace_groups g
          ON g.marketplace = m.marketplace AND g.group_id = m.group_id
        LEFT JOIN sets gs ON gs.id = g.set_id
        ORDER BY m.marketplace, m.product_name
      `.execute(db);
      return result.rows;
    },
  };
}
