/**
 * Core upsert logic for price refresh workflows.
 *
 * Handles batch upserting of snapshots and staging rows,
 * deduplication, and conflict resolution with IS DISTINCT FROM.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

import { buildDistinctWhere, buildExcludedSet } from "../../db/helpers.js";
import type { Database } from "../../db/types.js";
import type { Logger } from "../../logger.js";
import { groupIntoMap } from "../../utils.js";
import type { GroupRow, PriceUpsertConfig, StagingRow, UpsertCounts } from "./types.js";

// ── Constants ──────────────────────────────────────────────────────────────

export const BATCH_SIZE = 200;

// ── Ignored keys ───────────────────────────────────────────────────────────

/**
 * Load the set of ignored (external_id, finish) keys for a marketplace.
 * @returns A set of "external_id::finish" strings for filtering.
 */
export async function loadIgnoredKeys(
  db: Kysely<Database>,
  marketplace: string,
): Promise<Set<string>> {
  const rows = await db
    .selectFrom("marketplace_ignored_products")
    .select(["external_id", "finish"])
    .where("marketplace", "=", marketplace)
    .execute();
  return new Set(rows.map((r) => `${r.external_id}::${r.finish}`));
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
  if (groups.length === 0) {
    return;
  }
  await db
    .insertInto("marketplace_groups")
    .values(
      groups.map((g) => ({
        marketplace,
        group_id: g.group_id,
        name: g.name ?? null,
        abbreviation: g.abbreviation ?? null,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["marketplace", "group_id"]).doUpdateSet({
        name: sql<string>`coalesce(excluded.name, marketplace_groups.name)`,
        abbreviation: sql<string>`coalesce(excluded.abbreviation, marketplace_groups.abbreviation)`,
        updated_at: sql<Date>`now()`,
      }),
    )
    .execute();
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Return the row count of a marketplace table, filtered by marketplace.
 * @returns The row count.
 */
async function countRows(
  db: Kysely<Database>,
  table: "marketplace_snapshots" | "marketplace_staging",
  marketplace: string,
): Promise<number> {
  if (table === "marketplace_snapshots") {
    const result = await db
      .selectFrom("marketplace_snapshots as snap")
      .innerJoin("marketplace_sources as src", "src.id", "snap.source_id")
      .select(db.fn.countAll<number>().as("count"))
      .where("src.marketplace", "=", marketplace)
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }
  const result = await db
    .selectFrom(table)
    .select(db.fn.countAll<number>().as("count"))
    .where("marketplace", "=", marketplace)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

// ── Main upsert ────────────────────────────────────────────────────────────

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

  // ── Source lookup (single query for both snapshot building & ID mapping) ─

  const dbSources = await db
    .selectFrom("marketplace_sources as src")
    .innerJoin("printings as p", "p.id", "src.printing_id")
    .select(["src.id", "src.printing_id", "src.external_id", "p.finish"])
    .where("src.marketplace", "=", marketplace)
    .execute();

  const sourceIdLookup = new Map<string, string>();
  for (const row of dbSources) {
    sourceIdLookup.set(row.printing_id, row.id);
  }

  // ── Build snapshots from staging + source mappings ─────────────────────

  const printingByExtIdFinish = groupIntoMap(
    dbSources,
    (src) => `${src.external_id}::${src.finish}`,
  );

  const uniqueSnapshots = new Map<string, Record<string, unknown>>();
  for (const staging of allStaging) {
    const key = `${staging.external_id}::${staging.finish}`;
    const sources = printingByExtIdFinish.get(key);
    if (!sources) {
      continue;
    }
    for (const src of sources) {
      const sourceId = sourceIdLookup.get(src.printing_id);
      if (sourceId === undefined) {
        continue;
      }
      const snapKey = `${sourceId}|${staging.recorded_at.toISOString()}`;
      const row: Record<string, unknown> = {
        source_id: sourceId,
        recorded_at: staging.recorded_at,
      };
      const stagingRecord = staging as unknown as Record<string, unknown>;
      for (const col of config.priceColumns) {
        row[col] = stagingRecord[col];
      }
      uniqueSnapshots.set(snapKey, row);
    }
  }

  if (uniqueSnapshots.size > 0) {
    log.info(`${uniqueSnapshots.size} snapshots for ${dbSources.length} mapped sources`);
  }

  const snapshotRows = [...uniqueSnapshots.values()];
  const snapshotsBefore = await countRows(db, "marketplace_snapshots", marketplace);
  let snapshotsAffected = 0;

  const snapshotUpdateSet = buildExcludedSet(config.priceColumns);
  const snapshotDistinctWhere = buildDistinctWhere("marketplace_snapshots", config.priceColumns);

  for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
    const batch = snapshotRows.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insertInto("marketplace_snapshots")
      .values(batch as never[])
      .onConflict((oc) =>
        oc
          .columns(["source_id", "recorded_at"])
          .doUpdateSet(snapshotUpdateSet as never)
          .where(snapshotDistinctWhere),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    snapshotsAffected += rows.length;
  }

  const snapshotsAfter = await countRows(db, "marketplace_snapshots", marketplace);
  const newSnapshots = snapshotsAfter - snapshotsBefore;

  // ── Staging ────────────────────────────────────────────────────────────

  // Deduplicate staging: keep last entry per (external_id, finish, recorded_at)
  const uniqueStaging = new Map<string, StagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(`${row.external_id}|${row.finish}|${row.recorded_at.toISOString()}`, row);
  }

  const stagingRows = [...uniqueStaging.values()];
  const stagingBefore = await countRows(db, "marketplace_staging", marketplace);
  let stagingAffected = 0;

  const stagingUpdateSet = {
    group_id: sql<number>`excluded.group_id`,
    ...buildExcludedSet(config.priceColumns),
    updated_at: sql`now()`,
  };
  const stagingDistinctWhere = buildDistinctWhere("marketplace_staging", [
    "group_id",
    ...config.priceColumns,
  ]);

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, marketplace }));
    const rows = await db
      .insertInto("marketplace_staging")
      .values(batch as never[])
      .onConflict((oc) =>
        oc
          .columns(["marketplace", "external_id", "finish", "recorded_at"])
          .doUpdateSet(stagingUpdateSet as never)
          .where(stagingDistinctWhere),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    stagingAffected += rows.length;
  }

  const stagingAfter = await countRows(db, "marketplace_staging", marketplace);
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
