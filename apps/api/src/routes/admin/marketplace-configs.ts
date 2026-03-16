import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../db/index.js";

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

/** All 8 price columns shared by marketplace_snapshots and marketplace_staging. */
interface PriceColumns {
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
}

/** Common fields on staging rows (shared by both marketplaces). */
export interface StagingRow extends PriceColumns {
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
}

/** Snapshot row (all 8 price columns + recorded_at). */
interface SnapshotRow extends PriceColumns {
  recorded_at: Date;
}

/** Mapped snapshot query result (sources JOIN snapshots). */
interface MappedSnapshotRow extends PriceColumns {
  printing_id: string;
  product_name: string;
  recorded_at: Date;
}

// ── Marketplace-specific config ─────────────────────────────────────────────

export interface MarketplaceConfig {
  marketplace: string;
  currency: string;
  /** Map a staging row → the unified product-info price fields */
  mapStagingPrices(row: StagingRow): Omit<ProductInfo, "productName" | "recordedAt">;
  /** Select + map snapshot prices for mapped products */
  snapshotQuery(printingIds: string[]): Promise<MappedSnapshotRow[]>;
  /** Map a snapshot query result → unified product-info */
  mapSnapshotPrices(row: MappedSnapshotRow): ProductInfo;
  /** Insert a snapshot row from staging during the POST (map) operation */
  insertSnapshot(tx: Transaction<Database>, sourceId: string, row: StagingRow): Promise<void>;
  /** Insert a staging row from a snapshot during the DELETE (unmap) operation */
  insertStagingFromSnapshot(
    tx: Transaction<Database>,
    ps: { external_id: number; group_id: number; product_name: string },
    finish: string,
    snap: SnapshotRow,
  ): Promise<void>;
  /** Raw SQL to bulk-copy all snapshots back to staging (DELETE /all) */
  bulkUnmapSql(tx: Transaction<Database>): Promise<void>;
}

// ── Typed doUpdateSet for all 8 price columns ───────────────────────────────

const PRICE_EXCLUDED_SET = {
  market_cents: sql<number>`excluded.market_cents`,
  low_cents: sql<number | null>`excluded.low_cents`,
  mid_cents: sql<number | null>`excluded.mid_cents`,
  high_cents: sql<number | null>`excluded.high_cents`,
  trend_cents: sql<number | null>`excluded.trend_cents`,
  avg1_cents: sql<number | null>`excluded.avg1_cents`,
  avg7_cents: sql<number | null>`excluded.avg7_cents`,
  avg30_cents: sql<number | null>`excluded.avg30_cents`,
};

// ── Factory helper ──────────────────────────────────────────────────────────

function createMarketplaceConfig(opts: {
  marketplace: string;
  currency: string;
  mapPrices(row: PriceColumns): Omit<ProductInfo, "productName" | "recordedAt">;
  snapshotQuery(printingIds: string[]): Promise<MappedSnapshotRow[]>;
}): MarketplaceConfig {
  const { marketplace, mapPrices, snapshotQuery } = opts;

  return {
    marketplace,
    currency: opts.currency,

    mapStagingPrices: mapPrices,

    snapshotQuery,

    mapSnapshotPrices: (row) => ({
      productName: row.product_name,
      recordedAt: row.recorded_at.toISOString(),
      ...mapPrices(row),
    }),

    insertSnapshot: async (tx, sourceId, row) => {
      await tx
        .insertInto("marketplace_snapshots")
        .values({
          source_id: sourceId,
          recorded_at: row.recorded_at,
          market_cents: row.market_cents,
          low_cents: row.low_cents,
          mid_cents: row.mid_cents,
          high_cents: row.high_cents,
          trend_cents: row.trend_cents,
          avg1_cents: row.avg1_cents,
          avg7_cents: row.avg7_cents,
          avg30_cents: row.avg30_cents,
        })
        .onConflict((oc) =>
          oc.columns(["source_id", "recorded_at"]).doUpdateSet(PRICE_EXCLUDED_SET),
        )
        .execute();
    },

    insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
      await tx
        .insertInto("marketplace_staging")
        .values({
          marketplace,
          external_id: ps.external_id,
          group_id: ps.group_id,
          product_name: ps.product_name,
          finish,
          recorded_at: snap.recorded_at,
          market_cents: snap.market_cents,
          low_cents: snap.low_cents,
          mid_cents: snap.mid_cents,
          high_cents: snap.high_cents,
          trend_cents: snap.trend_cents,
          avg1_cents: snap.avg1_cents,
          avg7_cents: snap.avg7_cents,
          avg30_cents: snap.avg30_cents,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "external_id", "finish", "recorded_at"]).doNothing(),
        )
        .execute();
    },

    bulkUnmapSql: async (tx) => {
      await sql`
        INSERT INTO marketplace_staging (marketplace, external_id, group_id, product_name, finish, recorded_at,
          market_cents, low_cents, mid_cents, high_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents)
        SELECT s.marketplace, s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at,
          snap.market_cents, snap.low_cents, snap.mid_cents, snap.high_cents, snap.trend_cents, snap.avg1_cents, snap.avg7_cents, snap.avg30_cents
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

const tcgMapPrices = (row: PriceColumns) => ({
  marketCents: row.market_cents,
  lowCents: row.low_cents,
  currency: "USD",
  midCents: row.mid_cents,
  highCents: row.high_cents,
  trendCents: row.trend_cents,
  avg1Cents: row.avg1_cents,
  avg7Cents: row.avg7_cents,
  avg30Cents: row.avg30_cents,
});

const cmMapPrices = (row: PriceColumns) => ({
  marketCents: row.market_cents,
  lowCents: row.low_cents,
  currency: "EUR",
  midCents: row.mid_cents,
  highCents: row.high_cents,
  trendCents: row.trend_cents,
  avg1Cents: row.avg1_cents,
  avg7Cents: row.avg7_cents,
  avg30Cents: row.avg30_cents,
});

function snapshotQueryFor(db: Kysely<Database>, marketplace: string) {
  return (printingIds: string[]) =>
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
        "snap.trend_cents",
        "snap.avg1_cents",
        "snap.avg7_cents",
        "snap.avg30_cents",
        "snap.recorded_at",
      ])
      .where("ps.marketplace", "=", marketplace)
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute();
}

export function createMarketplaceConfigs(db: Kysely<Database>) {
  return {
    tcgplayer: createMarketplaceConfig({
      marketplace: "tcgplayer",
      currency: "USD",
      mapPrices: tcgMapPrices,
      snapshotQuery: snapshotQueryFor(db, "tcgplayer"),
    }),
    cardmarket: createMarketplaceConfig({
      marketplace: "cardmarket",
      currency: "EUR",
      mapPrices: cmMapPrices,
      snapshotQuery: snapshotQueryFor(db, "cardmarket"),
    }),
  };
}
