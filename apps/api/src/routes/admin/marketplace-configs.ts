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
  marketCents: number;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
}

/** Common fields on staging rows (shared by both marketplaces). */
export interface StagingRow extends PriceColumns {
  externalId: number;
  groupId: number;
  productName: string;
  finish: string;
  recordedAt: Date;
}

/** Snapshot row (all 8 price columns + recorded_at). */
interface SnapshotRow extends PriceColumns {
  recordedAt: Date;
}

/** Mapped snapshot query result (sources JOIN snapshots). */
interface MappedSnapshotRow extends PriceColumns {
  printingId: string;
  productName: string;
  recordedAt: Date;
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
    ps: { externalId: number; groupId: number; productName: string },
    finish: string,
    snap: SnapshotRow,
  ): Promise<void>;
  /** Raw SQL to bulk-copy all snapshots back to staging (DELETE /all) */
  bulkUnmapSql(tx: Transaction<Database>): Promise<void>;
}

// ── Typed doUpdateSet for all 8 price columns ───────────────────────────────

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
      productName: row.productName,
      recordedAt: row.recordedAt.toISOString(),
      ...mapPrices(row),
    }),

    insertSnapshot: async (tx, sourceId, row) => {
      await tx
        .insertInto("marketplaceSnapshots")
        .values({
          sourceId,
          recordedAt: row.recordedAt,
          marketCents: row.marketCents,
          lowCents: row.lowCents,
          midCents: row.midCents,
          highCents: row.highCents,
          trendCents: row.trendCents,
          avg1Cents: row.avg1Cents,
          avg7Cents: row.avg7Cents,
          avg30Cents: row.avg30Cents,
        })
        .onConflict((oc) => oc.columns(["sourceId", "recordedAt"]).doUpdateSet(PRICE_EXCLUDED_SET))
        .execute();
    },

    insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
      await tx
        .insertInto("marketplaceStaging")
        .values({
          marketplace,
          externalId: ps.externalId,
          groupId: ps.groupId,
          productName: ps.productName,
          finish,
          recordedAt: snap.recordedAt,
          marketCents: snap.marketCents,
          lowCents: snap.lowCents,
          midCents: snap.midCents,
          highCents: snap.highCents,
          trendCents: snap.trendCents,
          avg1Cents: snap.avg1Cents,
          avg7Cents: snap.avg7Cents,
          avg30Cents: snap.avg30Cents,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "recordedAt"]).doNothing(),
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
  marketCents: row.marketCents,
  lowCents: row.lowCents,
  currency: "USD",
  midCents: row.midCents,
  highCents: row.highCents,
  trendCents: row.trendCents,
  avg1Cents: row.avg1Cents,
  avg7Cents: row.avg7Cents,
  avg30Cents: row.avg30Cents,
});

const cmMapPrices = (row: PriceColumns) => ({
  marketCents: row.marketCents,
  lowCents: row.lowCents,
  currency: "EUR",
  midCents: row.midCents,
  highCents: row.highCents,
  trendCents: row.trendCents,
  avg1Cents: row.avg1Cents,
  avg7Cents: row.avg7Cents,
  avg30Cents: row.avg30Cents,
});

function snapshotQueryFor(db: Kysely<Database>, marketplace: string) {
  return (printingIds: string[]) =>
    db
      .selectFrom("marketplaceSources as ps")
      .innerJoin("marketplaceSnapshots as snap", "snap.sourceId", "ps.id")
      .select([
        "ps.printingId",
        "ps.productName",
        "snap.marketCents",
        "snap.lowCents",
        "snap.midCents",
        "snap.highCents",
        "snap.trendCents",
        "snap.avg1Cents",
        "snap.avg7Cents",
        "snap.avg30Cents",
        "snap.recordedAt",
      ])
      .where("ps.marketplace", "=", marketplace)
      .where("ps.printingId", "in", printingIds)
      .orderBy("snap.recordedAt", "desc")
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
