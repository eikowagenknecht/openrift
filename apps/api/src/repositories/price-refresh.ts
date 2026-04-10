import type { Kysely } from "kysely";
import { sql } from "kysely";

import { buildDistinctWhere } from "../db/helpers.js";
import type { Database } from "../db/index.js";

type Db = Kysely<Database>;

const PRICE_COL_NAMES = [
  "market_cents",
  "low_cents",
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
  /** Level 3: per-SKU ignores (keyed by `externalId::finish::language`). */
  variantKeys: Set<string>;
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
          "promoTypeId",
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
          .select(["mp.externalId as externalId", "iv.finish as finish", "iv.language as language"])
          .where("mp.marketplace", "=", marketplace)
          .execute(),
      ]);

      return {
        productIds: new Set(productRows.map((r) => r.externalId)),
        variantKeys: new Set(variantRows.map((r) => `${r.externalId}::${r.finish}::${r.language}`)),
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

    // ── Variant lookup ──────────────────────────────────────────────────────

    /**
     * @returns One row per variant in a marketplace, with its parent's external_id.
     *          `id` is the variant id (suitable for use as snapshot.variantId).
     */
    variantsWithFinish(marketplace: string) {
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.id as id",
          "mpv.printingId as printingId",
          "mp.externalId as externalId",
          "mpv.language as language",
          "mpv.finish as finish",
        ])
        .where("mp.marketplace", "=", marketplace)
        .execute();
    },

    // ── Row counts ──────────────────────────────────────────────────────────

    /** @returns Row count for marketplace snapshots (joined via variants and products). */
    async countSnapshots(marketplace: string): Promise<number> {
      const result = await db
        .selectFrom("marketplaceSnapshots as snap")
        .innerJoin("marketplaceProductVariants as mpv", "mpv.id", "snap.variantId")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("mp.marketplace", "=", marketplace)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    /** @returns Row count for marketplace staging. */
    async countStaging(marketplace: string): Promise<number> {
      const result = await db
        .selectFrom("marketplaceStaging")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("marketplace", "=", marketplace)
        .executeTakeFirstOrThrow();
      return result.count;
    },

    // ── Batch upserts ───────────────────────────────────────────────────────

    /**
     * Batch-upsert snapshots with IS DISTINCT FROM filtering.
     * @returns The number of affected rows.
     */
    async upsertSnapshots(
      batch: {
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
    ): Promise<number> {
      const distinctWhere = buildDistinctWhere("marketplace_snapshots", PRICE_COL_NAMES);
      const rows = await db
        .insertInto("marketplaceSnapshots")
        .values(batch)
        .onConflict((oc) =>
          oc
            .columns(["variantId", "recordedAt"])
            .doUpdateSet(PRICE_EXCLUDED_SET)
            .where(distinctWhere),
        )
        .returning(sql<number>`1`.as("_"))
        .execute();
      return rows.length;
    },

    /**
     * Batch-upsert staging rows with IS DISTINCT FROM filtering.
     * @returns The number of affected rows.
     */
    async upsertStaging(
      marketplace: string,
      batch: {
        externalId: number;
        finish: string;
        language: string;
        productName: string;
        recordedAt: Date;
        groupId: number;
        marketCents: number | null;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }[],
    ): Promise<number> {
      const stagingUpdateSet = {
        groupId: sql<number>`excluded.group_id`,
        ...PRICE_EXCLUDED_SET,
      };
      const distinctWhere = buildDistinctWhere("marketplace_staging", [
        "group_id",
        ...PRICE_COL_NAMES,
      ]);

      const rows = await db
        .insertInto("marketplaceStaging")
        .values(batch.map((r) => ({ ...r, marketplace })))
        .onConflict((oc) =>
          oc
            .columns(["marketplace", "externalId", "finish", "language", "recordedAt"])
            .doUpdateSet(stagingUpdateSet)
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
          "mpv.finish as finish",
          "mpv.language as language",
          "mp.groupId as groupId",
          "mp.productName as productName",
        ])
        .where("mp.marketplace", "in", marketplaces)
        .execute();
    },

    /** @returns External IDs for a single marketplace. */
    async existingExternalIdsByMarketplace(marketplace: string): Promise<number[]> {
      const rows = await db
        .selectFrom("marketplaceProducts")
        .select(["externalId"])
        .where("marketplace", "=", marketplace)
        .execute();
      return rows.map((r) => r.externalId);
    },

    /**
     * Batch-insert product + variant rows. Upserts the parent product by
     * `(marketplace, external_id)` then upserts the variant by
     * `(marketplaceProductId, finish, language)` pointing at the given printing.
     * No-ops on conflict (used by auto-match where we don't want to overwrite
     * existing mappings).
     */
    async batchInsertProductVariants(
      values: {
        marketplace: string;
        externalId: number;
        groupId: number;
        productName: string;
        printingId: string;
        finish: string;
        /** `null` for cross-language aggregate variants (e.g. Cardmarket). */
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
      }));

      await db
        .insertInto("marketplaceProducts")
        .values(productRows)
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

      const variantRows = values.map((v) => {
        const productId = productIdByKey.get(`${v.marketplace}::${v.externalId}`);
        if (!productId) {
          throw new Error(
            `batchInsertProductVariants: missing product id for ${v.marketplace} ${v.externalId}`,
          );
        }
        return {
          marketplaceProductId: productId,
          printingId: v.printingId,
          finish: v.finish,
          language: v.language,
        };
      });

      await db
        .insertInto("marketplaceProductVariants")
        .values(variantRows)
        .onConflict((oc) => oc.columns(["marketplaceProductId", "finish", "language"]).doNothing())
        .execute();
    },
  };
}
