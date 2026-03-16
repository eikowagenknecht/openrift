/**
 * Core upsert logic for price refresh workflows.
 *
 * Handles batch upserting of snapshots and staging rows,
 * deduplication, and conflict resolution with IS DISTINCT FROM.
 */

import type { Logger } from "@openrift/shared/logger";
import { groupIntoMap } from "@openrift/shared/utils";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { buildDistinctWhere } from "../../db/helpers.js";
import type { Database } from "../../db/types.js";
import type {
  GroupRow,
  PriceColumns,
  PriceUpsertConfig,
  StagingRow,
  UpsertCounts,
} from "./types.js";

// ── Constants ──────────────────────────────────────────────────────────────

export const BATCH_SIZE = 200;

const PRICE_COL_NAMES = [
  "market_cents",
  "low_cents",
  "mid_cents",
  "high_cents",
  "trend_cents",
  "avg1_cents",
  "avg7_cents",
  "avg30_cents",
] as const;

/** Typed doUpdateSet for all 8 price columns using excluded.* references. */
const PRICE_EXCLUDED_SET = {
  marketCents: sql<number>`excluded.market_cents`,
  lowCents: sql<number | null>`excluded.low_cents`,
  midCents: sql<number | null>`excluded.mid_cents`,
  highCents: sql<number | null>`excluded.high_cents`,
  trendCents: sql<number | null>`excluded.trend_cents`,
  avg1Cents: sql<number | null>`excluded.avg1_cents`,
  avg7Cents: sql<number | null>`excluded.avg7_cents`,
  avg30Cents: sql<number | null>`excluded.avg30_cents`,
};

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
    .selectFrom("marketplaceIgnoredProducts")
    .select(["externalId", "finish"])
    .where("marketplace", "=", marketplace)
    .execute();
  return new Set(rows.map((r) => `${r.externalId}::${r.finish}`));
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
    .insertInto("marketplaceGroups")
    .values(
      groups.map((g) => ({
        marketplace,
        groupId: g.groupId,
        name: g.name ?? null,
        abbreviation: g.abbreviation ?? null,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["marketplace", "groupId"]).doUpdateSet({
        name: sql<string>`coalesce(excluded.name, marketplace_groups.name)`,
        abbreviation: sql<string>`coalesce(excluded.abbreviation, marketplace_groups.abbreviation)`,
        updatedAt: sql<Date>`now()`,
      }),
    )
    .execute();
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
 * Return the row count of a marketplace table, filtered by marketplace.
 * @returns The row count.
 */
async function countRows(
  db: Kysely<Database>,
  table: "marketplaceSnapshots" | "marketplaceStaging",
  marketplace: string,
): Promise<number> {
  if (table === "marketplaceSnapshots") {
    const result = await db
      .selectFrom("marketplaceSnapshots as snap")
      .innerJoin("marketplaceSources as src", "src.id", "snap.sourceId")
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

interface SnapshotInsertRow extends PriceColumns {
  sourceId: string;
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

  // ── Source lookup (single query for both snapshot building & ID mapping) ─

  const dbSources = await db
    .selectFrom("marketplaceSources as src")
    .innerJoin("printings as p", "p.id", "src.printingId")
    .select(["src.id", "src.printingId", "src.externalId", "p.finish"])
    .where("src.marketplace", "=", marketplace)
    .execute();

  const sourceIdLookup = new Map<string, string>();
  for (const row of dbSources) {
    sourceIdLookup.set(row.printingId, row.id);
  }

  // ── Build snapshots from staging + source mappings ─────────────────────

  const printingByExtIdFinish = groupIntoMap(
    dbSources,
    (src) => `${src.externalId}::${src.finish}`,
  );

  const uniqueSnapshots = new Map<string, SnapshotInsertRow>();
  for (const staging of allStaging) {
    const key = `${staging.externalId}::${staging.finish}`;
    const sources = printingByExtIdFinish.get(key);
    if (!sources) {
      continue;
    }
    for (const src of sources) {
      const sourceId = sourceIdLookup.get(src.printingId);
      if (sourceId === undefined) {
        continue;
      }
      const snapKey = `${sourceId}|${staging.recordedAt.toISOString()}`;
      uniqueSnapshots.set(snapKey, {
        sourceId: sourceId,
        recordedAt: staging.recordedAt,
        ...pickPrices(staging),
      });
    }
  }

  if (uniqueSnapshots.size > 0) {
    log.info(`${uniqueSnapshots.size} snapshots for ${dbSources.length} mapped sources`);
  }

  const snapshotRows = [...uniqueSnapshots.values()];
  const snapshotsBefore = await countRows(db, "marketplaceSnapshots", marketplace);
  let snapshotsAffected = 0;

  const snapshotDistinctWhere = buildDistinctWhere("marketplace_snapshots", PRICE_COL_NAMES);

  for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
    const batch = snapshotRows.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insertInto("marketplaceSnapshots")
      .values(batch)
      .onConflict((oc) =>
        oc
          .columns(["sourceId", "recordedAt"])
          .doUpdateSet(PRICE_EXCLUDED_SET)
          .where(snapshotDistinctWhere),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    snapshotsAffected += rows.length;
  }

  const snapshotsAfter = await countRows(db, "marketplaceSnapshots", marketplace);
  const newSnapshots = snapshotsAfter - snapshotsBefore;

  // ── Staging ────────────────────────────────────────────────────────────

  // Deduplicate staging: keep last entry per (externalId, finish, recordedAt)
  const uniqueStaging = new Map<string, StagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(`${row.externalId}|${row.finish}|${row.recordedAt.toISOString()}`, row);
  }

  const stagingRows = [...uniqueStaging.values()];
  const stagingBefore = await countRows(db, "marketplaceStaging", marketplace);
  let stagingAffected = 0;

  const stagingUpdateSet = {
    groupId: sql<number>`excluded.group_id`,
    ...PRICE_EXCLUDED_SET,
    updatedAt: sql<Date>`now()`,
  };
  const stagingDistinctWhere = buildDistinctWhere("marketplace_staging", [
    "group_id",
    ...PRICE_COL_NAMES,
  ]);

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, marketplace }));
    const rows = await db
      .insertInto("marketplaceStaging")
      .values(batch)
      .onConflict((oc) =>
        oc
          .columns(["marketplace", "externalId", "finish", "recordedAt"])
          .doUpdateSet(stagingUpdateSet)
          .where(stagingDistinctWhere),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    stagingAffected += rows.length;
  }

  const stagingAfter = await countRows(db, "marketplaceStaging", marketplace);
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
