import type { Repos } from "../../deps.js";
import type { marketplaceMappingRepo } from "../../repositories/marketplace-mapping.js";

// ── Unified product-info shape consumed by the frontend ─────────────────────

export interface ProductInfo {
  productName: string | null;
  marketCents: number | null;
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

/** All 8 price columns on `marketplace_product_prices`. */
interface PriceColumns {
  marketCents: number | null;
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
  /** NULL for CM/TCG (see MarketplaceProductsTable in db/tables.ts). */
  language: string | null;
  recordedAt: Date;
}

/** Latest-price query result for a bound printing (join through mpv → mp → prices). */
interface MappedPriceRow extends PriceColumns {
  printingId: string;
  externalId: number;
  productName: string;
  finish: string;
  language: string | null;
  recordedAt: Date;
}

// ── Marketplace-specific config ─────────────────────────────────────────────

export interface MarketplaceConfig {
  marketplace: string;
  currency: string;
  /** Map a staging row → the unified product-info price fields */
  mapStagingPrices(row: StagingRow): Omit<ProductInfo, "productName" | "recordedAt">;
  /** Fetch the latest price row per (printing × product) for the given printings. */
  priceQuery(printingIds: string[]): Promise<MappedPriceRow[]>;
  /** Map a price query result → unified product-info */
  mapPriceRow(row: MappedPriceRow): ProductInfo;
}

// ── Factory helper ──────────────────────────────────────────────────────────

function createMarketplaceConfig(opts: {
  marketplace: string;
  currency: string;
  mapPrices(row: PriceColumns): Omit<ProductInfo, "productName" | "recordedAt">;
  repo: ReturnType<typeof marketplaceMappingRepo>;
}): MarketplaceConfig {
  const { marketplace, mapPrices, repo } = opts;

  return {
    marketplace,
    currency: opts.currency,

    mapStagingPrices: mapPrices,

    priceQuery: (printingIds) => repo.pricesByMarketplace(marketplace, printingIds),

    mapPriceRow: (row) => ({
      productName: row.productName,
      recordedAt: row.recordedAt.toISOString(),
      ...mapPrices(row),
    }),
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
  const repo = repos.marketplaceMapping;
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
