import type { Marketplace } from "@openrift/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { buildDistinctWhere } from "../db/helpers.js";
import type { Database } from "../db/index.js";

type Db = Kysely<Database>;

const PRICE_COL_NAMES = [
  "market_cents",
  "low_cents",
  "zero_low_cents",
  "mid_cents",
  "high_cents",
  "trend_cents",
  "avg1_cents",
  "avg7_cents",
  "avg30_cents",
] as const;

const PRICE_EXCLUDED_SET = {
  marketCents: sql<number | null>`excluded.market_cents`,
  lowCents: sql<number | null>`excluded.low_cents`,
  zeroLowCents: sql<number | null>`excluded.zero_low_cents`,
  midCents: sql<number | null>`excluded.mid_cents`,
  highCents: sql<number | null>`excluded.high_cents`,
  trendCents: sql<number | null>`excluded.trend_cents`,
  avg1Cents: sql<number | null>`excluded.avg1_cents`,
  avg7Cents: sql<number | null>`excluded.avg7_cents`,
  avg30Cents: sql<number | null>`excluded.avg30_cents`,
};

export interface LoadedIgnoredKeys {
  /** Level 2: whole upstream products (keyed by externalId). */
  productIds: Set<number>;
  /**
   * Level 3: per-SKU ignores keyed by `externalId::finish::language`, where
   * `language` is the empty string when the marketplace stores NULL (CM/TCG).
   */
  variantKeys: Set<string>;
}

/**
 * Build the canonical staging→SKU lookup key. Cardmarket and TCGPlayer store
 * NULL language; CT stores the real language. The empty-string fallback keeps
 * Map lookups consistent with what the database returns.
 * @returns `${externalId}::${finish}::${language ?? ""}`
 */
export function skuKey(externalId: number, finish: string, language: string | null): string {
  return `${externalId}::${finish}::${language ?? ""}`;
}

