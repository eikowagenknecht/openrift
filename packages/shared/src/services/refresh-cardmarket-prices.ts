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
import {
  fetchJson,
  logUpsertCounts,
  toCents,
  upsertCardmarketPriceData,
} from "./refresh-prices-shared.js";
import type {
  CardmarketSnapshotData,
  CardmarketStagingRow,
  PriceRefreshResult,
} from "./refresh-prices-shared.js";

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

export async function refreshCardmarketPrices(db: Kysely<Database>): Promise<PriceRefreshResult> {
  // ── Load ignored products ────────────────────────────────────────────────

  const ignoredRows = await db
    .selectFrom("cardmarket_ignored_products")
    .select(["external_id", "finish"])
    .execute();
  const ignoredKeys = new Set(ignoredRows.map((r) => `${r.external_id}::${r.finish}`));

  // ── Collected rows ─────────────────────────────────────────────────────────

  const allSnapshots: CardmarketSnapshotData[] = [];
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
  const cmSinglesAll = cmSinglesRes.data.products || [];
  const cmSingles = cmSinglesAll;

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
  if (expansionIds.size > 0) {
    await db
      .insertInto("cardmarket_expansions")
      .values([...expansionIds].map((expId) => ({ expansion_id: expId })))
      .onConflict((oc) =>
        oc.column("expansion_id").doUpdateSet({
          updated_at: sql<Date>`now()`,
        }),
      )
      .execute();
  }

  const dbExpansions = await db
    .selectFrom("cardmarket_expansions")
    .select(["expansion_id", "set_id"])
    .execute();

  const cmMappedCount = dbExpansions.filter((e) => e.set_id).length;
  const cmUnmappedCount = dbExpansions.filter((e) => !e.set_id).length;

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

  const printingByExtIdFinish = new Map<string, string[]>();
  for (const src of existingSources) {
    const key = `${src.external_id}::${src.finish}`;
    let arr = printingByExtIdFinish.get(key);
    if (!arr) {
      arr = [];
      printingByExtIdFinish.set(key, arr);
    }
    arr.push(src.printing_id);
  }

  for (const staging of allStaging) {
    const key = `${staging.external_id}::${staging.finish}`;
    const printingIds = printingByExtIdFinish.get(key);
    if (!printingIds) {
      continue;
    }
    for (const printingId of printingIds) {
      allSnapshots.push({
        printing_id: printingId,
        recorded_at: staging.recorded_at,
        market_cents: staging.market_cents,
        low_cents: staging.low_cents,
        trend_cents: staging.trend_cents,
        avg1_cents: staging.avg1_cents,
        avg7_cents: staging.avg7_cents,
        avg30_cents: staging.avg30_cents,
      });
    }
  }

  if (allSnapshots.length > 0) {
    console.log(
      `Cardmarket: ${allSnapshots.length} snapshots for ${existingSources.length} mapped sources`,
    );
  }

  const ignoredSuffix = ignoredKeys.size > 0 ? `, ${ignoredKeys.size} ignored` : "";
  console.log(
    `Cardmarket fetched: ${dbExpansions.length} expansions (${cmMappedCount} mapped, ${cmUnmappedCount} unmapped), ${cmSingles.length} products, ${cmPriceGuides.length} prices${ignoredSuffix}`,
  );

  // ── Upsert ──────────────────────────────────────────────────────────────────

  const counts = await upsertCardmarketPriceData(db, [], allSnapshots, allStaging);

  logUpsertCounts(counts);

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
