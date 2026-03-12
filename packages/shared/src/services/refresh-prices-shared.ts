/**
 * Shared helpers for the TCGPlayer and Cardmarket price refresh scripts.
 *
 * Provides reference data loading, staging reconciliation, and batch upsert
 * logic used by both `refresh-tcgplayer-prices.ts` and
 * `refresh-cardmarket-prices.ts`.
 */

import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/types.js";
import type { Logger } from "../logger.js";
import { groupIntoMap, normalizeNameForMatching } from "../utils.js";

// ── Constants ──────────────────────────────────────────────────────────────

export const BATCH_SIZE = 200;

export interface UpsertRowCounts {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
}

export interface UpsertCounts {
  sources: UpsertRowCounts;
  snapshots: UpsertRowCounts;
  staging: UpsertRowCounts;
}

export interface PriceRefreshResult {
  fetched: {
    groups: number;
    products: number;
    prices: number;
  };
  upserted: UpsertCounts;
}

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

  log.info(`Inserted: ${inserted.length > 0 ? inserted.join(", ") : "—"}`);
  log.info(`Updated: ${updated.length > 0 ? updated.join(", ") : "—"}`);
  log.info(`Unchanged: ${unchanged.length > 0 ? unchanged.join(", ") : "—"}`);
}

async function countRows(db: Kysely<Database>, table: keyof Database): Promise<number> {
  const result = await db
    .selectFrom(table)
    .select(db.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

// ── Generic row types ────────────────────────────────────────────────────

export interface SourceRow {
  printing_id: string;
  external_id: number;
  group_id: number;
  product_name: string;
}

export interface SnapshotData {
  printing_id: string;
  recorded_at: Date;
}

export interface StagingRow {
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
}

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

// ── Price upsert config ─────────────────────────────────────────────────

export interface PriceUpsertConfig {
  tables: {
    sources: keyof Database;
    snapshots: keyof Database;
    staging: keyof Database;
  };
  /** Price columns present in both snapshot and staging tables */
  priceColumns: string[];
}

// ── Price refresh helpers ──────────────────────────────────────────────────

/**
 * Load the set of ignored (external_id, finish) keys from a marketplace's ignored-products table.
 * @returns A set of "external_id::finish" strings for filtering.
 */
export async function loadIgnoredKeys(
  db: Kysely<Database>,
  table: keyof Database,
): Promise<Set<string>> {
  // oxlint-disable-next-line typescript/no-explicit-any -- dynamic table name requires type assertion
  const rows: { external_id: number; finish: string }[] = await (db.selectFrom(table as any) as any)
    .select(["external_id", "finish"])
    .execute();
  return new Set(rows.map((r) => `${r.external_id}::${r.finish}`));
}

/**
 * Load existing source→printing mappings and build snapshot rows from staging data.
 * Logs snapshot count when snapshots are produced.
 * @returns Snapshot rows ready for upsert.
 */
export async function buildMappedSnapshots(
  db: Kysely<Database>,
  log: Logger,
  config: PriceUpsertConfig,
  allStaging: StagingRow[],
): Promise<SnapshotData[]> {
  // oxlint-disable-next-line typescript/no-explicit-any -- dynamic table name requires type assertion
  const existingSources: { printing_id: string; external_id: number; finish: string }[] = await (
    db.selectFrom(`${config.tables.sources} as src`) as any
  )
    .innerJoin("printings as p", "p.id", "src.printing_id")
    .select(["src.printing_id", "src.external_id", "p.finish"])
    .execute();

  const snapshots = buildSnapshotsFromStaging(existingSources, allStaging, config.priceColumns);

  if (snapshots.length > 0) {
    log.info(`${snapshots.length} snapshots for ${existingSources.length} mapped sources`);
  }

  return snapshots;
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

// ── Reference data ─────────────────────────────────────────────────────────

export interface ReferenceData {
  sets: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  printings: {
    id: string;
    card_id: string;
    set_id: string;
    source_id: string;
    public_code: string;
    finish: string;
    art_variant: string;
    is_signed: boolean;
  }[];
  setNameById: Map<string, string>;
  cardNameById: Map<string, string>;
  namesBySet: Map<string, Map<string, string>>;
  printingsByCardSetFinish: Map<string, string[]>;
  printingByFullKey: Map<string, string>;
}

export async function loadReferenceData(db: Kysely<Database>): Promise<ReferenceData> {
  const [sets, cards, printings] = await Promise.all([
    db.selectFrom("sets").select(["id", "name"]).execute(),
    db.selectFrom("cards").select(["id", "name"]).execute(),
    db
      .selectFrom("printings")
      .select([
        "id",
        "card_id",
        "set_id",
        "source_id",
        "public_code",
        "finish",
        "art_variant",
        "is_signed",
      ])
      .execute(),
  ]);

  const setNameById = new Map(sets.map((s) => [s.id, s.name]));
  const cardNameById = new Map(cards.map((c) => [c.id, c.name]));

  // namesBySet: set_id -> Map<lowercaseName, card_id>
  const namesBySet = new Map<string, Map<string, string>>();
  for (const p of printings) {
    let setMap = namesBySet.get(p.set_id);
    if (!setMap) {
      setMap = new Map();
      namesBySet.set(p.set_id, setMap);
    }
    const name = cardNameById.get(p.card_id);
    if (name) {
      const key = normalizeNameForMatching(name);
      if (!setMap.has(key)) {
        setMap.set(key, p.card_id);
      }
    }
  }

  // printingsByCardSetFinish: "card_id|set_id|finish" -> printing_id[]
  const printingsByCardSetFinish = new Map<string, string[]>();
  // printingByFullKey: "card_id|set_id|finish|art_variant|is_signed" -> printing_id
  const printingByFullKey = new Map<string, string>();
  for (const p of printings) {
    const key = `${p.card_id}|${p.set_id}|${p.finish}`;
    let arr = printingsByCardSetFinish.get(key);
    if (!arr) {
      arr = [];
      printingsByCardSetFinish.set(key, arr);
    }
    arr.push(p.id);

    const fullKey = `${key}|${p.art_variant}|${p.is_signed}`;
    printingByFullKey.set(fullKey, p.id);
  }

  return {
    sets,
    cards,
    printings,
    setNameById,
    cardNameById,
    namesBySet,
    printingsByCardSetFinish,
    printingByFullKey,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export async function fetchJson<T>(url: string): Promise<{ data: T; lastModified: Date | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  const lm = res.headers.get("last-modified");
  const lastModified = lm ? new Date(lm) : null;
  return { data: await (res.json() as Promise<T>), lastModified };
}

/**
 * Convert a dollar/euro amount to integer cents. Treats 0 as null (no data).
 * @returns The amount in cents, or null if empty/zero.
 */
export function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === 0) {
    return null;
  }
  return Math.round(amount * 100);
}

/**
 * Build a Cardmarket product page URL from an idProduct.
 * @returns The full Cardmarket product URL.
 */
export function cmProductUrl(externalId: number): string {
  return `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${externalId}`;
}

// ── Generic price data upsert ──────────────────────────────────────────────

/**
 * Build a `doUpdateSet` record that maps each column to its `excluded.*` value.
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
 * @returns A raw SQL boolean expression for the conflict WHERE clause.
 */
function buildDistinctWhere(table: string, columns: string[]) {
  return sql.raw<SqlBool>(
    columns.map((c) => `excluded.${c} IS DISTINCT FROM ${table}.${c}`).join("\n              OR "),
  );
}

export async function upsertPriceData(
  db: Kysely<Database>,
  config: PriceUpsertConfig,
  allSources: SourceRow[],
  allSnapshots: SnapshotData[],
  allStaging: StagingRow[],
): Promise<UpsertCounts> {
  // ── Sources ─────────────────────────────────────────────────────────────

  // Deduplicate sources: keep last entry per printing_id
  const uniqueSources = new Map<string, SourceRow>();
  for (const src of allSources) {
    uniqueSources.set(src.printing_id, src);
  }

  const sourceRows = [...uniqueSources.values()];
  const sourcesBefore = await countRows(db, config.tables.sources);
  let sourcesAffected = 0;

  for (let i = 0; i < sourceRows.length; i += BATCH_SIZE) {
    const batch = sourceRows.slice(i, i + BATCH_SIZE);
    // oxlint-disable-next-line typescript/no-explicit-any -- dynamic table name requires type assertion
    const rows = await (db.insertInto(config.tables.sources as any) as any)
      .values(batch)
      .onConflict((oc: any) =>
        oc
          .column("printing_id")
          .doUpdateSet({
            group_id: sql<number>`excluded.group_id`,
            updated_at: sql<Date>`now()`,
          })
          .where(buildDistinctWhere(config.tables.sources, ["group_id"])),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    sourcesAffected += rows.length;
  }

  const sourcesAfter = await countRows(db, config.tables.sources);
  const newSources = sourcesAfter - sourcesBefore;

  // ── Source ID lookup ────────────────────────────────────────────────────

  const sourceIdLookup = new Map<string, number>();
  // oxlint-disable-next-line typescript/no-explicit-any -- dynamic table name requires type assertion
  const dbSources: { id: number; printing_id: string }[] = await (
    db.selectFrom(config.tables.sources as any) as any
  )
    .select(["id", "printing_id"])
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
  const snapshotsBefore = await countRows(db, config.tables.snapshots);
  let snapshotsAffected = 0;

  const snapshotUpdateSet = buildExcludedSet(config.priceColumns);
  const snapshotDistinctWhere = buildDistinctWhere(config.tables.snapshots, config.priceColumns);

  for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
    const batch = snapshotRows.slice(i, i + BATCH_SIZE);
    // oxlint-disable-next-line typescript/no-explicit-any -- dynamic table name requires type assertion
    const rows = await (db.insertInto(config.tables.snapshots as any) as any)
      .values(batch)
      .onConflict((oc: any) =>
        oc
          .columns(["source_id", "recorded_at"])
          .doUpdateSet(snapshotUpdateSet)
          .where(snapshotDistinctWhere),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    snapshotsAffected += rows.length;
  }

  const snapshotsAfter = await countRows(db, config.tables.snapshots);
  const newSnapshots = snapshotsAfter - snapshotsBefore;

  // ── Staging ────────────────────────────────────────────────────────────

  // Deduplicate staging: keep last entry per (external_id, finish, recorded_at)
  const uniqueStaging = new Map<string, StagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(`${row.external_id}|${row.finish}|${row.recorded_at.toISOString()}`, row);
  }

  const stagingRows = [...uniqueStaging.values()];
  const stagingBefore = await countRows(db, config.tables.staging);
  let stagingAffected = 0;

  const stagingUpdateSet = {
    group_id: sql<number>`excluded.group_id`,
    ...buildExcludedSet(config.priceColumns),
    updated_at: sql`now()`,
  };
  const stagingDistinctWhere = buildDistinctWhere(config.tables.staging, [
    "group_id",
    ...config.priceColumns,
  ]);

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE);
    // oxlint-disable-next-line typescript/no-explicit-any -- dynamic table name requires type assertion
    const rows = await (db.insertInto(config.tables.staging as any) as any)
      .values(batch)
      .onConflict((oc: any) =>
        oc
          .columns(["external_id", "finish", "recorded_at"])
          .doUpdateSet(stagingUpdateSet)
          .where(stagingDistinctWhere),
      )
      .returning(sql<number>`1`.as("_"))
      .execute();
    stagingAffected += rows.length;
  }

  const stagingAfter = await countRows(db, config.tables.staging);
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
