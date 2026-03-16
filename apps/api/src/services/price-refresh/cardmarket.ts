/**
 * Refreshes Cardmarket price data from the Cardmarket product catalog API.
 *
 * Fetches price guides and singles, writes snapshots for already-mapped
 * sources into marketplace_snapshots, and stages all products in
 * marketplace_staging for manual admin mapping.
 *
 * Usage: bun scripts/refresh-cardmarket-prices.ts
 */

import type { Logger } from "@openrift/shared/logger";
import { toCents } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";
import { fetchJson } from "./fetch.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { GroupRow, PriceRefreshResult, PriceUpsertConfig, StagingRow } from "./types.js";
import { loadIgnoredKeys, upsertMarketplaceGroups, upsertPriceData } from "./upsert.js";

// ── Upsert config ─────────────────────────────────────────────────────────

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "cardmarket",
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
  { singles, priceGuides, recordedAt }: CardmarketFetchResult,
  ignoredKeys: Set<string>,
): StagingRow[] {
  const cmPriceById = new Map<number, CmPriceGuide>();
  for (const pg of priceGuides) {
    cmPriceById.set(pg.idProduct, pg);
  }

  const allStaging: StagingRow[] = [];

  for (const product of singles) {
    const pg = cmPriceById.get(product.idProduct);
    if (!pg) {
      continue;
    }
    const normalMarket = toCents(pg.avg);
    if (normalMarket !== null && !ignoredKeys.has(`${product.idProduct}::normal`)) {
      allStaging.push({
        externalId: product.idProduct,
        groupId: product.idExpansion,
        productName: product.name,
        finish: "normal",
        recordedAt: recordedAt,
        marketCents: normalMarket,
        lowCents: toCents(pg.low),
        midCents: null,
        highCents: null,
        trendCents: toCents(pg.trend),
        avg1Cents: toCents(pg.avg1),
        avg7Cents: toCents(pg.avg7),
        avg30Cents: toCents(pg.avg30),
      });
    }
    const foilMarket = toCents(pg["avg-foil"]);
    if (foilMarket !== null && !ignoredKeys.has(`${product.idProduct}::foil`)) {
      allStaging.push({
        externalId: product.idProduct,
        groupId: product.idExpansion,
        productName: product.name,
        finish: "foil",
        recordedAt: recordedAt,
        marketCents: foilMarket,
        lowCents: toCents(pg["low-foil"]),
        midCents: null,
        highCents: null,
        trendCents: toCents(pg["trend-foil"]),
        avg1Cents: toCents(pg["avg1-foil"]),
        avg7Cents: toCents(pg["avg7-foil"]),
        avg30Cents: toCents(pg["avg30-foil"]),
      });
    }
  }

  return allStaging;
}

function buildCardmarketGroups(singles: CmProduct[]): GroupRow[] {
  return [...new Set(singles.map((p) => p.idExpansion))].map((id) => ({
    groupId: id,
  }));
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
  const fetchResult = await fetchCardmarketData();
  const { singles } = fetchResult;

  // Phase 2: Transform
  const allStaging = buildCardmarketStaging(fetchResult, ignoredKeys);
  const groupRows = buildCardmarketGroups(singles);

  const transformedCounts = {
    groups: groupRows.length,
    products: singles.length,
    prices: allStaging.length,
  };

  logFetchSummary(log, transformedCounts, ignoredKeys.size);

  // Phase 3: Persist
  await upsertMarketplaceGroups(db, "cardmarket", groupRows);

  const counts = await upsertPriceData(db, log, UPSERT_CONFIG, allStaging);
  logUpsertCounts(log, counts);

  return { transformed: transformedCounts, upserted: counts };
}
