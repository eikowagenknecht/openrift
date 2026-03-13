/**
 * Core upsert logic for price refresh workflows.
 *
 * Handles batch upserting of sources, snapshots, and staging rows,
 * deduplication, and conflict resolution with IS DISTINCT FROM.
 */

import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../db/types.js";
import type { Logger } from "../../logger.js";
import { groupIntoMap } from "../../utils.js";
import type {
  PriceUpsertConfig,
  SnapshotData,
  SourceRow,
  StagingRow,
  UpsertCounts,
} from "./types.js";

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

// ── Snapshot building ──────────────────────────────────────────────────────

/**
 * Build snapshot rows from staging data and existing source mappings.
 * Matches staging rows to printing IDs via (external_id, finish) and copies price columns.
 *
 * @returns Snapshot rows ready for upsert, one per (printing, recorded_at).
 */
export function buildSnapshotsFromStaging(
  existingSources: { printing_id: string; external_id: number; finish: string }[],
  allStaging: StagingRow[],
  priceColumns: string[],
): SnapshotData[] {
  const printingByExtIdFinish = groupIntoMap(
    existingSources,
    (src) => `${src.external_id}::${src.finish}`,
  );
  const snapshots: SnapshotData[] = [];
  for (const staging of allStaging) {
    const key = `${staging.external_id}::${staging.finish}`;
    const sources = printingByExtIdFinish.get(key);
    if (!sources) {
      continue;
    }
    for (const src of sources) {
      const row: Record<string, unknown> = {
        printing_id: src.printing_id,
        recorded_at: staging.recorded_at,
      };
      const stagingRecord = staging as unknown as Record<string, unknown>;
      for (const col of priceColumns) {
        row[col] = stagingRecord[col];
      }
      snapshots.push(row as unknown as SnapshotData);
    }
  }
  return snapshots;
}

/**
 * Load existing source->printing mappings and build snapshot rows from staging data.
 * Logs snapshot count when snapshots are produced.
 * @returns Snapshot rows ready for upsert.
 */
export async function buildMappedSnapshots(
  db: Kysely<Database>,
  log: Logger,
  config: PriceUpsertConfig,
  allStaging: StagingRow[],
): Promise<SnapshotData[]> {
  const existingSources: { printing_id: string; external_id: number; finish: string }[] = await db
    .selectFrom("marketplace_sources as src")
    .innerJoin("printings as p", "p.id", "src.printing_id")
    .select(["src.printing_id", "src.external_id", "p.finish"])
    .where("src.marketplace", "=", config.marketplace)
    .execute();

  const snapshots = buildSnapshotsFromStaging(existingSources, allStaging, config.priceColumns);

  if (snapshots.length > 0) {
    log.info(`${snapshots.length} snapshots for ${existingSources.length} mapped sources`);
  }

  return snapshots;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Return the row count of a marketplace table, filtered by marketplace.
 * @returns The row count.
 */
async function countRows(
  db: Kysely<Database>,
  table: "marketplace_sources" | "marketplace_snapshots" | "marketplace_staging",
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

/**
 * Build a `doUpdateSet` record that maps each column to its `excluded.*` value.
 * raw sql: columns are dynamic at runtime — eb.ref('excluded.col') only works for static columns.
 * @returns A record mapping column names to `excluded.<col>` SQL expressions.
 */
function buildExcludedSet(columns: string[]) {
  // oxlint-disable-next-line typescript/no-explicit-any -- dynamic column mapping for Kysely doUpdateSet
  const set: Record<string, any> = {};
  for (const col of columns) {
    set[col] = sql.raw(`excluded.${col}`);
  }
  return set;
}

/**
 * Build a WHERE clause that checks if any of the given columns changed
 * (using IS DISTINCT FROM to handle NULLs correctly).
 * raw sql: columns are dynamic at runtime — Kysely supports 'is distinct from' operator
 * but only for static column refs; here columns come from a runtime array.
 * @returns A raw SQL boolean expression for the conflict WHERE clause.
 */
function buildDistinctWhere(table: string, columns: string[]) {
  return sql.raw<SqlBool>(
    columns.map((c) => `excluded.${c} IS DISTINCT FROM ${table}.${c}`).join("\n              OR "),
  );
}

// ── Main upsert ────────────────────────────────────────────────────────────

/**
 * Batch-upsert sources, snapshots, and staging rows for a single marketplace
 * (TCGPlayer or Cardmarket). Deduplicates inputs, handles conflict resolution
 * with `IS DISTINCT FROM` to skip no-op updates, and returns per-table counts
 * of new / updated / unchanged rows.
 *
 * @param allSources - Source rows to upsert. Defaults to `[]` (sources are
 *   typically created via admin mapping, not during refresh).
 * @returns Per-table breakdown of new, updated, and unchanged rows.
 */
export async function upsertPriceData(
  db: Kysely<Database>,
  config: PriceUpsertConfig,
  allSnapshots: SnapshotData[],
  allStaging: StagingRow[],
  allSources: SourceRow[] = [],
): Promise<UpsertCounts> {
  const { marketplace } = config;

  // ── Sources ─────────────────────────────────────────────────────────────

  // Deduplicate sources: keep last entry per printing_id
  const uniqueSources = new Map<string, SourceRow>();
  for (const src of allSources) {
    uniqueSources.set(src.printing_id, src);
  }

  const sourceRows = [...uniqueSources.values()];
  const sourcesBefore = await countRows(db, "marketplace_sources", marketplace);
  let sourcesAffected = 0;

  for (let i = 0; i < sourceRows.length; i += BATCH_SIZE) {
    const batch = sourceRows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, marketplace }));
    const rows = await db
      .insertInto("marketplace_sources")
      .values(batch)
      .onConflict((oc) =>
        oc
          .columns(["marketplace", "printing_id"])
          .doUpdateSet({
            group_id: sql<number>`excluded.group_id`,
            updated_at: sql<Date>`now()`,
          })
          .where(buildDistinctWhere("marketplace_sources", ["group_id"])),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    sourcesAffected += rows.length;
  }

  const sourcesAfter = await countRows(db, "marketplace_sources", marketplace);
  const newSources = sourcesAfter - sourcesBefore;

  // ── Source ID lookup ────────────────────────────────────────────────────

  const sourceIdLookup = new Map<string, string>();
  const dbSources = await db
    .selectFrom("marketplace_sources")
    .select(["id", "printing_id"])
    .where("marketplace", "=", marketplace)
    .execute();

  for (const row of dbSources) {
    sourceIdLookup.set(row.printing_id, row.id);
  }

  // ── Snapshots ──────────────────────────────────────────────────────────

  // Deduplicate snapshots: keep last entry per (source_id, recorded_at)
  const uniqueSnapshots = new Map<string, Record<string, unknown>>();

  for (const snap of allSnapshots) {
    const sourceId = sourceIdLookup.get(snap.printing_id);
    if (sourceId === undefined) {
      continue;
    }

    const key = `${sourceId}|${snap.recorded_at.toISOString()}`;
    const row: Record<string, unknown> = {
      source_id: sourceId,
      recorded_at: snap.recorded_at,
    };
    const snapRecord = snap as unknown as Record<string, unknown>;
    for (const col of config.priceColumns) {
      row[col] = snapRecord[col];
    }
    uniqueSnapshots.set(key, row);
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
    sources: {
      total: sourceRows.length,
      new: newSources,
      updated: sourcesAffected - newSources,
      unchanged: sourceRows.length - sourcesAffected,
    },
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
