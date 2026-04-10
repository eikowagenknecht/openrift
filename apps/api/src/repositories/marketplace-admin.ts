import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/** Listing row for a level-2 ignored product. */
export interface IgnoredProductRow {
  level: "product";
  marketplace: string;
  externalId: number;
  productName: string;
  createdAt: Date;
}

/** Listing row for a level-3 ignored variant. */
export interface IgnoredVariantRow {
  level: "variant";
  marketplace: string;
  externalId: number;
  finish: string;
  language: string;
  productName: string;
  createdAt: Date;
}

export type IgnoredEntry = IgnoredProductRow | IgnoredVariantRow;

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
        .select(["marketplace", "groupId", "name", "abbreviation"])
        .orderBy("marketplace")
        .orderBy("name")
        .execute();
    },

    /** @returns Staging product counts per marketplace+groupId. */
    stagingCountsByMarketplaceGroup(marketplace?: string) {
      let query = db
        .selectFrom("marketplaceStaging")
        .select((eb) => [
          "marketplace" as const,
          "groupId" as const,
          eb.cast<number>(eb.fn.count("externalId").distinct(), "integer").as("count"),
        ])
        .where("groupId", "is not", null)
        .groupBy(["marketplace", "groupId"]);

      if (marketplace) {
        query = query.where("marketplace", "=", marketplace);
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
     * Update a marketplace group's name.
     * @returns `true` if a row was updated.
     */
    async updateGroupName(
      marketplace: string,
      groupId: number,
      name: string | null,
    ): Promise<boolean> {
      const result = await db
        .updateTable("marketplaceGroups")
        .set({ name })
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
          "iv.finish as finish",
          "iv.language as language",
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

    /** @returns Product names from staging for the given external IDs. */
    getStagingProductNames(marketplace: string, externalIds: number[]) {
      return db
        .selectFrom("marketplaceStaging")
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
     * Insert level-3 ignored variants. Each row must reference an existing
     * `marketplace_products` row (by `(marketplace, externalId)`); if the
     * parent product does not yet exist it will be created with the same
     * `productName` so the FK is satisfied.
     */
    async insertIgnoredVariants(
      values: {
        marketplace: string;
        externalId: number;
        finish: string;
        language: string;
        productName: string;
        groupId?: number;
      }[],
    ): Promise<void> {
      if (values.length === 0) {
        return;
      }

      // Ensure a parent product row exists for each (marketplace, externalId).
      const productSeed = values.map((v) => ({
        marketplace: v.marketplace,
        externalId: v.externalId,
        groupId: v.groupId ?? 0,
        productName: v.productName,
      }));

      await db
        .insertInto("marketplaceProducts")
        .values(productSeed)
        .onConflict((oc) => oc.columns(["marketplace", "externalId"]).doNothing())
        .execute();

      const products = await db
        .selectFrom("marketplaceProducts")
        .select(["id", "marketplace", "externalId"])
        .where((eb) =>
          eb.or(
            values.map((v) =>
              eb.and([eb("marketplace", "=", v.marketplace), eb("externalId", "=", v.externalId)]),
            ),
          ),
        )
        .execute();

      const productIdByKey = new Map(
        products.map((p) => [`${p.marketplace}::${p.externalId}`, p.id]),
      );

      const rows = values.map((v) => {
        const productId = productIdByKey.get(`${v.marketplace}::${v.externalId}`);
        if (!productId) {
          throw new Error(
            `insertIgnoredVariants: missing product for ${v.marketplace} ${v.externalId}`,
          );
        }
        return {
          marketplaceProductId: productId,
          finish: v.finish,
          language: v.language,
          productName: v.productName,
        };
      });

      await db
        .insertInto("marketplaceIgnoredVariants")
        .values(rows)
        .onConflict((oc) => oc.columns(["marketplaceProductId", "finish", "language"]).doNothing())
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
      variants: { externalId: number; finish: string; language: string }[],
    ): Promise<number> {
      if (variants.length === 0) {
        return 0;
      }

      const result = await sql<{ deleted: number }>`
        WITH deleted AS (
          DELETE FROM marketplace_ignored_variants iv
          USING marketplace_products mp
          WHERE mp.id = iv.marketplace_product_id
            AND mp.marketplace = ${marketplace}
            AND (mp.external_id, iv.finish, iv.language) IN (${sql.join(
              variants.map((v) => sql`(${v.externalId}::integer, ${v.finish}, ${v.language})`),
            )})
          RETURNING 1 as one
        )
        SELECT count(*)::int as deleted FROM deleted
      `.execute(db);

      return result.rows[0]?.deleted ?? 0;
    },

    // ── Staging card overrides ──────────────────────────────────────────────

    /** Upsert a staging card override. */
    async upsertStagingCardOverride(values: {
      marketplace: string;
      externalId: number;
      finish: string;
      language: string;
      cardId: string;
    }): Promise<void> {
      await db
        .insertInto("marketplaceStagingCardOverrides")
        .values(values)
        .onConflict((oc) =>
          oc
            .columns(["marketplace", "externalId", "finish", "language"])
            .doUpdateSet({ cardId: values.cardId }),
        )
        .execute();
    },

    /** Delete a staging card override. */
    async deleteStagingCardOverride(
      marketplace: string,
      externalId: number,
      finish: string,
      language: string,
    ): Promise<void> {
      await db
        .deleteFrom("marketplaceStagingCardOverrides")
        .where("marketplace", "=", marketplace)
        .where("externalId", "=", externalId)
        .where("finish", "=", finish)
        .where("language", "=", language)
        .execute();
    },

    // ── Clear price data ────────────────────────────────────────────────────

    /**
     * Delete all price data (snapshots, variants, products, staging) for a marketplace.
     * @returns Counts of deleted rows per table.
     */
    async clearPriceData(marketplace: string): Promise<{
      snapshots: number;
      variants: number;
      products: number;
      staging: number;
    }> {
      const snapshots = await sql<{ deleted: number }>`
        WITH deleted AS (
          DELETE FROM marketplace_snapshots
          WHERE variant_id IN (
            SELECT mpv.id FROM marketplace_product_variants mpv
            JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
            WHERE mp.marketplace = ${marketplace}
          )
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

      const staging = await db
        .deleteFrom("marketplaceStaging")
        .where("marketplace", "=", marketplace)
        .execute();

      return {
        snapshots: snapshots.rows[0]?.deleted ?? 0,
        variants: variants.rows[0]?.deleted ?? 0,
        products: Number(products[0].numDeletedRows),
        staging: Number(staging[0].numDeletedRows),
      };
    },
  };
}
