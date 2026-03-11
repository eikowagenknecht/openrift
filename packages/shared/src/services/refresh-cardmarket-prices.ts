/**
 * Refreshes Cardmarket price data from the Cardmarket product catalog API.
 *
 * Fetches price guides and singles, matches products to DB printings, and
 * writes cardmarket_sources + cardmarket_snapshots. Unmatched products are
 * staged for manual admin mapping.
 *
 * Usage: bun scripts/refresh-cardmarket-prices.ts
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/types.js";
import type { Logger } from "../logger.js";
import {
  BATCH_SIZE,
  buildSnapshotsFromStaging,
  fetchJson,
  logUpsertCounts,
  toCents,
  upsertPriceData,
} from "./refresh-prices-shared.js";
import type { PriceRefreshResult, PriceUpsertConfig } from "./refresh-prices-shared.js";

// ── Local row types (exported for tests) ──────────────────────────────────

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
  external_id: number;
  group_id: number;
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

// ── Upsert config ─────────────────────────────────────────────────────────

const UPSERT_CONFIG: PriceUpsertConfig = {
  tables: {
    sources: "cardmarket_sources",
    snapshots: "cardmarket_snapshots",
    staging: "cardmarket_staging",
  },
  priceColumns: [
    "market_cents",
    "low_cents",
    "trend_cents",
    "avg1_cents",
    "avg7_cents",
    "avg30_cents",
  ],
};

// ── Constants ──────────────────────────────────────────────────────────────

const CARDMARKET_BASE = "https://downloads.s3.cardmarket.com/productCatalog";
const CARDMARKET_GAME = 22; // Riftbound

// ── External API types ─────────────────────────────────────────────────────

interface CmProduct {
  idProduct: number;
  name: string;
  idExpansion: number;
}

interface CmPriceGuide {
  idProduct: number;
  avg: number;
  low: number;
  trend: number;
  "avg-foil": number;
  "low-foil": number;
  "trend-foil": number;
  avg1: number;
  avg7: number;
  avg30: number;
  "avg1-foil": number;
  "avg7-foil": number;
  "avg30-foil": number;
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function refreshCardmarketPrices(
  db: Kysely<Database>,
  log: Logger,
): Promise<PriceRefreshResult> {
  // ── Load ignored products ────────────────────────────────────────────────

  const ignoredRows = await db
    .selectFrom("cardmarket_ignored_products")
    .select(["external_id", "finish"])
    .execute();
  const ignoredKeys = new Set(ignoredRows.map((r) => `${r.external_id}::${r.finish}`));

  // ── Collected rows ─────────────────────────────────────────────────────────

  const allStaging: CardmarketStagingRow[] = [];

  // ── Fetch Cardmarket data ──────────────────────────────────────────────────

  const [cmPriceGuideRes, cmSinglesRes] = await Promise.all([
    fetchJson<{ createdAt?: string; priceGuides: CmPriceGuide[] }>(
      `${CARDMARKET_BASE}/priceGuide/price_guide_${CARDMARKET_GAME}.json`,
    ),
    fetchJson<{ products: CmProduct[] }>(
      `${CARDMARKET_BASE}/productList/products_singles_${CARDMARKET_GAME}.json`,
    ),
  ]);

  const cmPriceGuides = cmPriceGuideRes.data.priceGuides || [];
  const cmSingles = cmSinglesRes.data.products || [];

  // Use createdAt from response body if available, otherwise Last-Modified header, otherwise now
  const cmRecordedAt = cmPriceGuideRes.data.createdAt
    ? new Date(cmPriceGuideRes.data.createdAt)
    : (cmPriceGuideRes.lastModified ?? new Date());

  // Build price guide lookup: idProduct -> price guide
  const cmPriceById = new Map<number, CmPriceGuide>();
  for (const pg of cmPriceGuides) {
    cmPriceById.set(pg.idProduct, pg);
  }

  // Upsert expansions into cardmarket_expansions
  const expansionIds = new Set<number>();
  for (const product of cmSingles) {
    expansionIds.add(product.idExpansion);
  }
  const expansionValues = [...expansionIds].map((expId) => ({ expansion_id: expId }));
  const dbExpansions: { expansion_id: number; set_id: string | null }[] = [];
  for (let i = 0; i < expansionValues.length; i += BATCH_SIZE) {
    const batch = expansionValues.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insertInto("cardmarket_expansions")
      .values(batch)
      .onConflict((oc) =>
        oc.column("expansion_id").doUpdateSet({
          updated_at: sql<Date>`now()`,
        }),
      )
      .returning(["expansion_id", "set_id"])
      .execute();
    dbExpansions.push(...rows);
  }

  const cmMappedCount = dbExpansions.filter((e) => e.set_id).length;
  const cmUnmappedCount = dbExpansions.length - cmMappedCount;

  // Stage ALL products, regardless of mapping status
  for (const product of cmSingles) {
    const pg = cmPriceById.get(product.idProduct);
    if (!pg) {
      continue;
    }
    const normalMarket = toCents(pg.avg);
    if (normalMarket !== null && !ignoredKeys.has(`${product.idProduct}::normal`)) {
      allStaging.push({
        external_id: product.idProduct,
        group_id: product.idExpansion,
        product_name: product.name,
        finish: "normal",
        recorded_at: cmRecordedAt,
        market_cents: normalMarket,
        low_cents: toCents(pg.low),
        trend_cents: toCents(pg.trend),
        avg1_cents: toCents(pg.avg1),
        avg7_cents: toCents(pg.avg7),
        avg30_cents: toCents(pg.avg30),
      });
    }
    const foilMarket = toCents(pg["avg-foil"]);
    if (foilMarket !== null && !ignoredKeys.has(`${product.idProduct}::foil`)) {
      allStaging.push({
        external_id: product.idProduct,
        group_id: product.idExpansion,
        product_name: product.name,
        finish: "foil",
        recorded_at: cmRecordedAt,
        market_cents: foilMarket,
        low_cents: toCents(pg["low-foil"]),
        trend_cents: toCents(pg["trend-foil"]),
        avg1_cents: toCents(pg["avg1-foil"]),
        avg7_cents: toCents(pg["avg7-foil"]),
        avg30_cents: toCents(pg["avg30-foil"]),
      });
    }
  }

  // Build snapshots for already-mapped products from staging data
  const existingSources = await db
    .selectFrom("cardmarket_sources as cs")
    .innerJoin("printings as p", "p.id", "cs.printing_id")
    .select(["cs.printing_id", "cs.external_id", "p.finish"])
    .execute();

  const allSnapshots = buildSnapshotsFromStaging(
    existingSources,
    allStaging,
    UPSERT_CONFIG.priceColumns,
  );

  if (allSnapshots.length > 0) {
    log.info(`${allSnapshots.length} snapshots for ${existingSources.length} mapped sources`);
  }

  const ignoredSuffix = ignoredKeys.size > 0 ? `, ${ignoredKeys.size} ignored` : "";
  log.info(
    `Fetched: ${dbExpansions.length} expansions (${cmMappedCount} mapped, ${cmUnmappedCount} unmapped), ${cmSingles.length} products, ${cmPriceGuides.length} prices${ignoredSuffix}`,
  );

  // ── Upsert ──────────────────────────────────────────────────────────────────

  const counts = await upsertPriceData(db, UPSERT_CONFIG, [], allSnapshots, allStaging);

  logUpsertCounts(log, counts);

  return {
    fetched: {
      groups: dbExpansions.length,
      mapped: cmMappedCount,
      unmapped: cmUnmappedCount,
      products: cmSingles.length,
      prices: cmPriceGuides.length,
    },
    upserted: counts,
  };
}
