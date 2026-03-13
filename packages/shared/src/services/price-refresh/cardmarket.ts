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

import type { Database } from "../../db/types.js";
import type { Logger } from "../../logger.js";
import { toCents } from "../../utils.js";
import { fetchJson } from "./fetch.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { PriceRefreshResult, PriceUpsertConfig } from "./types.js";
import { BATCH_SIZE, buildMappedSnapshots, loadIgnoredKeys, upsertPriceData } from "./upsert.js";

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
  marketplace: "cardmarket",
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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a Cardmarket product page URL from an idProduct.
 * @returns The full Cardmarket product URL.
 */
export function cmProductUrl(externalId: number): string {
  return `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${externalId}`;
}

// ── Fetch ──────────────────────────────────────────────────────────────────

interface CardmarketFetchResult {
  singles: CmProduct[];
  priceGuides: CmPriceGuide[];
  recordedAt: Date;
}

async function fetchCardmarketData(): Promise<CardmarketFetchResult> {
  const [cmPriceGuideRes, cmSinglesRes] = await Promise.all([
    fetchJson<{ createdAt?: string; priceGuides: CmPriceGuide[] }>(
      `${CARDMARKET_BASE}/priceGuide/price_guide_${CARDMARKET_GAME}.json`,
    ),
    fetchJson<{ products: CmProduct[] }>(
      `${CARDMARKET_BASE}/productList/products_singles_${CARDMARKET_GAME}.json`,
    ),
  ]);

  const recordedAt = cmPriceGuideRes.data.createdAt
    ? new Date(cmPriceGuideRes.data.createdAt)
    : (cmPriceGuideRes.lastModified ?? new Date());

  return {
    singles: cmSinglesRes.data.products || [],
    priceGuides: cmPriceGuideRes.data.priceGuides || [],
    recordedAt,
  };
}

// ── Transform ──────────────────────────────────────────────────────────────

function buildCardmarketStaging(
  singles: CmProduct[],
  priceGuides: CmPriceGuide[],
  recordedAt: Date,
  ignoredKeys: Set<string>,
): CardmarketStagingRow[] {
  const cmPriceById = new Map<number, CmPriceGuide>();
  for (const pg of priceGuides) {
    cmPriceById.set(pg.idProduct, pg);
  }

  const allStaging: CardmarketStagingRow[] = [];

  for (const product of singles) {
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
        recorded_at: recordedAt,
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
        recorded_at: recordedAt,
        market_cents: foilMarket,
        low_cents: toCents(pg["low-foil"]),
        trend_cents: toCents(pg["trend-foil"]),
        avg1_cents: toCents(pg["avg1-foil"]),
        avg7_cents: toCents(pg["avg7-foil"]),
        avg30_cents: toCents(pg["avg30-foil"]),
      });
    }
  }

  return allStaging;
}

// ── Persist ────────────────────────────────────────────────────────────────

async function upsertCardmarketExpansions(
  db: Kysely<Database>,
  singles: CmProduct[],
): Promise<{ group_id: number }[]> {
  const expansionIds = new Set<number>();
  for (const product of singles) {
    expansionIds.add(product.idExpansion);
  }
  const expansionValues = [...expansionIds].map((expId) => ({
    marketplace: "cardmarket" as const,
    group_id: expId,
  }));

  const dbExpansions: { group_id: number }[] = [];
  for (let i = 0; i < expansionValues.length; i += BATCH_SIZE) {
    const batch = expansionValues.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insertInto("marketplace_groups")
      .values(batch)
      .onConflict((oc) =>
        oc.columns(["marketplace", "group_id"]).doUpdateSet({
          updated_at: sql<Date>`now()`,
        }),
      )
      .returning(["group_id"])
      .execute();
    dbExpansions.push(...rows);
  }
  return dbExpansions;
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Fetch the latest Cardmarket price guides and singles for Riftbound, upsert
 * expansion metadata, and write snapshots for already-mapped sources. Unmatched
 * products are staged for manual admin mapping.
 * @returns Fetch totals and per-table upsert counts.
 */
export async function refreshCardmarketPrices(
  db: Kysely<Database>,
  log: Logger,
): Promise<PriceRefreshResult> {
  const ignoredKeys = await loadIgnoredKeys(db, "cardmarket");

  // Phase 1: Fetch
  const { singles, priceGuides, recordedAt } = await fetchCardmarketData();

  // Phase 2: Transform
  const allStaging = buildCardmarketStaging(singles, priceGuides, recordedAt, ignoredKeys);

  // Phase 3: Persist
  const dbExpansions = await upsertCardmarketExpansions(db, singles);

  const fetchedCounts = {
    groups: dbExpansions.length,
    products: singles.length,
    prices: priceGuides.length,
  };

  const allSnapshots = await buildMappedSnapshots(db, log, UPSERT_CONFIG, allStaging);
  logFetchSummary(log, "expansions", fetchedCounts, ignoredKeys.size);

  const counts = await upsertPriceData(db, UPSERT_CONFIG, allSnapshots, allStaging);
  logUpsertCounts(log, counts);

  return { fetched: fetchedCounts, upserted: counts };
}
