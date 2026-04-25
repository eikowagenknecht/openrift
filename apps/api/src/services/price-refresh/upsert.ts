/**
 * Core upsert logic for price refresh workflows.
 *
 * Per fetch cycle we upsert one `marketplace_products` row per SKU and one
 * `marketplace_product_prices` row per (product, recorded_at). The unmatched
 * products panel and fuzzy name match read directly off `marketplace_products`
 * (LEFT JOIN bindings) — no staging side-table.
 */

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

// ── Constants ──────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;

// ── Ignored keys ───────────────────────────────────────────────────────────

/**
 * Load the two sets of ignored keys (level-2 whole-product + level-3 per-variant)
 * for a marketplace.
 *
 * @returns `{ productIds, variantKeys }`. Skip a staging row if its externalId
 *          is in `productIds` OR its `externalId::finish::language` tuple is in
 *          `variantKeys`.
 */
export function loadIgnoredKeys(
  priceRefresh: Repos["priceRefresh"],
  marketplace: string,
): Promise<LoadedIgnoredKeys> {
  return priceRefresh.loadIgnoredKeys(marketplace);
}

// ── Group upsert ────────────────────────────────────────────────────────────

/**
 * Upsert marketplace groups (TCGPlayer groups / Cardmarket expansions).
 * Uses COALESCE to preserve existing name/abbreviation when not provided.
 */
export async function upsertMarketplaceGroups(
  priceRefresh: Repos["priceRefresh"],
  marketplace: string,
  groups: GroupRow[],
): Promise<void> {
  await priceRefresh.upsertGroups(marketplace, groups);
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── Main upsert ────────────────────────────────────────────────────────────

interface ProductPriceInsertRow extends PriceColumns {
  marketplaceProductId: string;
  recordedAt: Date;
}

/**
 * Batch-upsert product prices and staging rows for a single marketplace.
 * For each distinct SKU in the fetch, upsert a `marketplace_products` row and
 * then a `marketplace_product_prices` row per recorded_at. Every bound
 * printing inherits the same price history through the shared product row —
 * no more per-variant fan-out.
 *
 * @returns Per-table breakdown of new, updated, and unchanged rows.
 */
export async function upsertPriceData(
  priceRefresh: Repos["priceRefresh"],
  log: Logger,
  config: PriceUpsertConfig,
  allStaging: StagingRow[],
): Promise<UpsertCounts> {
  const { marketplace } = config;
  const repo = priceRefresh;

  // ── Product upsert ──────────────────────────────────────────────────────
  //
  // One `marketplace_products` row per SKU in the fetch. Multiple staging
  // rows for the same SKU collapse onto a single product, so we feed the
  // unique SKU set here. Groups/names update on conflict — they legitimately
  // drift over time.
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

  // ── Build product_prices rows ───────────────────────────────────────────
  //
  // One row per (product_id, recorded_at). Multiple staging rows with the
  // same SKU and timestamp (shouldn't happen, but the fetcher doesn't
  // guarantee it) collapse to the last write — the upsert DO UPDATE step
  // handles any remaining drift when the same (product, recorded_at) shows
  // up twice.
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
