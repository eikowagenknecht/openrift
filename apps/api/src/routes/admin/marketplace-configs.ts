import type { Database } from "@openrift/shared/db";
import type { Transaction } from "kysely";
import { sql } from "kysely";

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

// ── Row shapes used by config callbacks ─────────────────────────────────────

/** Common fields on staging rows (shared by both marketplaces). */
export interface StagingRow {
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
}

/** Common fields on snapshot rows (shared by both marketplaces). */
export interface SnapshotRow {
  recorded_at: Date;
}

/** Common fields on mapped snapshot query results (sources JOIN snapshots). */
export interface MappedSnapshotRow {
  printing_id: string;
  product_name: string;
  recorded_at: Date;
}

// ── Marketplace-specific price fields (defined once, reused for all row types)

interface TcgplayerPriceFields {
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
}

interface CardmarketPriceFields {
  market_cents: number;
  low_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
}

const TCGPLAYER_PRICE_COLS: readonly (keyof TcgplayerPriceFields)[] = [
  "market_cents",
  "low_cents",
  "mid_cents",
  "high_cents",
];

const CARDMARKET_PRICE_COLS: readonly (keyof CardmarketPriceFields)[] = [
  "market_cents",
  "low_cents",
  "trend_cents",
  "avg1_cents",
  "avg7_cents",
  "avg30_cents",
];

// Row types derived via intersection (replaces 6 separate interfaces)
type TcgplayerStagingRow = StagingRow & TcgplayerPriceFields;
type TcgplayerSnapshotRow = SnapshotRow & TcgplayerPriceFields;
type TcgplayerMappedSnapshotRow = MappedSnapshotRow & TcgplayerPriceFields;
type CardmarketStagingRow = StagingRow & CardmarketPriceFields;
type CardmarketSnapshotRow = SnapshotRow & CardmarketPriceFields;
type CardmarketMappedSnapshotRow = MappedSnapshotRow & CardmarketPriceFields;

// ── Marketplace-specific config ─────────────────────────────────────────────

export interface MarketplaceConfig<
  S extends StagingRow = StagingRow,
  N extends SnapshotRow = SnapshotRow,
  M extends MappedSnapshotRow = MappedSnapshotRow,
> {
  marketplace: string;
  currency: string;
  /** Marketplace-specific price column names (for bulk snapshot inserts) */
  priceColumns: readonly string[];
  /** Map a staging row → the unified product-info price fields */
  mapStagingPrices(row: S): Omit<ProductInfo, "productName" | "recordedAt">;
  /** Select + map snapshot prices for mapped products */
  snapshotQuery(printingIds: string[]): Promise<M[]>;
  /** Map a snapshot query result → unified product-info */
  mapSnapshotPrices(row: M): ProductInfo;
  /** Insert a snapshot row from staging during the POST (map) operation */
  insertSnapshot(tx: Transaction<Database>, sourceId: string, row: S): Promise<void>;
  /** Insert a staging row from a snapshot during the DELETE (unmap) operation */
  insertStagingFromSnapshot(
    tx: Transaction<Database>,
    ps: { external_id: number; group_id: number; product_name: string },
    finish: string,
    snap: N,
  ): Promise<void>;
  /** Raw SQL to bulk-copy all snapshots back to staging (DELETE /all) */
  bulkUnmapSql(tx: Transaction<Database>): Promise<void>;
}

// ── Factory helpers ─────────────────────────────────────────────────────────

function pick<T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = obj[key];
  }
  return result;
}

/**
 * Creates a MarketplaceConfig from marketplace-specific parameters.
 * All configs use the same unified tables, differentiated by the marketplace column.
 * @returns A fully wired MarketplaceConfig
 */
function createMarketplaceConfig<
  PF extends { market_cents: number; low_cents: number | null },
