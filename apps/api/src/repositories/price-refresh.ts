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

/**
 * Queries for the price refresh pipeline (upsert snapshots/staging, load reference data).
 *
 * @returns An object with price-refresh query methods bound to the given `db`.
 */
export function priceRefreshRepo(db: Db) {
  return {
    // ── Reference data ──────────────────────────────────────────────────────

    /** @returns All sets (id + name). */
    allSets(): Promise<{ id: string; name: string }[]> {
      return db.selectFrom("sets").select(["id", "name"]).execute();
    },

    /** @returns All cards (id + name). */
    allCards(): Promise<{ id: string; name: string }[]> {
      return db.selectFrom("cards").select(["id", "name"]).execute();
    },

    /** @returns All printings with fields needed for price matching. */
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
          "language",
          "markerSlugs",
        ])
        .execute();
    },

    // ── Ignored keys ────────────────────────────────────────────────────────

    /**
     * @returns Both L2 (whole-product) and L3 (per-variant) ignored keys for a
     *          marketplace. Staging ingest should skip a row if its externalId
     *          is in `productIds` OR its `externalId::finish::language` tuple
     *          is in `variantKeys`.
     */
    async loadIgnoredKeys(marketplace: string): Promise<LoadedIgnoredKeys> {
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

    // ── Group upsert ────────────────────────────────────────────────────────

    /** Upsert marketplace groups, preserving existing name/abbreviation. */
    async upsertGroups(
      marketplace: string,
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

    // ── Product upsert ──────────────────────────────────────────────────────

    /**
     * Upsert `marketplace_products` rows for a batch of SKUs and return their
     * IDs. Every fetched SKU gets a product row so
     * `marketplace_product_prices` has a FK target. `group_id` and
     * `product_name` update on conflict — they legitimately change over time
     * (renames, category moves).
     *
     * @returns One row per input SKU with its product id.
     */
    async upsertProductsForMarketplace(
      marketplace: string,
      skus: {
        externalId: number;
        finish: string;
        language: string | null;
        groupId: number;
        productName: string;
      }[],
    ): Promise<{ externalId: number; finish: string; language: string | null; id: string }[]> {
      if (skus.length === 0) {
        return [];
      }
      const dedupByKey = new Map<string, (typeof skus)[number]>();
      for (const sku of skus) {
        dedupByKey.set(skuKey(sku.externalId, sku.finish, sku.language), sku);
      }
      const rows = await sql<{
        id: string;
        externalId: number;
        finish: string;
        language: string | null;
      }>`
        INSERT INTO marketplace_products (marketplace, external_id, group_id, product_name, finish, language)
        VALUES ${sql.join(
          [...dedupByKey.values()].map(
            (r) =>
              sql`(${marketplace}, ${r.externalId}, ${r.groupId}, ${r.productName}, ${r.finish}, ${r.language})`,
          ),
        )}
        ON CONFLICT (marketplace, external_id, finish, language)
        DO UPDATE SET
          group_id = EXCLUDED.group_id,
          product_name = EXCLUDED.product_name
        RETURNING id, external_id AS "externalId", finish, language
      `.execute(db);
      return rows.rows;
    },

    // ── Row counts ──────────────────────────────────────────────────────────

    /** @returns Row count for marketplace product prices (joined via products). */
    async countProductPrices(marketplace: string): Promise<number> {
      const result = await db
        .selectFrom("marketplaceProductPrices as pp")
        .innerJoin("marketplaceProducts as mp", "mp.id", "pp.marketplaceProductId")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("mp.marketplace", "=", marketplace)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    // ── Batch upserts ───────────────────────────────────────────────────────

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

    // ── Auto-match helpers (CardTrader) ─────────────────────────────────────

    /**
     * @returns One row per variant for the given marketplaces. A single
     *          external_id can now resolve to multiple rows (e.g. foil + normal
     *          SKUs of the same upstream product).
     */
    existingSourcesByMarketplaces(marketplaces: string[]): Promise<
      {
        marketplace: string;
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
        marketplace: string;
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

      const productIdByKey = new Map(
        products.map((p) => [skuKey(p.externalId, p.finish, p.language), p.id]),
      );

      const variantRows = values.map((v) => {
        const productId = productIdByKey.get(skuKey(v.externalId, v.finish, v.language));
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