export function priceRefreshRepo(db: Db) {
  return {
    allPrintingsForPriceMatch() {
      return db
        .selectFrom("printings")
        .select([
          "id",
          "cardId",
          "setId",
          "shortCode",
          "publicCode",
          "finish",
          "artVariant",
          "isSigned",
          "isOvernumbered",
          "language",
          "markerSlugs",
        ])
        .execute();
    },

    /**
     * @returns Both L2 (whole-product) and L3 (per-variant) ignored keys for a
     *          marketplace. Staging ingest should skip a row if its externalId
     *          is in `productIds` OR its `externalId::finish::language` tuple
     *          is in `variantKeys`.
     */
    async loadIgnoredKeys(marketplace: Marketplace): Promise<LoadedIgnoredKeys> {
      const [productRows, variantRows] = await Promise.all([
        db
          .selectFrom("marketplaceIgnoredProducts")
          .select(["externalId"])
          .where("marketplace", "=", marketplace)
          .execute(),
        db
          .selectFrom("marketplaceIgnoredVariants as iv")
          .innerJoin("marketplaceProducts as mp", "mp.id", "iv.marketplaceProductId")
          .select(["mp.externalId as externalId", "mp.finish as finish", "mp.language as language"])
          .where("mp.marketplace", "=", marketplace)
          .execute(),
      ]);

      return {
        productIds: new Set(productRows.map((r) => r.externalId)),
        variantKeys: new Set(variantRows.map((r) => skuKey(r.externalId, r.finish, r.language))),
      };
    },

    async upsertGroups(
      marketplace: Marketplace,
      groups: { groupId: number; name?: string | null; abbreviation?: string | null }[],
    ): Promise<void> {
      if (groups.length === 0) {
        return;
      }
      await db
        .insertInto("marketplaceGroups")
        .values(
          groups.map((g) => ({
            marketplace,
            groupId: g.groupId,
            name: g.name ?? null,
            abbreviation: g.abbreviation ?? null,
          })),
        )
        .onConflict((oc) =>
          oc.columns(["marketplace", "groupId"]).doUpdateSet({
            name: sql<string>`coalesce(excluded.name, marketplace_groups.name)`,
            abbreviation: sql<string>`coalesce(excluded.abbreviation, marketplace_groups.abbreviation)`,
          }),
        )
        .execute();
    },

    /**
     * Upsert `marketplace_products` rows for a batch of SKUs and return their
     * IDs. Every fetched SKU gets a product row so
     * `marketplace_product_prices` has a FK target. `group_id` and
     * `product_name` update on conflict — they legitimately change over time
     * (renames, category moves).
     *
     * @returns One row per input SKU with its product id.
     */
    upsertProductsForMarketplace(
      marketplace: Marketplace,
      skus: {
        externalId: number;
        finish: string;
        language: string | null;
        groupId: number;
        productName: string;
      }[],
    ): Promise<{ externalId: number; finish: string; language: string | null; id: string }[]> {
      if (skus.length === 0) {
        return Promise.resolve([]);
      }
      const dedupByKey = new Map<string, (typeof skus)[number]>();
      for (const sku of skus) {
        dedupByKey.set(skuKey(sku.externalId, sku.finish, sku.language), sku);
      }
      // `doUpdateSet` (rather than `doNothing`) is what makes RETURNING cover
      // conflicting rows as well as inserted ones — the caller needs an id for
      // every input SKU, and most of them already exist by the second refresh.
      // The conflict target is inferred from the column list; the index it
      // resolves to (`marketplace_products_sku_key`) is NULLS NOT DISTINCT, so
      // CM/TCG's NULL language still collapses onto the existing row.
      return db
        .insertInto("marketplaceProducts")
        .values(
          [...dedupByKey.values()].map((r) => ({
            marketplace,
            externalId: r.externalId,
            groupId: r.groupId,
            productName: r.productName,
            finish: r.finish,
            language: r.language,
          })),
        )
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doUpdateSet({
            groupId: (eb) => eb.ref("excluded.groupId"),
            productName: (eb) => eb.ref("excluded.productName"),
          }),
        )
        .returning(["id", "externalId", "finish", "language"])
        .execute();
    },

    async countProductPrices(marketplace: Marketplace): Promise<number> {
      const result = await db
        .selectFrom("marketplaceProductPrices as pp")
        .innerJoin("marketplaceProducts as mp", "mp.id", "pp.marketplaceProductId")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("mp.marketplace", "=", marketplace)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    /**
     * Batch-upsert marketplace_product_prices with IS DISTINCT FROM filtering.
     * Rows are keyed on (marketplaceProductId, recordedAt) — one row per SKU
     * per fetch cycle, regardless of how many printings are bound to that SKU.
     * @returns The number of affected rows.
     */
    async upsertProductPrices(
      batch: {
        marketplaceProductId: string;
        recordedAt: Date;
        marketCents: number | null;
        lowCents: number | null;
        zeroLowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }[],
    ): Promise<number> {
      const distinctWhere = buildDistinctWhere("marketplace_product_prices", PRICE_COL_NAMES);
      const rows = await db
        .insertInto("marketplaceProductPrices")
        .values(batch)
        .onConflict((oc) =>
          oc
            .columns(["marketplaceProductId", "recordedAt"])
            .doUpdateSet(PRICE_EXCLUDED_SET)
            .where(distinctWhere),
        )
        .returning(sql<number>`1`.as("_"))
        .execute();
      return rows.length;
    },

    /**
     * @returns One row per variant for the given marketplaces. A single
     *          external_id can now resolve to multiple rows (e.g. foil + normal
     *          SKUs of the same upstream product).
     */
    existingSourcesByMarketplaces(marketplaces: Marketplace[]): Promise<
      {
        marketplace: Marketplace;
        externalId: number;
        printingId: string;
        finish: string;
        language: string | null;
        groupId: number;
        productName: string;
      }[]
    > {
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mp.marketplace as marketplace",
          "mp.externalId as externalId",
          "mpv.printingId as printingId",
          "mp.finish as finish",
          "mp.language as language",
          "mp.groupId as groupId",
          "mp.productName as productName",
        ])
        .where("mp.marketplace", "in", marketplaces)
        .execute();
    },

    /**
     * Batch-insert product + variant rows. Upserts the per-SKU product by
     * `(marketplace, external_id, finish, language)` then upserts the variant
     * by `(marketplaceProductId, printingId)`. No-ops on conflict (used by
     * auto-match where we don't want to overwrite existing mappings).
     */
    async batchInsertProductVariants(
      values: {
        marketplace: Marketplace;
        externalId: number;
        groupId: number;
        productName: string;
        printingId: string;
        finish: string;
        /** `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
        language: string | null;
      }[],
    ): Promise<void> {
      if (values.length === 0) {
        return;
      }

      const productRows = values.map((v) => ({
        marketplace: v.marketplace,
        externalId: v.externalId,
        groupId: v.groupId,
        productName: v.productName,
        finish: v.finish,
        language: v.language,
      }));

      await db
        .insertInto("marketplaceProducts")
        .values(productRows)
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

      // Keyed with the marketplace, unlike the single-marketplace `skuKey`.
      // `values` spans marketplaces and the re-select above matches on
      // `(marketplace, externalId)` pairs, so two marketplaces handing out the
      // same external id would otherwise collapse onto one key and bind every
      // variant to whichever product landed in the map last.
      const productKey = (v: {
        marketplace: Marketplace;
        externalId: number;
        finish: string;
        language: string | null;
      }): string => `${v.marketplace}::${skuKey(v.externalId, v.finish, v.language)}`;

      const productIdByKey = new Map(products.map((p) => [productKey(p), p.id]));

      const variantRows = values.map((v) => {
        const productId = productIdByKey.get(productKey(v));
        if (!productId) {
          throw new Error(
            `batchInsertProductVariants: missing product id for ${v.marketplace} ${v.externalId} ${v.finish}/${v.language ?? "NULL"}`,
          );
        }
        return {
          marketplaceProductId: productId,
          printingId: v.printingId,
        };
      });

      await db
        .insertInto("marketplaceProductVariants")
        .values(variantRows)
        .onConflict((oc) => oc.columns(["marketplaceProductId", "printingId"]).doNothing())
        .execute();
    },
  };
}
