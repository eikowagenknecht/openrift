/**
 * Per fetch cycle: one `marketplace_products` row per SKU and one
 * `marketplace_product_prices` row per (product, recorded_at). The unmatched
 * products panel and fuzzy name match read `marketplace_products` directly.
 */

import type { Marketplace } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";

import type { Repos } from "../../deps.js";
import type { LoadedIgnoredKeys } from "../../repositories/price-refresh.js";
import { skuKey } from "../../repositories/price-refresh.js";
import type {
  GroupRow,
  PriceColumns,
  PriceUpsertConfig,
  StagingRow,
  UpsertCounts,
} from "./types.js";

const BATCH_SIZE = 200;

/**
 * Skip a staging row if its externalId is in `productIds` (whole-product
 * ignore) or its `externalId::finish::language` tuple is in `variantKeys`.
 */
export function loadIgnoredKeys(
  priceRefresh: Repos["priceRefresh"],
  marketplace: Marketplace,
): Promise<LoadedIgnoredKeys> {
  return priceRefresh.loadIgnoredKeys(marketplace);
}

/** Preserves existing name/abbreviation on conflict when not provided. */
export async function upsertMarketplaceGroups(
  priceRefresh: Repos["priceRefresh"],
  marketplace: Marketplace,
  groups: GroupRow[],
): Promise<void> {
  await priceRefresh.upsertGroups(marketplace, groups);
}

function pickPrices(row: PriceColumns): PriceColumns {
  return {
    marketCents: row.marketCents,
    lowCents: row.lowCents,
    zeroLowCents: row.zeroLowCents,
    midCents: row.midCents,
    highCents: row.highCents,
    trendCents: row.trendCents,
    avg1Cents: row.avg1Cents,
    avg7Cents: row.avg7Cents,
    avg30Cents: row.avg30Cents,
  };
}

interface ProductPriceInsertRow extends PriceColumns {
  marketplaceProductId: string;
  recordedAt: Date;
}

export async function upsertPriceData(
  priceRefresh: Repos["priceRefresh"],
  log: Logger,
  config: PriceUpsertConfig,
  allStaging: StagingRow[],
): Promise<UpsertCounts> {
  const { marketplace } = config;
  const repo = priceRefresh;

  // Groups/names update on conflict; they legitimately drift over time.
  const uniqueSkus = new Map<
    string,
    {
      externalId: number;
      finish: string;
      language: string | null;
      groupId: number;
      productName: string;
    }
  >();
  for (const staging of allStaging) {
    uniqueSkus.set(skuKey(staging.externalId, staging.finish, staging.language), {
      externalId: staging.externalId,
      finish: staging.finish,
      language: staging.language,
      groupId: staging.groupId,
      productName: staging.productName,
    });
  }

  const productIdByKey = new Map<string, string>();
  if (uniqueSkus.size > 0) {
    const skus = [...uniqueSkus.values()];
    for (let i = 0; i < skus.length; i += BATCH_SIZE) {
      const chunk = skus.slice(i, i + BATCH_SIZE);
      const products = await repo.upsertProductsForMarketplace(marketplace, chunk);
      for (const row of products) {
        productIdByKey.set(skuKey(row.externalId, row.finish, row.language), row.id);
      }
    }
  }

  // Staging rows sharing a (product, recorded_at) collapse to the last
  // write; the upsert's DO UPDATE handles any remaining duplicates.
  const uniquePrices = new Map<string, ProductPriceInsertRow>();
  for (const staging of allStaging) {
    const productId = productIdByKey.get(
      skuKey(staging.externalId, staging.finish, staging.language),
    );
    if (productId === undefined) {
      continue;
    }
    uniquePrices.set(`${productId}|${staging.recordedAt.toISOString()}`, {
      marketplaceProductId: productId,
      recordedAt: staging.recordedAt,
      ...pickPrices(staging),
    });
  }

  const priceRows = [...uniquePrices.values()];
  if (priceRows.length > 0) {
    log.info(`${priceRows.length} price rows across ${uniqueSkus.size} SKUs`);
  }

  const pricesBefore = await repo.countProductPrices(marketplace);
  let pricesAffected = 0;
  for (let i = 0; i < priceRows.length; i += BATCH_SIZE) {
    const batch = priceRows.slice(i, i + BATCH_SIZE);
    pricesAffected += await repo.upsertProductPrices(batch);
  }
  const pricesAfter = await repo.countProductPrices(marketplace);
  const newPrices = pricesAfter - pricesBefore;

  return {
    prices: {
      total: priceRows.length,
      new: newPrices,
      updated: pricesAffected - newPrices,
      unchanged: priceRows.length - pricesAffected,
    },
  };
}
