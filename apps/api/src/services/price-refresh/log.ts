import type { PriceRefreshResponse } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";

import type { UpsertCounts } from "./types.js";

/**
 * Log a human-readable breakdown of an upsert result (inserted / updated /
 * unchanged) for the marketplace_product_prices table.
 */
export function logUpsertCounts(log: Logger, counts: UpsertCounts): void {
  const dash = "\u2014";
  log.info(`Inserted: ${counts.prices.new > 0 ? `${counts.prices.new} prices` : dash}`);
  log.info(`Updated: ${counts.prices.updated > 0 ? `${counts.prices.updated} prices` : dash}`);
  log.info(
    `Unchanged: ${counts.prices.unchanged > 0 ? `${counts.prices.unchanged} prices` : dash}`,
  );
}

/**
 * Log a standardized fetch summary line for a price refresh.
 */
export function logFetchSummary(
  log: Logger,
  counts: PriceRefreshResponse["transformed"],
  ignoredCount: number,
): void {
  const ignoredSuffix = ignoredCount > 0 ? `, ${ignoredCount} ignored` : "";
  log.info(
    `Fetched: ${counts.groups} groups, ${counts.products} products, ${counts.prices} prices${ignoredSuffix}`,
  );
}
