import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import type { MarketplaceGroupKind } from "../db/tables.js";

/** Listing row for a level-2 ignored product. */
interface IgnoredProductRow {
  level: "product";
  marketplace: string;
  externalId: number;
  productName: string;
  createdAt: Date;
}

/** Listing row for a level-3 ignored variant. */
interface IgnoredVariantRow {
  level: "variant";
  marketplace: string;
  externalId: number;
  finish: string;
  /** NULL for CM/TCG (language is not a SKU dimension there). */
  language: string | null;
  productName: string;
  createdAt: Date;
}

type IgnoredEntry = IgnoredProductRow | IgnoredVariantRow;

/**
 * Admin queries for marketplace groups, ignored products, staging overrides,
 * and price data management.
 *
 * @returns An object with marketplace admin query methods bound to the given `db`.
 */
export function marketplaceAdminRepo(db: Kysely<Database>) {
  return {
    // ── Marketplace groups ──────────────────────────────────────────────────

    /** @returns All groups across all marketplaces. */
    listAllGroups() {
      return db
        .selectFrom("marketplaceGroups")
        .select(["marketplace", "groupId", "name", "abbreviation", "groupKind"])
        .orderBy("marketplace")
        .orderBy("name")
        .execute();
    },

    /**
     * @returns Count of unbound (still-unmatched) products per
     *          marketplace+groupId. Mirrors the old staging-row count, but
     *          reads from `marketplace_products` filtered to products with no
     *          variant binding.
     */
    stagingCountsByMarketplaceGroup(marketplace?: string) {
      let query = db
        .selectFrom("marketplaceProducts as mp")
        .select((eb) => [
          "mp.marketplace as marketplace",
          "mp.groupId as groupId",
          eb.cast<number>(eb.fn.count("mp.id").distinct(), "integer").as("count"),
        ])
        .where("mp.groupId", "is not", null)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("marketplaceProductVariants as mpv")
                .select("mpv.id")
                .whereRef("mpv.marketplaceProductId", "=", "mp.id"),
            ),
          ),
        )
        .groupBy(["mp.marketplace", "mp.groupId"]);

      if (marketplace) {
        query = query.where("mp.marketplace", "=", marketplace);
      }

      return query.execute();
    },

    /**
     * @returns Count of mapped variants per marketplace+groupId. One row per
     *          (marketplace, groupId) with the count of variants whose parent
     *          product belongs to that group.
     */
    assignedCountsByMarketplaceGroup(marketplace?: string) {
      let query = db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select((eb) => [
          "mp.marketplace as marketplace",
          "mp.groupId as groupId",
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where("mp.groupId", "is not", null)
        .groupBy(["mp.marketplace", "mp.groupId"]);

      if (marketplace) {
        query = query.where("mp.marketplace", "=", marketplace);
      }

      return query.execute();
    },

    /**
     * Update editable fields on a marketplace group. Pass only the fields to change.
     * @returns `true` if a row was updated.
     */
    async updateGroup(
      marketplace: string,
      groupId: number,
      patch: { name?: string | null; groupKind?: MarketplaceGroupKind },
    ): Promise<boolean> {
      const updates: { name?: string | null; groupKind?: MarketplaceGroupKind } = {};
      if (patch.name !== undefined) {
        updates.name = patch.name;
      }
      if (patch.groupKind !== undefined) {
        updates.groupKind = patch.groupKind;
      }
      if (Object.keys(updates).length === 0) {
        return false;
      }
      const result = await db
        .updateTable("marketplaceGroups")
        .set(updates)
        .where("marketplace", "=", marketplace)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return (result?.numUpdatedRows ?? 0n) > 0n;
    },

    // ── Ignored products (L2 whole-product + L3 per-variant) ───────────────

    /**
     * @returns Both level-2 (whole-product) and level-3 (per-variant) ignores
     *          merged into a single discriminated list, newest first.
     */
    async listIgnoredProducts(): Promise<IgnoredEntry[]> {
      const products = await db
        .selectFrom("marketplaceIgnoredProducts")
        .select(["marketplace", "externalId", "productName", "createdAt"])
        .execute();

      const variants = await db
        .selectFrom("marketplaceIgnoredVariants as iv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "iv.marketplaceProductId")
        .select([
          "mp.marketplace as marketplace",
          "mp.externalId as externalId",
          "mp.finish as finish",
          "mp.language as language",
          "iv.productName as productName",
          "iv.createdAt as createdAt",
        ])
        .execute();

      const merged: IgnoredEntry[] = [
        ...products.map<IgnoredProductRow>((row) => ({ level: "product" as const, ...row })),
        ...variants.map<IgnoredVariantRow>((row) => ({ level: "variant" as const, ...row })),
      ];

      return merged.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    /** @returns Product names from `marketplace_products` for the given external IDs. */
    getStagingProductNames(marketplace: string, externalIds: number[]) {
      return db
        .selectFrom("marketplaceProducts")
        .select(["externalId", "productName"])
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    /** Insert level-2 ignored products (whole upstream listings). Skips conflicts. */
    async insertIgnoredProducts(
      values: {
        marketplace: string;
        externalId: number;
        productName: string;
      }[],
    ): Promise<void> {
      if (values.length === 0) {
        return;
      }
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values(values)
        .onConflict((oc) => oc.columns(["marketplace", "externalId"]).doNothing())
        .execute();
    },

    /**
     * Insert level-3 ignored variants. Each row targets a specific marketplace
     * SKU `(marketplace, externalId, finish, language)` — in the per-SKU
     * product model that tuple uniquely identifies one product row. If the
     * product row doesn't exist yet, create it so the FK is satisfied.
     */
    async insertIgnoredVariants(
      values: {
        marketplace: string;
        externalId: number;
        finish: string;
        language: string | null;
        productName: string;
        groupId?: number;
      }[],
    ): Promise<void> {
      if (values.length === 0) {
        return;
      }

      const skuKey = (v: {
        marketplace: string;
        externalId: number;
        finish: string;
        language: string | null;
      }): string => `${v.marketplace}::${v.externalId}::${v.finish}::${v.language ?? ""}`;

      // Ensure a per-SKU product row exists for each input tuple.
      const productSeed = values.map((v) => ({
        marketplace: v.marketplace,
        externalId: v.externalId,
        groupId: v.groupId ?? 0,
        productName: v.productName,
        finish: v.finish,
        language: v.language,
      }));

      await db
        .insertInto("marketplaceProducts")
        .values(productSeed)
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing(),
        )
        .execute();

      const products = await db
        .selectFrom("marketplaceProducts")
        .select(["id", "marketplace", "externalId", "finish", "language"])
        .where((eb) =>
          eb.or(
            values.map((v) =>
              eb.and([eb("marketplace", "=", v.marketplace), eb("externalId", "=", v.externalId)]),
            ),
          ),
        )
        .execute();

      const productIdByKey = new Map(products.map((p) => [skuKey(p), p.id]));

      const rows = values.map((v) => {
        const productId = productIdByKey.get(skuKey(v));
        if (!productId) {
          throw new Error(
            `insertIgnoredVariants: missing product for ${v.marketplace} ${v.externalId} ${v.finish}/${v.language ?? "NULL"}`,
          );
        }
        return {
          marketplaceProductId: productId,
          productName: v.productName,
        };
      });

      await db
        .insertInto("marketplaceIgnoredVariants")
        .values(rows)
        .onConflict((oc) => oc.column("marketplaceProductId").doNothing())
        .execute();
    },

    /**
     * Delete level-2 ignored products.
     * @returns Count of deleted rows.
     */
    async deleteIgnoredProducts(marketplace: string, externalIds: number[]): Promise<number> {
      if (externalIds.length === 0) {
        return 0;
      }

      const result = await db
        .deleteFrom("marketplaceIgnoredProducts")
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();

      return Number(result[0].numDeletedRows);
    },

    /**
     * Delete level-3 ignored variants.
     * @returns Count of deleted rows.
     */
    async deleteIgnoredVariants(
      marketplace: string,
      variants: { externalId: number; finish: string; language: string | null }[],
    ): Promise<number> {
      if (variants.length === 0) {
        return 0;
      }

      const skuMatches = variants.map(
        (v) => sql`(
          mp.external_id = ${v.externalId}::integer
          AND mp.finish = ${v.finish}
          AND mp.language IS NOT DISTINCT FROM ${v.language}
        )`,
      );

      const result = await sql<{ deleted: number }>`
        WITH deleted AS (
          DELETE FROM marketplace_ignored_variants iv
          USING marketplace_products mp
          WHERE mp.id = iv.marketplace_product_id
            AND mp.marketplace = ${marketplace}
            AND (${sql.join(skuMatches, sql` OR `)})
          RETURNING 1 as one
        )
        SELECT count(*)::int as deleted FROM deleted
      `.execute(db);

      return result.rows[0]?.deleted ?? 0;
    },

    // ── Staging card overrides ──────────────────────────────────────────────

    /**
     * Upsert a card override pinned to a specific marketplace SKU. Resolves
     * the (marketplace, externalId, finish, language) tuple to its
     * `marketplace_products.id` and writes against the per-product overrides
     * table (one card per SKU). Throws if the SKU has no product row yet.
     */
    async upsertStagingCardOverride(values: {
      marketplace: string;
      externalId: number;
      finish: string;
      language: string | null;
      cardId: string;
    }): Promise<void> {
      const result = await sql<{ inserted: number }>`
        WITH target AS (
          SELECT id FROM marketplace_products
          WHERE marketplace = ${values.marketplace}
            AND external_id = ${values.externalId}
            AND finish = ${values.finish}
            AND language IS NOT DISTINCT FROM ${values.language}
          LIMIT 1
        ),
        inserted AS (
          INSERT INTO marketplace_product_card_overrides (marketplace_product_id, card_id)
          SELECT id, ${values.cardId} FROM target
          ON CONFLICT (marketplace_product_id) DO UPDATE SET card_id = EXCLUDED.card_id
          RETURNING 1
        )
        SELECT COUNT(*)::int AS inserted FROM inserted
      `.execute(db);
      if ((result.rows[0]?.inserted ?? 0) === 0) {
        throw new Error(
          `upsertStagingCardOverride: no marketplace_products row for ${values.marketplace} ${values.externalId} ${values.finish}/${values.language ?? "NULL"}`,
        );
      }
    },

    /** Delete a card override for the given marketplace SKU (no-op if missing). */
    async deleteStagingCardOverride(
      marketplace: string,
      externalId: number,
      finish: string,
      language: string | null,
    ): Promise<void> {
      await sql`
        DELETE FROM marketplace_product_card_overrides ov
        USING marketplace_products mp
        WHERE ov.marketplace_product_id = mp.id
          AND mp.marketplace = ${marketplace}
          AND mp.external_id = ${externalId}
          AND mp.finish = ${finish}
          AND mp.language IS NOT DISTINCT FROM ${language}
      `.execute(db);
    },

    // ── Clear price data ────────────────────────────────────────────────────

    /**
     * Delete all price data (prices, variants, products) for a marketplace.
     * `marketplace_product_prices` is FK-cascaded from products, so the
     * counts are deleted in dependency order.
     * @returns Counts of deleted rows per table.
     */
    async clearPriceData(marketplace: string): Promise<{
      prices: number;
      variants: number;
      products: number;
    }> {
      const prices = await sql<{ deleted: number }>`
        WITH deleted AS (
          DELETE FROM marketplace_product_prices pp
          USING marketplace_products mp
          WHERE mp.id = pp.marketplace_product_id
            AND mp.marketplace = ${marketplace}
          RETURNING 1 as one
        )
        SELECT count(*)::int as deleted FROM deleted
      `.execute(db);

      const variants = await sql<{ deleted: number }>`
        WITH deleted AS (
          DELETE FROM marketplace_product_variants mpv
          USING marketplace_products mp
          WHERE mp.id = mpv.marketplace_product_id
            AND mp.marketplace = ${marketplace}
          RETURNING 1 as one
        )
        SELECT count(*)::int as deleted FROM deleted
      `.execute(db);

      const products = await db
        .deleteFrom("marketplaceProducts")
        .where("marketplace", "=", marketplace)
        .execute();

      return {
        prices: prices.rows[0]?.deleted ?? 0,
        variants: variants.rows[0]?.deleted ?? 0,
        products: Number(products[0].numDeletedRows),
      };
    },
  };
}
