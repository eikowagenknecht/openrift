import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { imageUrlWithOriginal } from "./query-helpers.js";

type Db = Kysely<Database>;

/**
 * Queries for the marketplace mapping workflow (mapping external products
 * to internal printings).
 *
 * @returns An object with marketplace-mapping query methods bound to the given `db`.
 */
export function marketplaceMappingRepo(db: Db) {
  return {
    /** @returns Level-2 ignored products (whole upstream listings) for a marketplace. */
    ignoredProducts(marketplace: string) {
      return db
        .selectFrom("marketplaceIgnoredProducts")
        .select(["externalId", "productName", "createdAt"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    /** @returns Level-3 ignored variants (specific SKUs of an upstream product) for a marketplace. */
    ignoredVariants(marketplace: string) {
      return db
        .selectFrom("marketplaceIgnoredVariants as iv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "iv.marketplaceProductId")
        .select([
          "mp.externalId as externalId",
          "iv.finish as finish",
          "iv.language as language",
          "iv.productName as productName",
          "iv.createdAt as createdAt",
        ])
        .where("mp.marketplace", "=", marketplace)
        .execute();
    },

    /**
     * Latest staging snapshot per (external_id, finish, language) for a marketplace.
     * Historical price snapshots are deduped at the DB so the caller doesn't ship
     * ~20× more rows than it actually uses.
     * @returns One row per distinct variant, holding the most recent recorded_at.
     */
    async allStaging(marketplace: string) {
      const result = await sql<{
        marketplace: string;
        externalId: number;
        groupId: number;
        productName: string;
        finish: string;
        language: string;
        recordedAt: Date;
        marketCents: number | null;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }>`
        SELECT DISTINCT ON (external_id, finish, language)
          marketplace,
          external_id as "externalId",
          group_id as "groupId",
          product_name as "productName",
          finish,
          language,
          recorded_at as "recordedAt",
          market_cents as "marketCents",
          low_cents as "lowCents",
          mid_cents as "midCents",
          high_cents as "highCents",
          trend_cents as "trendCents",
          avg1_cents as "avg1Cents",
          avg7_cents as "avg7Cents",
          avg30_cents as "avg30Cents"
        FROM marketplace_staging
        WHERE marketplace = ${marketplace}
        ORDER BY external_id, finish, language, recorded_at DESC
      `.execute(db);
      return result.rows;
    },

    /** @returns Group display names for a marketplace. */
    groupNames(marketplace: string) {
      return db
        .selectFrom("marketplaceGroups")
        .select(["groupId as gid", "name"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    /** @returns All cards with their printings, sets, marketplace variant mappings, and images. */
    allCardsWithPrintings(marketplace: string) {
      return (
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
          )
          .leftJoin("printingImages as pi", (join) =>
            join
              .onRef("pi.printingId", "=", "p.id")
              .on("pi.face", "=", "front")
              .on("pi.isActive", "=", true),
          )
          .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
          .select([
            "c.id as cardId",
            "c.slug as cardSlug",
            "c.name as cardName",
            "c.type as cardType",
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
            "p.markerSlugs",
            "p.finish",
            "p.language",
            imageUrlWithOriginal("ci").as("imageUrl"),
            "mp.externalId as externalId",
            "mp.groupId as sourceGroupId",
            "mpv.language as sourceLanguage",
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
          .execute()
      );
    },

    /**
     * Like `allCardsWithPrintings` but returns variant rows for every marketplace
     * in a single query. Lets the unified mapping endpoint fetch the heavy
     * cards × printings × images joins once instead of three times. The caller
     * must filter rows down to the per-marketplace shape (see deriveCardsForMarketplace).
     *
     * Pass `cardIdentifier` (UUID or slug) to scope the query to one card —
     * used by the card-detail admin page which only needs mappings for the
     * card it's viewing. Accepting either form means callers don't have to
     * serialize a slug → id lookup before this query.
     * @returns One row per (printing × variant), plus one row per printing with no variant in any marketplace.
     */
    allCardsWithPrintingsUnified(cardIdentifier?: string) {
      let query = db
        .selectFrom("cards as c")
        .innerJoin("printings as p", "p.cardId", "c.id")
        .innerJoin("sets as s", "s.id", "p.setId")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .leftJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
        .leftJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
        .select([
          "c.id as cardId",
          "c.slug as cardSlug",
          "c.name as cardName",
          "c.type as cardType",
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
          "p.markerSlugs",
          "p.finish",
          "p.language",
          imageUrlWithOriginal("ci").as("imageUrl"),
          "mp.marketplace as variantMarketplace",
          "mp.externalId as externalId",
          "mp.groupId as sourceGroupId",
          "mpv.language as sourceLanguage",
        ]);
      if (cardIdentifier !== undefined) {
        query = query.where((eb) =>
          eb.or([
            eb(sql<string>`c.id::text`, "=", cardIdentifier),
            eb("c.slug", "=", cardIdentifier),
          ]),
        );
      }
      return query
        .orderBy("s.slug")
        .orderBy("c.name")
        .orderBy("p.shortCode")
        .orderBy("p.finish", "desc")
        .execute();
    },

    /**
     * Lightweight card+printings list for the "assign to card" dropdown in the
     * admin marketplace UI. Returns every card with its display metadata and
     * the set of short codes across its printings — enough for the dropdown
     * without pulling the full cards × printings × images × variants join.
     * @returns One entry per card, with its short codes aggregated.
     */
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

    /** @returns Manual card overrides for a marketplace. */
    stagingCardOverrides(marketplace: string) {
      return db
        .selectFrom("marketplaceStagingCardOverrides")
        .select(["externalId", "finish", "language", "cardId"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    // ── saveMappings queries ────────────────────────────────────────────────

    /** @returns Printing finishes and languages by IDs. */
    printingFinishesAndLanguages(printingIds: string[]) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "language"])
        .where("id", "in", printingIds)
        .execute();
    },

    /** @returns All staging rows for given external IDs in a marketplace. */
    stagingByExternalIds(marketplace: string, externalIds: number[]) {
      return db
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    /**
     * Fetch already-upserted product rows by external ID. Used by `saveMappings`
     * to rebind a variant to a different printing when staging has rotated out
     * but the upstream product record is still present — reuses the existing
     * `group_id` and `product_name` as a fallback so the upsert can proceed.
     * @returns One row per external ID with its display name and group ID.
     */
    productsByExternalIds(marketplace: string, externalIds: number[]) {
      if (externalIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProducts")
        .select(["externalId", "productName", "groupId"])
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    /**
     * Batch-upsert marketplace products and their variants.
     *
     * For each input row: upserts the parent upstream product (keyed on
     * `marketplace, external_id`) then upserts the per-SKU variant (keyed on
     * `marketplace_product_id, finish, language`) pointing at the given printing.
     *
     * @returns One row per input, each with `printingId` and the resulting `variantId`.
     */
    async upsertProductVariants(
      values: {
        marketplace: string;
        printingId: string;
        externalId: number;
        groupId: number;
        productName: string;
        finish: string;
        /** `null` for cross-language aggregate variants (e.g. Cardmarket). */
        language: string | null;
      }[],
    ): Promise<{ printingId: string; variantId: string }[]> {
      if (values.length === 0) {
        return [];
      }

      const productRows = values.map((v) => ({
        marketplace: v.marketplace,
        externalId: v.externalId,
        groupId: v.groupId,
        productName: v.productName,
      }));

      const products = await db
        .insertInto("marketplaceProducts")
        .values(productRows)
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId"]).doUpdateSet({
            groupId: sql<number>`excluded.group_id`,
            productName: sql<string>`excluded.product_name`,
          }),
        )
        .returning(["id", "marketplace", "externalId"])
        .execute();

      const productIdByKey = new Map(
        products.map((p) => [`${p.marketplace}::${p.externalId}`, p.id]),
      );

      const variantRows = values.map((v) => {
        const productId = productIdByKey.get(`${v.marketplace}::${v.externalId}`);
        if (!productId) {
          throw new Error(
            `upsertProductVariants: missing product id for ${v.marketplace} ${v.externalId}`,
          );
        }
        return {
          marketplaceProductId: productId,
          printingId: v.printingId,
          finish: v.finish,
          language: v.language,
        };
      });

      const variants = await db
        .insertInto("marketplaceProductVariants")
        .values(variantRows)
        .onConflict((oc) =>
          oc
            .columns(["marketplaceProductId", "finish", "language"])
            .doUpdateSet({ printingId: sql<string>`excluded.printing_id` }),
        )
        .returning(["id", "printingId"])
        .execute();

      return variants.map((v) => ({ printingId: v.printingId, variantId: v.id }));
    },

    /** Batch-insert snapshots with conflict resolution. */
    async insertSnapshots(
      rows: {
        variantId: string;
        recordedAt: Date;
        marketCents: number | null;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }[],
    ): Promise<void> {
      if (rows.length === 0) {
        return;
      }
      await db
        .insertInto("marketplaceSnapshots")
        .values(rows)
        .onConflict((oc) =>
          oc.columns(["variantId", "recordedAt"]).doUpdateSet({
            marketCents: sql<number | null>`excluded.market_cents`,
            lowCents: sql<number | null>`excluded.low_cents`,
            midCents: sql<number | null>`excluded.mid_cents`,
            highCents: sql<number | null>`excluded.high_cents`,
            trendCents: sql<number | null>`excluded.trend_cents`,
            avg1Cents: sql<number | null>`excluded.avg1_cents`,
            avg7Cents: sql<number | null>`excluded.avg7_cents`,
            avg30Cents: sql<number | null>`excluded.avg30_cents`,
          }),
        )
        .execute();
    },

    /** Delete staging rows by marketplace and (externalId, finish, language) tuples. */
    async deleteStagingTuples(
      marketplace: string,
      tuples: { externalId: number; finish: string; language: string }[],
    ): Promise<void> {
      if (tuples.length === 0) {
        return;
      }
      const values = tuples.map((t) => sql`(${t.externalId}::integer, ${t.finish}, ${t.language})`);
      await sql`
        DELETE FROM marketplace_staging
        WHERE marketplace = ${marketplace}
          AND (external_id, finish, language) IN (VALUES ${sql.join(values)})
      `.execute(db);
    },

    // ── unmapPrinting queries ───────────────────────────────────────────────

    /**
     * @returns The variant mapping for a printing in a given marketplace, with
     *          the parent product's external_id, group_id, and product_name inlined.
     */
    getVariantForPrinting(marketplace: string, printingId: string) {
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.id as variantId",
          "mpv.marketplaceProductId as marketplaceProductId",
          "mpv.finish as finish",
          "mpv.language as language",
          "mp.externalId as externalId",
          "mp.groupId as groupId",
          "mp.productName as productName",
          "mp.marketplace as marketplace",
        ])
        .where("mp.marketplace", "=", marketplace)
        .where("mpv.printingId", "=", printingId)
        .executeTakeFirst();
    },

    /** @returns A printing's finish and language by ID. */
    getPrintingFinishAndLanguage(printingId: string) {
      return db
        .selectFrom("printings")
        .select(["finish", "language"])
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
    },

    /** @returns All snapshots for a variant ID. */
    snapshotsByVariantId(variantId: string) {
      return db
        .selectFrom("marketplaceSnapshots")
        .selectAll()
        .where("variantId", "=", variantId)
        .execute();
    },

    /** Delete all snapshots for a variant ID. */
    async deleteSnapshotsByVariantId(variantId: string): Promise<void> {
      await db.deleteFrom("marketplaceSnapshots").where("variantId", "=", variantId).execute();
    },

    /**
     * Delete a marketplace variant by ID. The parent product row is left in
     * place as an orphan — it still represents a known upstream listing and
     * may be re-mapped later without re-creating the product.
     */
    async deleteVariantById(id: string): Promise<void> {
      await db.deleteFrom("marketplaceProductVariants").where("id", "=", id).execute();
    },

    // ── unmapAll queries ────────────────────────────────────────────────────

    /** @returns Count of mapped variants for a marketplace. */
    async countMappedVariants(marketplace: string): Promise<number> {
      const result = await db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("mp.marketplace", "=", marketplace)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    /** Delete all snapshots for variants of a marketplace. */
    async deleteSnapshotsForMappedVariants(marketplace: string): Promise<void> {
      await sql`
        DELETE FROM marketplace_snapshots
        WHERE variant_id IN (
          SELECT mpv.id FROM marketplace_product_variants mpv
          JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
          WHERE mp.marketplace = ${marketplace}
        )
      `.execute(db);
    },

    /**
     * Delete all mapped variants for a marketplace, leaving parent products
     * as orphans. (Orphan products are harmless — they still represent upstream
     * listings and may be re-mapped later without being re-created.)
     */
    async deleteMappedVariants(marketplace: string): Promise<void> {
      await sql`
        DELETE FROM marketplace_product_variants mpv
        USING marketplace_products mp
        WHERE mp.id = mpv.marketplace_product_id
          AND mp.marketplace = ${marketplace}
      `.execute(db);
    },

    // ── per-card detail queries ─────────────────────────────────────────────

    /**
     * Variants visible to each printing of a card, including sibling fan-out.
     *
     * Siblings share everything except language; language-aggregate variants
     * (Cardmarket, stored with `language = NULL`) surface on every sibling,
     * while exact-language variants stay pinned to their owner printing.
     * Callers compare `ownerPrintingId` vs `targetPrintingId` to decide whether
     * a row is owned or inherited.
     *
     * @returns One row per (printing, variant) pair visible to any printing of
     *          the card.
     */
    async variantsForCard(cardId: string): Promise<
      {
        targetPrintingId: string;
        marketplace: string;
        externalId: number;
        productName: string;
        finish: string;
        variantLanguage: string | null;
        ownerPrintingId: string;
        ownerLanguage: string;
      }[]
    > {
      const result = await sql<{
        targetPrintingId: string;
        marketplace: string;
        externalId: number;
        productName: string;
        finish: string;
        variantLanguage: string | null;
        ownerPrintingId: string;
        ownerLanguage: string;
      }>`
        SELECT
          target.id as "targetPrintingId",
          mp.marketplace as "marketplace",
          mp.external_id as "externalId",
          mp.product_name as "productName",
          mpv.finish as "finish",
          mpv.language as "variantLanguage",
          source.id as "ownerPrintingId",
          source.language as "ownerLanguage"
        FROM printings target
        JOIN printings source
          ON source.card_id = target.card_id
          AND source.short_code = target.short_code
          AND source.finish = target.finish
          AND source.art_variant = target.art_variant
          AND source.is_signed = target.is_signed
          AND source.marker_slugs = target.marker_slugs
        JOIN marketplace_product_variants mpv ON mpv.printing_id = source.id
        JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
        WHERE target.card_id = ${cardId}
          AND (mpv.language IS NULL OR source.id = target.id)
      `.execute(db);
      return result.rows;
    },

    /**
     * Staging rows across all marketplaces that could plausibly be assigned to
     * a card, via either a manual card override OR a normalized-name match.
     *
     * The name match mirrors `matchStagedProducts` in the mapping service:
     * prefix match against the card's name aliases (normalized to lowercase +
     * alphanumeric), plus a containment check for longer names (>=5 chars),
     * which catches champion-prepended products like "KaiSa Daughter of the
     * Void". When another card has a strictly longer alias that would match
     * the same staging row, defer to that card — otherwise e.g. "Blastcone
     * Fae" products (alias `blastconefae`) would surface under "Blast Cone"
     * (alias `blastcone`, which is a prefix). Ignored products (level 2) and
     * ignored variants (level 3) are filtered out. Each (marketplace,
     * external_id, finish, language) tuple is deduplicated to its most-recent
     * staging snapshot.
     *
     * Staging rows are already removed when a variant is assigned (see
     * `saveMappings`), so this query only surfaces truly unmapped candidates.
     *
     * @returns One row per unique staged SKU that could be assigned to the card.
     */
    async stagingCandidatesForCard(
      cardId: string,
      normNames: string[],
    ): Promise<
      {
        marketplace: string;
        externalId: number;
        productName: string;
        finish: string;
        language: string;
        groupId: number;
        groupName: string | null;
        marketCents: number | null;
        lowCents: number | null;
        recordedAt: Date;
      }[]
    > {
      if (normNames.length === 0) {
        return [];
      }
      const result = await sql<{
        marketplace: string;
        externalId: number;
        productName: string;
        finish: string;
        language: string;
        groupId: number;
        groupName: string | null;
        marketCents: number | null;
        lowCents: number | null;
        recordedAt: Date;
      }>`
        WITH aliases AS (
          SELECT unnest(${normNames}::text[]) AS norm_name
        ),
        -- Each branch joins staging against the alias CTE so the planner can use
        -- the GIN trigram index on marketplace_staging.norm_name. A single OR'd
        -- EXISTS forces a seq scan because the index can't be pushed through it.
        -- The NOT EXISTS anti-join suppresses matches where another card owns a
        -- strictly longer alias that also matches the staging row — that card is
        -- the more specific owner. The override branch skips this check so manual
        -- assignments always win.
        candidate_ids AS (
          SELECT s.id
          FROM marketplace_staging s
          JOIN marketplace_staging_card_overrides ov
            ON ov.marketplace = s.marketplace
           AND ov.external_id = s.external_id
           AND ov.finish = s.finish
           AND ov.language = s.language
          WHERE ov.card_id = ${cardId}
          UNION
          SELECT s.id
          FROM marketplace_staging s, aliases a
          WHERE a.norm_name <> ''
            AND s.norm_name LIKE a.norm_name || '%'
            AND NOT EXISTS (
              SELECT 1 FROM card_name_aliases cna
              WHERE cna.card_id <> ${cardId}::uuid
                AND length(cna.norm_name) > length(a.norm_name)
                AND (
                  (cna.norm_name <> '' AND s.norm_name LIKE cna.norm_name || '%')
                  OR (length(cna.norm_name) >= 5 AND s.norm_name LIKE '%' || cna.norm_name || '%')
                )
            )
          UNION
          SELECT s.id
          FROM marketplace_staging s, aliases a
          WHERE length(a.norm_name) >= 5
            AND s.norm_name LIKE '%' || a.norm_name || '%'
            AND NOT EXISTS (
              SELECT 1 FROM card_name_aliases cna
              WHERE cna.card_id <> ${cardId}::uuid
                AND length(cna.norm_name) > length(a.norm_name)
                AND (
                  (cna.norm_name <> '' AND s.norm_name LIKE cna.norm_name || '%')
                  OR (length(cna.norm_name) >= 5 AND s.norm_name LIKE '%' || cna.norm_name || '%')
                )
            )
        ),
        matched AS (
          SELECT DISTINCT ON (s.marketplace, s.external_id, s.finish, s.language)
            s.marketplace,
            s.external_id,
            s.product_name,
            s.finish,
            s.language,
            s.group_id,
            s.market_cents,
            s.low_cents,
            s.recorded_at
          FROM marketplace_staging s
          WHERE s.id IN (SELECT id FROM candidate_ids)
          AND NOT EXISTS (
            SELECT 1 FROM marketplace_ignored_products ip
            WHERE ip.marketplace = s.marketplace
              AND ip.external_id = s.external_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM marketplace_ignored_variants iv
            JOIN marketplace_products mp ON mp.id = iv.marketplace_product_id
            WHERE mp.marketplace = s.marketplace
              AND mp.external_id = s.external_id
              AND iv.finish = s.finish
              AND iv.language = s.language
          )
          ORDER BY
            s.marketplace,
            s.external_id,
            s.finish,
            s.language,
            s.recorded_at DESC
        )
        SELECT
          m.marketplace,
          m.external_id as "externalId",
          m.product_name as "productName",
          m.finish,
          m.language,
          m.group_id as "groupId",
          g.name as "groupName",
          m.market_cents as "marketCents",
          m.low_cents as "lowCents",
          m.recorded_at as "recordedAt"
        FROM matched m
        LEFT JOIN marketplace_groups g
          ON g.marketplace = m.marketplace AND g.group_id = m.group_id
        ORDER BY m.marketplace, m.product_name
      `.execute(db);
      return result.rows;
    },
  };
}