>(opts: {
  marketplace: string;
  currency: string;
  priceColumns: readonly (keyof PF & string)[];
  /** Map a row's price fields → unified ProductInfo (excluding productName/recordedAt) */
  mapPrices(row: PF): Omit<ProductInfo, "productName" | "recordedAt">;
  /** Typed Kysely snapshot query (kept per-marketplace for type safety) */
  snapshotQuery(printingIds: string[]): Promise<(MappedSnapshotRow & PF)[]>;
}): MarketplaceConfig<StagingRow & PF, SnapshotRow & PF, MappedSnapshotRow & PF> {
  const { marketplace, priceColumns, mapPrices, snapshotQuery } = opts;

  const priceCols = priceColumns.join(", ");
  const snapPriceCols = priceColumns.map((c) => `snap.${c}`).join(", ");

  return {
    marketplace,
    currency: opts.currency,
    priceColumns: priceColumns as readonly string[],

    mapStagingPrices: mapPrices as (
      row: StagingRow & PF,
    ) => Omit<ProductInfo, "productName" | "recordedAt">,

    snapshotQuery,

    mapSnapshotPrices: (row) => ({
      productName: row.product_name,
      recordedAt: row.recorded_at.toISOString(),
      ...mapPrices(row),
    }),

    insertSnapshot: async (tx, sourceId, row) => {
      const prices = pick(row, priceColumns);
      await tx
        .insertInto("marketplace_snapshots")
        .values({
          source_id: sourceId,
          recorded_at: row.recorded_at,
          ...prices,
        } as never)
        .onConflict((oc) => oc.columns(["source_id", "recorded_at"]).doUpdateSet(prices as never))
        .execute();
    },

    insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
      const prices = pick(snap, priceColumns);
      await tx
        .insertInto("marketplace_staging")
        .values({
          marketplace,
          external_id: ps.external_id,
          group_id: ps.group_id,
          product_name: ps.product_name,
          finish,
          recorded_at: snap.recorded_at,
          ...prices,
        } as never)
        .onConflict((oc) =>
          oc.columns(["marketplace", "external_id", "finish", "recorded_at"]).doNothing(),
        )
        .execute();
    },

    // raw sql: INSERT...SELECT with dynamic column list and ON CONFLICT
    bulkUnmapSql: async (tx) => {
      await sql`
        INSERT INTO marketplace_staging (marketplace, external_id, group_id, product_name, finish, recorded_at, ${sql.raw(priceCols)})
        SELECT s.marketplace, s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at, ${sql.raw(snapPriceCols)}
        FROM marketplace_sources s
        JOIN printings p ON p.id = s.printing_id
        JOIN marketplace_snapshots snap ON snap.source_id = s.id
        WHERE s.marketplace = ${marketplace}
          AND s.external_id IS NOT NULL
        ON CONFLICT (marketplace, external_id, finish, recorded_at) DO NOTHING
      `.execute(tx);
    },
  };
}

// ── TCGPlayer config ────────────────────────────────────────────────────────

export const tcgplayerConfig: MarketplaceConfig<
  TcgplayerStagingRow,
  TcgplayerSnapshotRow,
  TcgplayerMappedSnapshotRow
> = createMarketplaceConfig<TcgplayerPriceFields>({
  marketplace: "tcgplayer",
  currency: "USD",
  priceColumns: TCGPLAYER_PRICE_COLS,
  mapPrices: (row) => ({
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
      .selectFrom("marketplace_sources as ps")
      .innerJoin("marketplace_snapshots as snap", "snap.source_id", "ps.id")
      .select([
        "ps.printing_id",
        "ps.product_name",
        "snap.market_cents",
        "snap.low_cents",
        "snap.mid_cents",
        "snap.high_cents",
        "snap.recorded_at",
      ])
      .where("ps.marketplace", "=", "tcgplayer")
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute(),
});

// ── Cardmarket config ───────────────────────────────────────────────────────

export const cardmarketConfig: MarketplaceConfig<
  CardmarketStagingRow,
  CardmarketSnapshotRow,
  CardmarketMappedSnapshotRow
> = createMarketplaceConfig<CardmarketPriceFields>({
  marketplace: "cardmarket",
  currency: "EUR",
  priceColumns: CARDMARKET_PRICE_COLS,
  mapPrices: (row) => ({
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
      .selectFrom("marketplace_sources as ps")
      .innerJoin("marketplace_snapshots as snap", "snap.source_id", "ps.id")
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
      .where("ps.marketplace", "=", "cardmarket")
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute(),
});
