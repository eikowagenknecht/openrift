import type { Logger } from "@openrift/shared/logger";
import type { PriceRefreshResponse } from "@openrift/shared/types/api/admin";

import type { UpsertCounts } from "./types.js";

export function logUpsertCounts(log: Logger, counts: UpsertCounts): void {
  const dash = "\u2014";
  log.info(`Inserted: ${counts.prices.new > 0 ? `${counts.prices.new} prices` : dash}`);
  log.info(`Updated: ${counts.prices.updated > 0 ? `${counts.prices.updated} prices` : dash}`);
  log.info(
    `Unchanged: ${counts.prices.unchanged > 0 ? `${counts.prices.unchanged} prices` : dash}`,
  );
}

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
