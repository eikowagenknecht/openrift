import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { domainsArray, imageUrlWithOriginal, superTypesArray } from "./query-helpers.js";

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

    /** @returns All staging rows for a marketplace, ordered by newest first. */
    allStaging(marketplace: string) {
      return db
        .selectFrom("marketplaceStaging")
        .selectAll()
        .where("marketplace", "=", marketplace)
        .orderBy("recordedAt", "desc")
        .execute();
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
          .leftJoin("promoTypes as pt", "pt.id", "p.promoTypeId")
          .select([
            "c.id as cardId",
            "c.slug as cardSlug",
            "c.name as cardName",
            "c.type as cardType",
            domainsArray("c.id").as("domains"),
            superTypesArray("c.id").as("superTypes"),
            "c.energy",
            "c.might",
            "p.id as printingId",
            "s.slug as setId",
            "p.shortCode",
            "p.rarity",
            "s.name as setName",
            "p.artVariant",
            "p.isSigned",
            "pt.slug as promoTypeSlug",
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
          AND source.promo_type_id IS NOT DISTINCT FROM target.promo_type_id
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
     * Void". Ignored products (level 2) and ignored variants (level 3) are
     * filtered out. Each (marketplace, external_id, finish, language) tuple is
     * deduplicated to its most-recent staging snapshot.
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
          WHERE (
            EXISTS (
              SELECT 1 FROM marketplace_staging_card_overrides ov
              WHERE ov.marketplace = s.marketplace
                AND ov.external_id = s.external_id
                AND ov.finish = s.finish
                AND ov.language = s.language
                AND ov.card_id = ${cardId}
            )
            OR EXISTS (
              SELECT 1 FROM aliases a
              WHERE a.norm_name <> ''
                AND (
                  lower(regexp_replace(s.product_name, '[^a-zA-Z0-9]', '', 'g'))
                    LIKE a.norm_name || '%'
                  OR (
                    length(a.norm_name) >= 5
                    AND lower(regexp_replace(s.product_name, '[^a-zA-Z0-9]', '', 'g'))
                      LIKE '%' || a.norm_name || '%'
                  )
                )
            )
          )
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
