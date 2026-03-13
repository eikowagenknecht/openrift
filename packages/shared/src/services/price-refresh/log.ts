import type { Logger } from "../../logger.js";
import type { PriceRefreshResult, UpsertCounts } from "./types.js";

/**
 * Log a human-readable breakdown of an upsert result (inserted / updated / unchanged)
 * across sources, snapshots, and staging tables.
 */
export function logUpsertCounts(log: Logger, counts: UpsertCounts): void {
  const inserted = [
    counts.sources.new > 0 ? `${counts.sources.new} sources` : null,
    counts.snapshots.new > 0 ? `${counts.snapshots.new} snapshots` : null,
    counts.staging.new > 0 ? `${counts.staging.new} staged` : null,
  ].filter(Boolean);

  const updated = [
    counts.sources.updated > 0 ? `${counts.sources.updated} sources` : null,
    counts.snapshots.updated > 0 ? `${counts.snapshots.updated} snapshots` : null,
    counts.staging.updated > 0 ? `${counts.staging.updated} staged` : null,
  ].filter(Boolean);

  const unchanged = [
    counts.sources.unchanged > 0 ? `${counts.sources.unchanged} sources` : null,
    counts.snapshots.unchanged > 0 ? `${counts.snapshots.unchanged} snapshots` : null,
    counts.staging.unchanged > 0 ? `${counts.staging.unchanged} staged` : null,
  ].filter(Boolean);

  log.info(`Inserted: ${inserted.length > 0 ? inserted.join(", ") : "\u2014"}`);
  log.info(`Updated: ${updated.length > 0 ? updated.join(", ") : "\u2014"}`);
  log.info(`Unchanged: ${unchanged.length > 0 ? unchanged.join(", ") : "\u2014"}`);
}

/**
 * Log a standardized fetch summary line for a price refresh.
 */
export function logFetchSummary(
  log: Logger,
  groupLabel: string,
  counts: PriceRefreshResult["fetched"],
  ignoredCount: number,
): void {
  const ignoredSuffix = ignoredCount > 0 ? `, ${ignoredCount} ignored` : "";
  log.info(
    `Fetched: ${counts.groups} ${groupLabel}, ${counts.products} products, ${counts.prices} prices${ignoredSuffix}`,
  );
}
