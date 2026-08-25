import type { Marketplace, MarketplaceGroupKind } from "@openrift/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

interface IgnoredProductRow {
  level: "product";
  marketplace: Marketplace;
  externalId: number;
  productName: string;
  createdAt: Date;
}

interface IgnoredVariantRow {
  level: "variant";
  marketplace: Marketplace;
  externalId: number;
  finish: string;
  /** NULL for CM/TCG (language is not a SKU dimension there). */
  language: string | null;
  productName: string;
  createdAt: Date;
}

type IgnoredEntry = IgnoredProductRow | IgnoredVariantRow;

export function marketplaceAdminRepo(db: Kysely<Database>) {
  return {
    listAllGroups() {
      return db
        .selectFrom("marketplaceGroups")
        .select(["marketplace", "groupId", "name", "abbreviation", "groupKind", "setId"])
        .orderBy("marketplace")
        .orderBy("name")
        .execute();
    },

    stagingCountsByMarketplaceGroup(marketplace?: Marketplace) {
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

    assignedCountsByMarketplaceGroup(marketplace?: Marketplace) {
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

    async updateGroup(
      marketplace: Marketplace,
      groupId: number,
      patch: { name?: string | null; groupKind?: MarketplaceGroupKind; setId?: string | null },
    ): Promise<boolean> {
      const updates: {
        name?: string | null;
        groupKind?: MarketplaceGroupKind;
        setId?: string | null;
      } = {};
      if (patch.name !== undefined) {
        updates.name = patch.name;
      }
      if (patch.groupKind !== undefined) {
        updates.groupKind = patch.groupKind;
      }
      if (patch.setId !== undefined) {
        updates.setId = patch.setId;
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

    getStagingProductNames(marketplace: Marketplace, externalIds: number[]) {
      return db
        .selectFrom("marketplaceProducts")
        .select(["externalId", "productName"])
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    async insertIgnoredProducts(
      values: {
        marketplace: Marketplace;
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
     * Each row targets a marketplace SKU `(marketplace, externalId, finish,
     * language)`, which uniquely identifies one product row in the per-SKU
     * product model. Creates the product row first if missing, so the FK is satisfied.
     */
    async insertIgnoredVariants(
      values: {
        marketplace: Marketplace;
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
        marketplace: Marketplace;
        externalId: number;
        finish: string;
        language: string | null;
      }): string => `${v.marketplace}::${v.externalId}::${v.finish}::${v.language ?? ""}`;

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

    async deleteIgnoredProducts(marketplace: Marketplace, externalIds: number[]): Promise<number> {
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

    async deleteIgnoredVariants(
      marketplace: Marketplace,
      variants: { externalId: number; finish: string; language: string | null }[],
    ): Promise<number> {
      if (variants.length === 0) {
        return 0;
      }

      // `is not distinct from` on language, not `=`: CM/TCG store NULL there
      // and `=` would never match those rows.
      const result = await db
        .deleteFrom("marketplaceIgnoredVariants as iv")
        .using("marketplaceProducts as mp")
        .whereRef("mp.id", "=", "iv.marketplaceProductId")
        .where("mp.marketplace", "=", marketplace)
        .where((eb) =>
          eb.or(
            variants.map((v) =>
              eb.and([
                eb("mp.externalId", "=", v.externalId),
                eb("mp.finish", "=", v.finish),
                eb("mp.language", "is not distinct from", v.language),
              ]),
            ),
          ),
        )
        .executeTakeFirst();

      return Number(result?.numDeletedRows ?? 0n);
    },

    /** Throws if the SKU has no `marketplace_products` row yet. */
    async upsertStagingCardOverride(values: {
      marketplace: Marketplace;
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

    /** No-op if the SKU has no override. */
    async deleteStagingCardOverride(
      marketplace: Marketplace,
      externalId: number,
      finish: string,
      language: string | null,
    ): Promise<void> {
      await db
        .deleteFrom("marketplaceProductCardOverrides as ov")
        .using("marketplaceProducts as mp")
        .whereRef("ov.marketplaceProductId", "=", "mp.id")
        .where("mp.marketplace", "=", marketplace)
        .where("mp.externalId", "=", externalId)
        .where("mp.finish", "=", finish)
        // `is not distinct from`, not `=`: CM/TCG store a NULL language.
        .where("mp.language", "is not distinct from", language)
        .execute();
    },

    /** `marketplace_product_prices` is FK-cascaded from products, so deletes must run in dependency order. */
    async clearPriceData(marketplace: Marketplace): Promise<{
      prices: number;
      variants: number;
      products: number;
    }> {
      const prices = await db
        .deleteFrom("marketplaceProductPrices as pp")
        .using("marketplaceProducts as mp")
        .whereRef("mp.id", "=", "pp.marketplaceProductId")
        .where("mp.marketplace", "=", marketplace)
        .executeTakeFirst();

      const variants = await db
        .deleteFrom("marketplaceProductVariants as mpv")
        .using("marketplaceProducts as mp")
        .whereRef("mp.id", "=", "mpv.marketplaceProductId")
        .where("mp.marketplace", "=", marketplace)
        .executeTakeFirst();

      const products = await db
        .deleteFrom("marketplaceProducts")
        .where("marketplace", "=", marketplace)
        .executeTakeFirst();

      return {
        prices: Number(prices?.numDeletedRows ?? 0n),
        variants: Number(variants?.numDeletedRows ?? 0n),
        products: Number(products?.numDeletedRows ?? 0n),
      };
    },
  };
}
