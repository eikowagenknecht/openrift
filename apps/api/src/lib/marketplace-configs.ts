import type { Marketplace } from "@openrift/shared/types/pricing";

import type { Repos } from "../deps.js";
import type { marketplaceMappingRepo } from "../repositories/marketplace-mapping.js";

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

export interface StagingRow extends PriceColumns {
  externalId: number;
  groupId: number;
  productName: string;
  finish: string;
  /** NULL for CM/TCG (see MarketplaceProductsTable in db/tables.ts). */
  language: string | null;
  recordedAt: Date;
}

interface MappedPriceRow extends PriceColumns {
  printingId: string;
  externalId: number;
  productName: string;
  finish: string;
  language: string | null;
  recordedAt: Date;
}

export interface MarketplaceConfig {
  marketplace: Marketplace;
  currency: string;
  mapStagingPrices: (row: StagingRow) => Omit<ProductInfo, "productName" | "recordedAt">;
  priceQuery: (printingIds: string[]) => Promise<MappedPriceRow[]>;
  mapPriceRow: (row: MappedPriceRow) => ProductInfo;
}

function createMarketplaceConfig(opts: {
  marketplace: Marketplace;
  currency: string;
  mapPrices: (row: PriceColumns) => Omit<ProductInfo, "productName" | "recordedAt">;
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
