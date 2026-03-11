import type { Database } from "@openrift/shared/db";
import type { Transaction } from "kysely";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";

// ── Unified product-info shape consumed by the frontend ─────────────────────

export interface ProductInfo {
  productName: string | null;
  marketCents: number;
  lowCents: number | null;
  currency: string;
  recordedAt: string;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
}

// ── Marketplace-specific config ─────────────────────────────────────────────

export interface MarketplaceConfig {
  currency: string;
  tables: {
    staging: "tcgplayer_staging" | "cardmarket_staging";
    sources: "tcgplayer_sources" | "cardmarket_sources";
    snapshots: "tcgplayer_snapshots" | "cardmarket_snapshots";
    groups: "tcgplayer_groups" | "cardmarket_expansions";
    ignored: "tcgplayer_ignored_products" | "cardmarket_ignored_products";
    overrides: "tcgplayer_staging_card_overrides" | "cardmarket_staging_card_overrides";
  };
  /** Column name that holds the group/expansion ID in the groups table */
  groupIdColumn: "group_id" | "expansion_id";
  /** Map a staging row → the unified product-info price fields */
  mapStagingPrices: (row: StagingRow) => Omit<ProductInfo, "productName" | "recordedAt">;
  /** Select + map snapshot prices for mapped products */
  snapshotQuery: (printingIds: string[]) => Promise<MappedSnapshotRow[]>;
  /** Map a snapshot query result → unified product-info */
  mapSnapshotPrices: (row: MappedSnapshotRow) => ProductInfo;
  /** Insert a snapshot row from staging during the POST (map) operation */
  insertSnapshot: (tx: Transaction<Database>, sourceId: number, row: StagingRow) => Promise<void>;
  /** Insert a staging row from a snapshot during the DELETE (unmap) operation */
  insertStagingFromSnapshot: (
    tx: Transaction<Database>,
    ps: { external_id: number; group_id: number; product_name: string },
    finish: string,
    snap: SnapshotRow,
  ) => Promise<void>;
  /** Raw SQL to bulk-copy all snapshots back to staging (DELETE /all) */
  bulkUnmapSql: (tx: Transaction<Database>) => Promise<void>;
}

// Row shapes used by the config callbacks (kept loose so both marketplaces fit)
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- generic row from selectAll()
export type StagingRow = Record<string, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- generic row from selectAll()
export type SnapshotRow = Record<string, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- generic row from snapshot query
export type MappedSnapshotRow = Record<string, any>;

// ── TCGPlayer config ────────────────────────────────────────────────────────

export const tcgplayerConfig: MarketplaceConfig = {
  currency: "USD",
  tables: {
    staging: "tcgplayer_staging",
    sources: "tcgplayer_sources",
    snapshots: "tcgplayer_snapshots",
    groups: "tcgplayer_groups",
    ignored: "tcgplayer_ignored_products",
    overrides: "tcgplayer_staging_card_overrides",
  },
  groupIdColumn: "group_id",

  mapStagingPrices: (row) => ({
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    currency: "USD",
    midCents: row.mid_cents,
    highCents: row.high_cents,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
  }),

  snapshotQuery: (printingIds) =>
    db
      .selectFrom("tcgplayer_sources as ps")
      .innerJoin("tcgplayer_snapshots as snap", "snap.source_id", "ps.id")
      .select([
        "ps.printing_id",
        "ps.product_name",
        "snap.market_cents",
        "snap.low_cents",
        "snap.mid_cents",
        "snap.high_cents",
        "snap.recorded_at",
      ])
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute(),

  mapSnapshotPrices: (row) => ({
    productName: row.product_name,
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    currency: "USD",
    recordedAt: row.recorded_at.toISOString(),
    midCents: row.mid_cents,
    highCents: row.high_cents,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
  }),

  insertSnapshot: async (tx, sourceId, row) => {
    await tx
      .insertInto("tcgplayer_snapshots")
      .values({
        source_id: sourceId,
        recorded_at: row.recorded_at,
        market_cents: row.market_cents,
        low_cents: row.low_cents,
        mid_cents: row.mid_cents,
        high_cents: row.high_cents,
      })
      .onConflict((oc) =>
        oc.columns(["source_id", "recorded_at"]).doUpdateSet({
          market_cents: row.market_cents,
          low_cents: row.low_cents,
          mid_cents: row.mid_cents,
          high_cents: row.high_cents,
        }),
      )
      .execute();
  },

  insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
    await tx
      .insertInto("tcgplayer_staging")
      .values({
        external_id: ps.external_id,
        group_id: ps.group_id,
        product_name: ps.product_name,
        finish,
        recorded_at: snap.recorded_at,
        market_cents: snap.market_cents,
        low_cents: snap.low_cents,
        mid_cents: snap.mid_cents,
        high_cents: snap.high_cents,
      })
      .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
      .execute();
  },

  bulkUnmapSql: async (tx) => {
    await sql`
      INSERT INTO tcgplayer_staging (external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, mid_cents, high_cents)
      SELECT s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at, snap.market_cents, snap.low_cents, snap.mid_cents, snap.high_cents
      FROM tcgplayer_sources s
      JOIN printings p ON p.id = s.printing_id
      JOIN tcgplayer_snapshots snap ON snap.source_id = s.id
      WHERE s.external_id IS NOT NULL
      ON CONFLICT (external_id, finish, recorded_at) DO NOTHING
    `.execute(tx);
  },
};

