import type { Marketplace } from "@openrift/shared/types/pricing";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

type Db = Kysely<Database>;

export function marketplaceMappingStagingRepo(db: Db) {
  return {
    /** Level-2 ignores: whole upstream listings. */
    ignoredProducts(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceIgnoredProducts")
        .select(["externalId", "productName", "createdAt"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    /** Level-3 ignores: specific SKUs of an upstream product. */
    ignoredVariants(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceIgnoredVariants as iv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "iv.marketplaceProductId")
        .select([
          "mp.externalId as externalId",
          "mp.finish as finish",
          "mp.language as language",
          "iv.productName as productName",
          "iv.createdAt as createdAt",
        ])
        .where("mp.marketplace", "=", marketplace)
        .execute();
    },

    /**
     * Latest price row per (printingId, externalId, finish, language) for
     * mapped printings in a given marketplace. The SKU key on
     * `marketplace_products` is `(marketplace, external_id, finish, language)`
     * — one externalId can resolve to multiple SKUs (e.g. CM's normal/foil
     * variants), and each one has its own price history, so the result key has
     * to carry the full SKU tuple. Because that key is UNIQUE per marketplace
     * (`marketplace_products_sku_key`) and `(marketplaceProductId, printingId)`
     * is UNIQUE on the variants table, one row per (variant, product) pair is
     * exactly one row per SKU tuple.
     *
     * `marketplace_product_prices` is a history table keyed
     * `(marketplaceProductId, recordedAt)`. Joining it wholesale and reducing
     * with DISTINCT ON made Postgres sort every historical row for every
     * matched product just to keep the newest of each group, so the cost grew
     * with retained history. The lateral picks the newest row per product
     * straight off that primary key instead, so only one price row per product
     * is ever read.
     */
    pricesByMarketplace(marketplace: Marketplace, printingIds: string[]) {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .innerJoinLateral(
          (eb) =>
            eb
              .selectFrom("marketplaceProductPrices as p")
              .select([
                "p.marketCents",
                "p.lowCents",
                "p.midCents",
                "p.highCents",
                "p.trendCents",
                "p.avg1Cents",
                "p.avg7Cents",
                "p.avg30Cents",
                "p.recordedAt",
              ])
              .whereRef("p.marketplaceProductId", "=", "mp.id")
              .orderBy("p.recordedAt", "desc")
              .limit(1)
              .as("pp"),
          (join) => join.onTrue(),
        )
        .select([
          "mpv.printingId as printingId",
          "mp.externalId as externalId",
          "mp.productName as productName",
          "mp.finish as finish",
          "mp.language as language",
          "pp.marketCents",
          "pp.lowCents",
          "pp.midCents",
          "pp.highCents",
          "pp.trendCents",
          "pp.avg1Cents",
          "pp.avg7Cents",
          "pp.avg30Cents",
          "pp.recordedAt",
        ])
        .where("mp.marketplace", "=", marketplace)
        .where("mpv.printingId", "in", printingIds)
        .orderBy("mpv.printingId")
        .orderBy("mp.externalId")
        .orderBy("mp.finish")
        .orderBy("mp.language")
        .execute();
    },

    /**
     * Latest known price per *unbound* SKU for a marketplace — the admin's
     * "unmatched products" feed. Products with at least one variant binding
     * are excluded: they already belong to a card and aren't candidates for
     * fresh suggestions. `language` is `null` on the marketplaces that don't
     * split SKUs by language (cardmarket, tcgplayer).
     */
    allStaging(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceProducts as mp")
        .innerJoinLateral(
          (eb) =>
            eb
              .selectFrom("marketplaceProductPrices as p")
              .select([
                "p.recordedAt",
                "p.marketCents",
                "p.lowCents",
                "p.midCents",
                "p.highCents",
                "p.trendCents",
                "p.avg1Cents",
                "p.avg7Cents",
                "p.avg30Cents",
              ])
              .whereRef("p.marketplaceProductId", "=", "mp.id")
              .orderBy("p.recordedAt", "desc")
              .limit(1)
              .as("latest"),
          (join) => join.onTrue(),
        )
        .select([
          "mp.marketplace as marketplace",
          "mp.externalId as externalId",
          "mp.groupId as groupId",
          "mp.productName as productName",
          "mp.finish as finish",
          "mp.language as language",
          "latest.recordedAt",
          "latest.marketCents",
          "latest.lowCents",
          "latest.midCents",
          "latest.highCents",
          "latest.trendCents",
          "latest.avg1Cents",
          "latest.avg7Cents",
          "latest.avg30Cents",
        ])
        .where("mp.marketplace", "=", marketplace)
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
        .execute();
    },

    groupNames(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceGroups as mg")
        .leftJoin("sets as s", "s.id", "mg.setId")
        .select([
          "mg.groupId as gid",
          "mg.name as name",
          "mg.groupKind as groupKind",
          "s.slug as setSlug",
        ])
        .where("mg.marketplace", "=", marketplace)
        .execute();
    },

    async stagingCardOverrides(marketplace: Marketplace) {
      const rows = await db
        .selectFrom("marketplaceProductCardOverrides as ov")
        .innerJoin("marketplaceProducts as mp", "mp.id", "ov.marketplaceProductId")
        .select([
          "mp.externalId as externalId",
          "mp.finish as finish",
          "mp.language as language",
          "ov.cardId as cardId",
        ])
        .where("mp.marketplace", "=", marketplace)
        .execute();
      return rows;
    },

    /**
     * Used by `saveMappings` to rebind a variant to a different printing when
     * staging has rotated out but the upstream product record is still present
     * — reuses the existing `group_id` and `product_name` as a fallback so the
     * upsert can proceed.
     */
    productsByExternalIds(marketplace: Marketplace, externalIds: number[]) {
      if (externalIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProducts")
        .select(["externalId", "finish", "language", "productName", "groupId"])
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },
  };
}
