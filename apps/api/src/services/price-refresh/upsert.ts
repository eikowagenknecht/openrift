/**
 * Core upsert logic for price refresh workflows.
 *
 * Handles batch upserting of snapshots and staging rows,
 * deduplication, and conflict resolution with IS DISTINCT FROM.
 */

import type { Logger } from "@openrift/shared/logger";

import type { Repos } from "../../deps.js";
import type { LoadedIgnoredKeys } from "../../repositories/price-refresh.js";
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
    midCents: row.midCents,
    highCents: row.highCents,
    trendCents: row.trendCents,
    avg1Cents: row.avg1Cents,
    avg7Cents: row.avg7Cents,
    avg30Cents: row.avg30Cents,
  };
}

/**
 * Thin wrapper to count rows via the repo, keeping the two-arg call pattern.
 * @returns Row count.
 */
function countRows(
  repo: Repos["priceRefresh"],
  table: "marketplaceSnapshots" | "marketplaceStaging",
  marketplace: string,
): Promise<number> {
  return table === "marketplaceSnapshots"
    ? repo.countSnapshots(marketplace)
    : repo.countStaging(marketplace);
}

// ── Main upsert ────────────────────────────────────────────────────────────

interface SnapshotInsertRow extends PriceColumns {
  variantId: string;
  recordedAt: Date;
}

/**
 * Batch-upsert snapshots and staging rows for a single marketplace
 * (TCGPlayer or Cardmarket). Loads source mappings, builds snapshot rows
 * from staging data, deduplicates inputs, handles conflict resolution
 * with `IS DISTINCT FROM` to skip no-op updates, and returns per-table counts
 * of new / updated / unchanged rows.
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

  // ── Variant lookup (single query for both snapshot building & ID mapping) ─

  const dbVariants = await repo.variantsWithFinish(marketplace);

  // ── Build snapshots from staging + variant mappings ─────────────────────

  // Match staging rows to mapped variants. Normally the key is
  // (externalId, finish, language) so prices flow only to the exactly
  // matching variant. For language-aggregate marketplaces (Cardmarket)
  // variants have `language = NULL` and staging rows carry an arbitrary
  // placeholder, so the key drops the language dimension entirely.
  const keyOf = (externalId: number, finish: string, language: string | null): string =>
    config.languageAggregate ? `${externalId}::${finish}` : `${externalId}::${finish}::${language}`;

  const variantByKey = Map.groupBy(dbVariants, (src) =>
    keyOf(src.externalId, src.finish, src.language),
  );

  const uniqueSnapshots = new Map<string, SnapshotInsertRow>();
  for (const staging of allStaging) {
    const variants = variantByKey.get(keyOf(staging.externalId, staging.finish, staging.language));
    if (!variants) {
      continue;
    }
    for (const variant of variants) {
      const snapKey = `${variant.id}|${staging.recordedAt.toISOString()}`;
      uniqueSnapshots.set(snapKey, {
        variantId: variant.id,
        recordedAt: staging.recordedAt,
        ...pickPrices(staging),
      });
    }
  }

  if (uniqueSnapshots.size > 0) {
    log.info(`${uniqueSnapshots.size} snapshots for ${dbVariants.length} mapped variants`);
  }

  const snapshotRows = [...uniqueSnapshots.values()];
  const snapshotsBefore = await countRows(repo, "marketplaceSnapshots", marketplace);
  let snapshotsAffected = 0;

  for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
    const batch = snapshotRows.slice(i, i + BATCH_SIZE);
    snapshotsAffected += await repo.upsertSnapshots(batch);
  }

  const snapshotsAfter = await countRows(repo, "marketplaceSnapshots", marketplace);
  const newSnapshots = snapshotsAfter - snapshotsBefore;

  // ── Staging ────────────────────────────────────────────────────────────

  // Deduplicate staging: keep last entry per (externalId, finish, language, recordedAt)
  const uniqueStaging = new Map<string, StagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(
      `${row.externalId}|${row.finish}|${row.language}|${row.recordedAt.toISOString()}`,
      row,
    );
  }

  const stagingRows = [...uniqueStaging.values()];
  const stagingBefore = await countRows(repo, "marketplaceStaging", marketplace);
  let stagingAffected = 0;

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE);
    stagingAffected += await repo.upsertStaging(marketplace, batch);
  }

  const stagingAfter = await countRows(repo, "marketplaceStaging", marketplace);
  const newStaging = stagingAfter - stagingBefore;
  const updatedStaging = stagingAffected - newStaging;

  return {
    snapshots: {
      total: snapshotRows.length,
      new: newSnapshots,
      updated: snapshotsAffected - newSnapshots,
      unchanged: snapshotRows.length - snapshotsAffected,
    },
    staging: {
      total: stagingRows.length,
      new: newStaging,
      updated: updatedStaging,
      unchanged: stagingRows.length - newStaging - updatedStaging,
    },
  };
}