// ── Cardmarket config ───────────────────────────────────────────────────────

export const cardmarketConfig: MarketplaceConfig = {
  currency: "EUR",
  tables: {
    staging: "cardmarket_staging",
    sources: "cardmarket_sources",
    snapshots: "cardmarket_snapshots",
    groups: "cardmarket_expansions",
    ignored: "cardmarket_ignored_products",
    overrides: "cardmarket_staging_card_overrides",
  },
  groupIdColumn: "expansion_id",

  mapStagingPrices: (row) => ({
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    currency: "EUR",
    midCents: null,
    highCents: null,
    trendCents: row.trend_cents,
    avg1Cents: row.avg1_cents,
    avg7Cents: row.avg7_cents,
    avg30Cents: row.avg30_cents,
  }),

  snapshotQuery: (printingIds) =>
    db
      .selectFrom("cardmarket_sources as ps")
      .innerJoin("cardmarket_snapshots as snap", "snap.source_id", "ps.id")
      .select([
        "ps.printing_id",
        "ps.product_name",
        "snap.market_cents",
        "snap.low_cents",
        "snap.trend_cents",
        "snap.avg1_cents",
        "snap.avg7_cents",
        "snap.avg30_cents",
        "snap.recorded_at",
      ])
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute(),

  mapSnapshotPrices: (row) => ({
    productName: row.product_name,
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    currency: "EUR",
    recordedAt: row.recorded_at.toISOString(),
    midCents: null,
    highCents: null,
    trendCents: row.trend_cents,
    avg1Cents: row.avg1_cents,
    avg7Cents: row.avg7_cents,
    avg30Cents: row.avg30_cents,
  }),

  insertSnapshot: async (tx, sourceId, row) => {
    await tx
      .insertInto("cardmarket_snapshots")
      .values({
        source_id: sourceId,
        recorded_at: row.recorded_at,
        market_cents: row.market_cents,
        low_cents: row.low_cents,
        trend_cents: row.trend_cents,
        avg1_cents: row.avg1_cents,
        avg7_cents: row.avg7_cents,
        avg30_cents: row.avg30_cents,
      })
      .onConflict((oc) =>
        oc.columns(["source_id", "recorded_at"]).doUpdateSet({
          market_cents: row.market_cents,
          low_cents: row.low_cents,
          trend_cents: row.trend_cents,
          avg1_cents: row.avg1_cents,
          avg7_cents: row.avg7_cents,
          avg30_cents: row.avg30_cents,
        }),
      )
      .execute();
  },

  insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
    await tx
      .insertInto("cardmarket_staging")
      .values({
        external_id: ps.external_id,
        group_id: ps.group_id,
        product_name: ps.product_name,
        finish,
        recorded_at: snap.recorded_at,
        market_cents: snap.market_cents,
        low_cents: snap.low_cents,
        trend_cents: snap.trend_cents,
        avg1_cents: snap.avg1_cents,
        avg7_cents: snap.avg7_cents,
        avg30_cents: snap.avg30_cents,
      })
      .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
      .execute();
  },

  bulkUnmapSql: async (tx) => {
    await sql`
      INSERT INTO cardmarket_staging (external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents)
      SELECT s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at, snap.market_cents, snap.low_cents, snap.trend_cents, snap.avg1_cents, snap.avg7_cents, snap.avg30_cents
      FROM cardmarket_sources s
      JOIN printings p ON p.id = s.printing_id
      JOIN cardmarket_snapshots snap ON snap.source_id = s.id
      WHERE s.external_id IS NOT NULL
      ON CONFLICT (external_id, finish, recorded_at) DO NOTHING
    `.execute(tx);
  },
};
