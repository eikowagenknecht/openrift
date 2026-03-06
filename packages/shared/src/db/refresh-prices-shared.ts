/* oxlint-disable no-console -- CLI helper */

/**
 * Shared helpers for the TCGPlayer and Cardmarket price refresh scripts.
 *
 * Provides reference data loading, staging reconciliation, and batch upsert
 * logic used by both `refresh-tcgplayer-prices.ts` and
 * `refresh-cardmarket-prices.ts`.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "./types.js";

// ── Constants ──────────────────────────────────────────────────────────────

export const BATCH_SIZE = 200;

export interface UpsertRowCounts {
  total: number;
  new: number;
  updated: number;
  stale?: number;
}

export interface UpsertCounts {
  sources: UpsertRowCounts;
  snapshots: UpsertRowCounts;
  staging: UpsertRowCounts;
}

export interface PriceRefreshResult {
  fetched: {
    groups: number;
    mapped: number;
    unmapped: number;
    products: number;
    prices: number;
  };
  upserted: UpsertCounts;
}

export function logUpsertCounts(counts: UpsertCounts): void {
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

  console.log(`  Inserted: ${inserted.length > 0 ? inserted.join(", ") : "—"}`);
  console.log(`  Updated:  ${updated.length > 0 ? updated.join(", ") : "—"}`);
  if (counts.staging.stale) {
    console.log(`  Cleaned:  ${counts.staging.stale} stale staging rows removed`);
  }
}

async function countRows(db: Kysely<Database>, table: keyof Database): Promise<number> {
  const result = await db
    .selectFrom(table)
    .select(db.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/**
 * Normalize a card/product name for matching (lowercased, separator-agnostic).
 * @returns The normalized name string.
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replaceAll(" - ", ", ");
}

// ── TCGPlayer row types ────────────────────────────────────────────────────

export interface TcgplayerSourceRow {
  printing_id: string;
  external_id: number | null;
  group_id: number | null;
  product_name: string | null;
  url: string | null;
}

export interface TcgplayerSnapshotData {
  printing_id: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
}

export interface TcgplayerStagingRow {
  set_id: string | null;
  external_id: number | null;
  group_id: number | null;
  product_name: string;
  finish: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
}

// ── Cardmarket row types ───────────────────────────────────────────────────

export interface CardmarketSourceRow {
  printing_id: string;
  external_id: number | null;
  group_id: number | null;
  product_name: string | null;
  url: string | null;
}

export interface CardmarketSnapshotData {
  printing_id: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
}

export interface CardmarketStagingRow {
  set_id: string | null;
  external_id: number | null;
  group_id: number | null;
  product_name: string;
  finish: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
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
      const key = normalizeName(name);
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

// ── Upsert TCGPlayer price data ────────────────────────────────────────────

export async function upsertTcgplayerPriceData(
  db: Kysely<Database>,
  allSources: TcgplayerSourceRow[],
  allSnapshots: TcgplayerSnapshotData[],
  allStaging: TcgplayerStagingRow[],
): Promise<UpsertCounts> {
  // Deduplicate sources: keep last entry per printing_id
  const uniqueSources = new Map<string, TcgplayerSourceRow>();
  for (const src of allSources) {
    uniqueSources.set(src.printing_id, src);
  }

  const sourceRows = [...uniqueSources.values()];
  const sourcesBefore = await countRows(db, "tcgplayer_sources");

  for (let i = 0; i < sourceRows.length; i += BATCH_SIZE) {
    const batch = sourceRows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("tcgplayer_sources")
      .values(batch)
      .onConflict((oc) =>
        oc.column("printing_id").doUpdateSet({
          group_id: sql<number | null>`excluded.group_id`,
          url: sql<string | null>`excluded.url`,
          updated_at: sql<Date>`now()`,
        }),
      )
      .execute();
  }

  const sourcesAfter = await countRows(db, "tcgplayer_sources");
  const newSources = sourcesAfter - sourcesBefore;

  // Query back source IDs
  const sourceIdLookup = new Map<string, number>();
  const dbSources = await db
    .selectFrom("tcgplayer_sources")
    .select(["id", "printing_id"])
    .execute();

  for (const row of dbSources) {
    sourceIdLookup.set(row.printing_id, row.id);
  }

  // Deduplicate snapshots: keep last entry per (source_id, recorded_at)
  const uniqueSnapshots = new Map<
    string,
    {
      source_id: number;
      recorded_at: Date;
      market_cents: number;
      low_cents: number | null;
      mid_cents: number | null;
      high_cents: number | null;
    }
  >();

  for (const snap of allSnapshots) {
    const sourceId = sourceIdLookup.get(snap.printing_id);
    if (sourceId === undefined) {
      continue;
    }

    const key = `${sourceId}|${snap.recorded_at.toISOString()}`;
    uniqueSnapshots.set(key, {
      source_id: sourceId,
      recorded_at: snap.recorded_at,
      market_cents: snap.market_cents,
      low_cents: snap.low_cents,
      mid_cents: snap.mid_cents,
      high_cents: snap.high_cents,
    });
  }

  const snapshotRows = [...uniqueSnapshots.values()];
  const snapshotsBefore = await countRows(db, "tcgplayer_snapshots");

  for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
    const batch = snapshotRows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("tcgplayer_snapshots")
      .values(batch)
      .onConflict((oc) =>
        oc.columns(["source_id", "recorded_at"]).doUpdateSet({
          market_cents: sql<number>`excluded.market_cents`,
          low_cents: sql<number | null>`excluded.low_cents`,
          mid_cents: sql<number | null>`excluded.mid_cents`,
          high_cents: sql<number | null>`excluded.high_cents`,
        }),
      )
      .execute();
  }

  const snapshotsAfter = await countRows(db, "tcgplayer_snapshots");
  const newSnapshots = snapshotsAfter - snapshotsBefore;

  // Deduplicate staging: keep last entry per (external_id, finish, recorded_at)
  const uniqueStaging = new Map<string, TcgplayerStagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(`${row.external_id}|${row.finish}|${row.recorded_at.toISOString()}`, row);
  }

  const stagingRows = [...uniqueStaging.values()];
  const stagingBefore = await countRows(db, "tcgplayer_staging");

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("tcgplayer_staging")
      .values(batch)
      .onConflict((oc) =>
        oc.columns(["external_id", "finish", "recorded_at"]).doUpdateSet({
          group_id: sql<number | null>`excluded.group_id`,
          market_cents: sql<number>`excluded.market_cents`,
          low_cents: sql<number | null>`excluded.low_cents`,
          mid_cents: sql<number | null>`excluded.mid_cents`,
          high_cents: sql<number | null>`excluded.high_cents`,
        }),
      )
      .execute();
  }

  const stagingAfter = await countRows(db, "tcgplayer_staging");
  const newStaging = stagingAfter - stagingBefore;

  return {
    sources: { total: sourceRows.length, new: newSources, updated: sourceRows.length - newSources },
    snapshots: {
      total: snapshotRows.length,
      new: newSnapshots,
      updated: snapshotRows.length - newSnapshots,
    },
    staging: {
      total: stagingRows.length,
      new: newStaging,
      updated: stagingRows.length - newStaging,
    },
  };
}

// ── Upsert Cardmarket price data ───────────────────────────────────────────

export async function upsertCardmarketPriceData(
  db: Kysely<Database>,
  allSources: CardmarketSourceRow[],
  allSnapshots: CardmarketSnapshotData[],
  allStaging: CardmarketStagingRow[],
): Promise<UpsertCounts> {
  // Deduplicate sources: keep last entry per printing_id
  const uniqueSources = new Map<string, CardmarketSourceRow>();
  for (const src of allSources) {
    uniqueSources.set(src.printing_id, src);
  }

  const sourceRows = [...uniqueSources.values()];
  const sourcesBefore = await countRows(db, "cardmarket_sources");

  for (let i = 0; i < sourceRows.length; i += BATCH_SIZE) {
    const batch = sourceRows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("cardmarket_sources")
      .values(batch)
      .onConflict((oc) =>
        oc.column("printing_id").doUpdateSet({
          group_id: sql<number | null>`excluded.group_id`,
          url: sql<string | null>`excluded.url`,
          updated_at: sql<Date>`now()`,
        }),
      )
      .execute();
  }

  const sourcesAfter = await countRows(db, "cardmarket_sources");
  const newSources = sourcesAfter - sourcesBefore;

  // Query back source IDs
  const sourceIdLookup = new Map<string, number>();
  const dbSources = await db
    .selectFrom("cardmarket_sources")
    .select(["id", "printing_id"])
    .execute();

  for (const row of dbSources) {
    sourceIdLookup.set(row.printing_id, row.id);
  }

  // Deduplicate snapshots: keep last entry per (source_id, recorded_at)
  const uniqueSnapshots = new Map<
    string,
    {
      source_id: number;
      recorded_at: Date;
      market_cents: number;
      low_cents: number | null;
      trend_cents: number | null;
      avg1_cents: number | null;
      avg7_cents: number | null;
      avg30_cents: number | null;
    }
  >();

  for (const snap of allSnapshots) {
    const sourceId = sourceIdLookup.get(snap.printing_id);
    if (sourceId === undefined) {
      continue;
    }

    const key = `${sourceId}|${snap.recorded_at.toISOString()}`;
    uniqueSnapshots.set(key, {
      source_id: sourceId,
      recorded_at: snap.recorded_at,
      market_cents: snap.market_cents,
      low_cents: snap.low_cents,
      trend_cents: snap.trend_cents,
      avg1_cents: snap.avg1_cents,
      avg7_cents: snap.avg7_cents,
      avg30_cents: snap.avg30_cents,
    });
  }

  const snapshotRows = [...uniqueSnapshots.values()];
  const snapshotsBefore = await countRows(db, "cardmarket_snapshots");

  for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
    const batch = snapshotRows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("cardmarket_snapshots")
      .values(batch)
      .onConflict((oc) =>
        oc.columns(["source_id", "recorded_at"]).doUpdateSet({
          market_cents: sql<number>`excluded.market_cents`,
          low_cents: sql<number | null>`excluded.low_cents`,
          trend_cents: sql<number | null>`excluded.trend_cents`,
          avg1_cents: sql<number | null>`excluded.avg1_cents`,
          avg7_cents: sql<number | null>`excluded.avg7_cents`,
          avg30_cents: sql<number | null>`excluded.avg30_cents`,
        }),
      )
      .execute();
  }

  const snapshotsAfter = await countRows(db, "cardmarket_snapshots");
  const newSnapshots = snapshotsAfter - snapshotsBefore;

  // Deduplicate staging: keep last entry per (external_id, finish, recorded_at)
  const uniqueStaging = new Map<string, CardmarketStagingRow>();
  for (const row of allStaging) {
    uniqueStaging.set(`${row.external_id}|${row.finish}|${row.recorded_at.toISOString()}`, row);
  }

  const stagingRows = [...uniqueStaging.values()];
  const stagingBefore = await countRows(db, "cardmarket_staging");

  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("cardmarket_staging")
      .values(batch)
      .onConflict((oc) =>
        oc.columns(["external_id", "finish", "recorded_at"]).doUpdateSet({
          group_id: sql<number | null>`excluded.group_id`,
          market_cents: sql<number>`excluded.market_cents`,
          low_cents: sql<number | null>`excluded.low_cents`,
          trend_cents: sql<number | null>`excluded.trend_cents`,
          avg1_cents: sql<number | null>`excluded.avg1_cents`,
          avg7_cents: sql<number | null>`excluded.avg7_cents`,
          avg30_cents: sql<number | null>`excluded.avg30_cents`,
        }),
      )
      .execute();
  }

  const stagingAfter = await countRows(db, "cardmarket_staging");
  const newStaging = stagingAfter - stagingBefore;

  return {
    sources: { total: sourceRows.length, new: newSources, updated: sourceRows.length - newSources },
    snapshots: {
      total: snapshotRows.length,
      new: newSnapshots,
      updated: snapshotRows.length - newSnapshots,
    },
    staging: {
      total: stagingRows.length,
      new: newStaging,
      updated: stagingRows.length - newStaging,
    },
  };
}
