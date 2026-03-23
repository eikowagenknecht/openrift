/**
 * Core upsert logic for price refresh workflows.
 *
 * Handles batch upserting of snapshots and staging rows,
 * deduplication, and conflict resolution with IS DISTINCT FROM.
 */

import type { Logger } from "@openrift/shared/logger";
import { groupIntoMap } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";
import { priceRefreshRepo } from "../../repositories/price-refresh.js";
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
 * Load the set of ignored (external_id, finish) keys for a marketplace.
 * @returns A set of "external_id::finish" strings for filtering.
 */
export function loadIgnoredKeys(db: Kysely<Database>, marketplace: string): Promise<Set<string>> {
  return priceRefreshRepo(db).loadIgnoredKeys(marketplace);
}

// ── Group upsert ────────────────────────────────────────────────────────────

/**
 * Upsert marketplace groups (TCGPlayer groups / Cardmarket expansions).
 * Uses COALESCE to preserve existing name/abbreviation when not provided.
 */
export async function upsertMarketplaceGroups(
  db: Kysely<Database>,
  marketplace: string,
  groups: GroupRow[],
): Promise<void> {
  await priceRefreshRepo(db).upsertGroups(marketplace, groups);
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
  repo: ReturnType<typeof priceRefreshRepo>,
  table: "marketplaceSnapshots" | "marketplaceStaging",
  marketplace: string,
): Promise<number> {
  return table === "marketplaceSnapshots"
    ? repo.countSnapshots(marketplace)
    : repo.countStaging(marketplace);
}

// ── Main upsert ────────────────────────────────────────────────────────────

interface SnapshotInsertRow extends PriceColumns {
  productId: string;
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
  db: Kysely<Database>,
  log: Logger,
  config: PriceUpsertConfig,
  allStaging: StagingRow[],
): Promise<UpsertCounts> {
  const { marketplace } = config;
  const repo = priceRefreshRepo(db);

  // ── Source lookup (single query for both snapshot building & ID mapping) ─

  const dbProducts = await repo.sourcesWithFinish(marketplace);

  const productIdLookup = new Map<string, string>();
  for (const row of dbProducts) {
    productIdLookup.set(row.printingId, row.id);
  }

  // ── Build snapshots from staging + source mappings ─────────────────────

  // Match staging rows to mapped sources by exact externalId+finish.
  // Each staging row's price only flows to printings with the same finish.
  const printingByExtIdFinish = groupIntoMap(
    dbProducts,
    (src) => `${src.externalId}::${src.finish}`,
  );

  const uniqueSnapshots = new Map<string, SnapshotInsertRow>();
  for (const staging of allStaging) {
    const sources = printingByExtIdFinish.get(`${staging.externalId}::${staging.finish}`);
    if (!sources) {
      continue;
    }
    for (const src of sources) {
      const productId = productIdLookup.get(src.printingId);
      if (productId === undefined) {
        continue;
      }
      const snapKey = `${productId}|${staging.recordedAt.toISOString()}`;
      uniqueSnapshots.set(snapKey, {
        productId: productId,
        recordedAt: staging.recordedAt,
        ...pickPrices(staging),
      });
    }
  }

  if (uniqueSnapshots.size > 0) {
    log.info(`${uniqueSnapshots.size} snapshots for ${dbProducts.length} mapped products`);
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

  // Deduplicate staging: keep last entry per (externalId, finish, recordedAt)
  const uniqueStaging = new Map<string, StagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(`${row.externalId}|${row.finish}|${row.recordedAt.toISOString()}`, row);
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
