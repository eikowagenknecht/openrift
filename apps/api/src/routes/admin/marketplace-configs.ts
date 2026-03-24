import type { Repos } from "../../deps.js";
import type { marketplaceTransferRepo } from "../../repositories/marketplace-transfer.js";

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
  insertSnapshot(productId: string, row: StagingRow): Promise<void>;
  /** Insert a staging row from a snapshot during the DELETE (unmap) operation */
  insertStagingFromSnapshot(
    ps: { externalId: number; groupId: number; productName: string },
    finish: string,
    snap: SnapshotRow,
  ): Promise<void>;
  /** Raw SQL to bulk-copy all snapshots back to staging (DELETE /all) */
  bulkUnmapSql(): Promise<void>;
}

// ── Factory helper ──────────────────────────────────────────────────────────

function createMarketplaceConfig(opts: {
  marketplace: string;
  currency: string;
  mapPrices(row: PriceColumns): Omit<ProductInfo, "productName" | "recordedAt">;
  repo: ReturnType<typeof marketplaceTransferRepo>;
}): MarketplaceConfig {
  const { marketplace, mapPrices, repo } = opts;

  return {
    marketplace,
    currency: opts.currency,

    mapStagingPrices: mapPrices,

    snapshotQuery: (printingIds) => repo.snapshotsByMarketplace(marketplace, printingIds),

    mapSnapshotPrices: (row) => ({
      productName: row.productName,
      recordedAt: row.recordedAt.toISOString(),
      ...mapPrices(row),
    }),

    insertSnapshot: (productId, row) => repo.insertSnapshot(productId, row),

    insertStagingFromSnapshot: (ps, finish, snap) =>
      repo.insertStagingFromSnapshot(marketplace, ps, finish, snap),

    bulkUnmapSql: () => repo.bulkUnmapToStaging(marketplace),
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

const ctMapPrices = (row: PriceColumns) => ({
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

export function createMarketplaceConfigs(repos: Repos) {
  const repo = repos.marketplaceTransfer;
  return {
    tcgplayer: createMarketplaceConfig({
      marketplace: "tcgplayer",
      currency: "USD",
      mapPrices: tcgMapPrices,
      repo,
    }),
    cardmarket: createMarketplaceConfig({
      marketplace: "cardmarket",
      currency: "EUR",
      mapPrices: cmMapPrices,
      repo,
    }),
    cardtrader: createMarketplaceConfig({
      marketplace: "cardtrader",
      currency: "EUR",
      mapPrices: ctMapPrices,
      repo,
    }),
  };
}
