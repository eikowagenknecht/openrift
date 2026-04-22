/**
 * Refreshes TCGPlayer price data from the TCGCSV API.
 *
 * Fetches groups, products, and prices, writes snapshots for already-mapped
 * sources into marketplace_snapshots, and stages all products in
 * marketplace_staging for manual admin mapping.
 *
 * Usage: bun scripts/refresh-tcgplayer-prices.ts
 */

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

// ── Upsert config ─────────────────────────────────────────────────────────

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "tcgplayer",
};

// ── Constants ──────────────────────────────────────────────────────────────

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89; // Riftbound
const TCGCSV_HEADERS = { "User-Agent": "OpenRift/1.0.0" };

// ── External API types ─────────────────────────────────────────────────────

interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation: string;
}

interface TcgcsvProduct {
  productId: number;
  name: string;
  cleanName: string;
  url: string;
  groupId: number;
  extendedData: { name: string; value: string }[];
}

interface TcgcsvPrice {
  productId: number;
  subTypeName: string;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
}

// ── Fetch ──────────────────────────────────────────────────────────────────

interface TcgplayerFetchResult {
  groups: TcgcsvGroup[];
  groupProducts: Map<number, TcgcsvProduct[]>;
  groupPrices: Map<number, TcgcsvPrice[]>;
  groupRecordedAt: Map<number, Date>;
  totalProducts: number;
}

async function fetchTcgplayerData(fetchFn: Fetch): Promise<TcgplayerFetchResult> {
  const { data: groupsData } = await fetchJson<{ results: TcgcsvGroup[] }>(
    fetchFn,
    `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/groups`,
    TCGCSV_HEADERS,
  );
  const groups = groupsData.results;

  const groupProducts = new Map<number, TcgcsvProduct[]>();
  const groupPrices = new Map<number, TcgcsvPrice[]>();
  const groupRecordedAt = new Map<number, Date>();
  let totalProducts = 0;

  await Promise.all(
    groups.map(async (group) => {
      const [productsRes, pricesRes] = await Promise.all([
        fetchJson<{ results: TcgcsvProduct[] }>(
          fetchFn,
          `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${group.groupId}/products`,
          TCGCSV_HEADERS,
        ),
        fetchJson<{ results: TcgcsvPrice[] }>(
          fetchFn,
          `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${group.groupId}/prices`,
          TCGCSV_HEADERS,
        ),
      ]);

      const products = productsRes.data.results || [];
      groupProducts.set(group.groupId, products);
      totalProducts += products.length;

      groupRecordedAt.set(group.groupId, pricesRes.lastModified ?? new Date());
      groupPrices.set(group.groupId, pricesRes.data.results || []);
    }),
  );

  return {
    groups,
    groupProducts,
    groupPrices,
    groupRecordedAt,
    totalProducts,
  };
}

// ── Transform ──────────────────────────────────────────────────────────────

function buildTcgplayerStaging(
  { groups, groupProducts, groupPrices, groupRecordedAt }: TcgplayerFetchResult,
  ignoredKeys: LoadedIgnoredKeys,
): StagingRow[] {
  const allStaging: StagingRow[] = [];

  for (const group of groups) {
    const products = groupProducts.get(group.groupId);
    const prices = groupPrices.get(group.groupId);
    if (!products || !prices) {
      continue;
    }

    const recordedAt = groupRecordedAt.get(group.groupId) ?? new Date();
    const pricesByProductId = Map.groupBy(prices, (p) => p.productId);

    for (const product of products) {
      if (ignoredKeys.productIds.has(product.productId)) {
        continue;
      }
      const priceEntries = pricesByProductId.get(product.productId) || [];
      for (const entry of priceEntries) {
        const marketCents = toCents(entry.marketPrice);
        if (marketCents === null) {
          continue;
        }
        const finish = entry.subTypeName === "Foil" ? "foil" : "normal";
        if (ignoredKeys.variantKeys.has(`${product.productId}::${finish}::EN`)) {
          continue;
        }
        allStaging.push({
          externalId: product.productId,
          groupId: group.groupId,
          productName: product.cleanName,
          finish,
          language: "EN",
          recordedAt,
          marketCents,
          lowCents: toCents(entry.lowPrice),
          zeroLowCents: null,
          midCents: toCents(entry.midPrice),
          highCents: toCents(entry.highPrice),
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        });
      }
    }
  }

  return allStaging;
}

function buildTcgplayerGroups(groups: TcgcsvGroup[]): GroupRow[] {
  return groups.map((g) => ({
    groupId: g.groupId,
    name: g.name,
    abbreviation: g.abbreviation,
  }));
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Fetch the latest TCGPlayer groups, products, and prices from the TCGCSV API,
 * upsert group metadata, and write snapshots for already-mapped sources. All
 * products are staged for manual admin mapping.
 * @returns Fetch totals and per-table upsert counts.
 */
export async function refreshTcgplayerPrices(
  fetchFn: Fetch,
  repos: Repos,
  log: Logger,
): Promise<PriceRefreshResponse> {
  const ignoredKeys = await loadIgnoredKeys(repos.priceRefresh, "tcgplayer");

  // Phase 1: Fetch
  const fetchResult = await fetchTcgplayerData(fetchFn);
  const { groups, totalProducts } = fetchResult;

  // Phase 2: Transform
  const allStaging = buildTcgplayerStaging(fetchResult, ignoredKeys);
  const groupRows = buildTcgplayerGroups(groups);

  const transformedCounts = {
    groups: groupRows.length,
    products: totalProducts,
    prices: allStaging.length,
  };

  logFetchSummary(
    log,
    transformedCounts,
    ignoredKeys.productIds.size + ignoredKeys.variantKeys.size,
  );

  // Phase 3: Persist
  await upsertMarketplaceGroups(repos.priceRefresh, "tcgplayer", groupRows);

  const counts = await upsertPriceData(repos.priceRefresh, log, UPSERT_CONFIG, allStaging);
  logUpsertCounts(log, counts);

  await repos.marketplace.refreshLatestPrices();

  return { transformed: transformedCounts, upserted: counts };
}
