/**
 * Refreshes Cardmarket price data from the Cardmarket product catalog API.
 * Writes snapshots for already-mapped sources and stages the rest for
 * manual admin mapping.
 */

import { WellKnown } from "@openrift/shared";
import type { PriceRefreshResponse } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import { toCents } from "@openrift/shared/utils";

import type { Repos } from "../../deps.js";
import type { Fetch } from "../../io.js";
import type { LoadedIgnoredKeys } from "../../repositories/price-refresh.js";
import { fetchJson } from "./fetch.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { GroupRow, PriceUpsertConfig, StagingRow } from "./types.js";
import { loadIgnoredKeys, upsertMarketplaceGroups, upsertPriceData } from "./upsert.js";

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "cardmarket",
};

const CARDMARKET_BASE = "https://downloads.s3.cardmarket.com/productCatalog";
const CARDMARKET_GAME = 22;

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

interface CardmarketFetchResult {
  singles: CmProduct[];
  priceGuides: CmPriceGuide[];
  recordedAt: Date;
}

async function fetchCardmarketData(fetchFn: Fetch): Promise<CardmarketFetchResult> {
  const [cmPriceGuideRes, cmSinglesRes] = await Promise.all([
    fetchJson<{ createdAt?: string; priceGuides: CmPriceGuide[] }>(
      fetchFn,
      `${CARDMARKET_BASE}/priceGuide/price_guide_${CARDMARKET_GAME}.json`,
    ),
    fetchJson<{ products: CmProduct[] }>(
      fetchFn,
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

function buildCardmarketStaging(
  { singles, priceGuides, recordedAt }: CardmarketFetchResult,
  ignoredKeys: LoadedIgnoredKeys,
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
    if (ignoredKeys.productIds.has(product.idProduct)) {
      continue;
    }
    const normalMarket = toCents(pg.avg);
    const normalLow = toCents(pg.low);
    if (
      (normalMarket !== null || normalLow !== null) &&
      !ignoredKeys.variantKeys.has(`${product.idProduct}::normal::`)
    ) {
      allStaging.push({
        externalId: product.idProduct,
        groupId: product.idExpansion,
        productName: product.name,
        finish: WellKnown.finish.NORMAL,
        language: null,
        recordedAt,
        marketCents: normalMarket,
        lowCents: normalLow,
        zeroLowCents: null,
        midCents: null,
        highCents: null,
        trendCents: toCents(pg.trend),
        avg1Cents: toCents(pg.avg1),
        avg7Cents: toCents(pg.avg7),
        avg30Cents: toCents(pg.avg30),
      });
    }
    const foilMarket = toCents(pg["avg-foil"]);
    const foilLow = toCents(pg["low-foil"]);
    if (
      (foilMarket !== null || foilLow !== null) &&
      !ignoredKeys.variantKeys.has(`${product.idProduct}::foil::`)
    ) {
      allStaging.push({
        externalId: product.idProduct,
        groupId: product.idExpansion,
        productName: product.name,
        finish: WellKnown.finish.FOIL,
        language: null,
        recordedAt,
        marketCents: foilMarket,
        lowCents: foilLow,
        zeroLowCents: null,
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

/**
 * Fetch the latest Cardmarket price guides and singles for Riftbound, upsert
 * expansion metadata, and write snapshots for already-mapped sources. Unmatched
 * products are staged for manual admin mapping.
 */
export async function refreshCardmarketPrices(
  fetchFn: Fetch,
  repos: Repos,
  log: Logger,
): Promise<PriceRefreshResponse> {
  const ignoredKeys = await loadIgnoredKeys(repos.priceRefresh, "cardmarket");

  const fetchResult = await fetchCardmarketData(fetchFn);
  const { singles } = fetchResult;

  const allStaging = buildCardmarketStaging(fetchResult, ignoredKeys);
  const groupRows = buildCardmarketGroups(singles);

  const transformedCounts = {
    groups: groupRows.length,
    products: singles.length,
    prices: allStaging.length,
  };

  logFetchSummary(
    log,
    transformedCounts,
    ignoredKeys.productIds.size + ignoredKeys.variantKeys.size,
  );

  await upsertMarketplaceGroups(repos.priceRefresh, "cardmarket", groupRows);

  const counts = await upsertPriceData(repos.priceRefresh, log, UPSERT_CONFIG, allStaging);
  logUpsertCounts(log, counts);

  await repos.marketplace.refreshLatestPrices();

  return { transformed: transformedCounts, upserted: counts };
}
