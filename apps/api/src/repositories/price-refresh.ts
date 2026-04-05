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
  marketCents: sql<number>`excluded.market_cents`,
  lowCents: sql<number | null>`excluded.low_cents`,
  midCents: sql<number | null>`excluded.mid_cents`,
  highCents: sql<number | null>`excluded.high_cents`,
  trendCents: sql<number | null>`excluded.trend_cents`,
  avg1Cents: sql<number | null>`excluded.avg1_cents`,
  avg7Cents: sql<number | null>`excluded.avg7_cents`,
  avg30Cents: sql<number | null>`excluded.avg30_cents`,
};

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
        ])
        .execute();
    },

    // ── Ignored keys ────────────────────────────────────────────────────────

    /** @returns Ignored product keys as "externalId::finish::language" set. */
    async loadIgnoredKeys(marketplace: string): Promise<Set<string>> {
      const rows = await db
        .selectFrom("marketplaceIgnoredProducts")
        .select(["externalId", "finish", "language"])
        .where("marketplace", "=", marketplace)
        .execute();
      return new Set(rows.map((r) => `${r.externalId}::${r.finish}::${r.language}`));
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

    // ── Source lookup ────────────────────────────────────────────────────────

    /** @returns Marketplace sources joined with printing finish, including source language. */
    sourcesWithFinish(marketplace: string) {
      return db
        .selectFrom("marketplaceProducts as src")
        .innerJoin("printings as p", "p.id", "src.printingId")
        .select(["src.id", "src.printingId", "src.externalId", "src.language", "p.finish"])
        .where("src.marketplace", "=", marketplace)
        .execute();
    },

    // ── Row counts ──────────────────────────────────────────────────────────

    /** @returns Row count for marketplace snapshots (joined via sources). */
    async countSnapshots(marketplace: string): Promise<number> {
      const result = await db
        .selectFrom("marketplaceSnapshots as snap")
        .innerJoin("marketplaceProducts as src", "src.id", "snap.productId")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("src.marketplace", "=", marketplace)
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
        productId: string;
        recordedAt: Date;
        marketCents: number;
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
            .columns(["productId", "recordedAt"])
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
        marketCents: number;
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

    /** @returns Existing marketplace_products rows for the given marketplaces. */
    existingSourcesByMarketplaces(marketplaces: string[]): Promise<
      {
        marketplace: string;
        externalId: number;
        printingId: string;
        groupId: number;
        productName: string;
      }[]
    > {
      return db
        .selectFrom("marketplaceProducts")
        .select(["marketplace", "externalId", "printingId", "groupId", "productName"])
        .where("marketplace", "in", marketplaces)
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

    /** Batch insert marketplace_products with ON CONFLICT DO NOTHING. */
    async batchInsertProducts(
      values: {
        marketplace: string;
        externalId: number;
        groupId: number;
        productName: string;
        printingId: string;
        language: string;
      }[],
    ): Promise<void> {
      if (values.length === 0) {
        return;
      }
      await db
        .insertInto("marketplaceProducts")
        .values(values)
        .onConflict((oc) => oc.columns(["marketplace", "printingId"]).doNothing())
        .execute();
    },
  };
}
