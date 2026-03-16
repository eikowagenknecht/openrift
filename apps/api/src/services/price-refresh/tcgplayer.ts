/**
 * Refreshes TCGPlayer price data from the TCGCSV API.
 *
 * Fetches groups, products, and prices, writes snapshots for already-mapped
 * sources into marketplace_snapshots, and stages all products in
 * marketplace_staging for manual admin mapping.
 *
 * Usage: bun scripts/refresh-tcgplayer-prices.ts
 */

import type { Logger } from "@openrift/shared/logger";
import { groupIntoMap, toCents } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";
import { fetchJson } from "./fetch.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { GroupRow, PriceRefreshResult, PriceUpsertConfig, StagingRow } from "./types.js";
import { loadIgnoredKeys, upsertMarketplaceGroups, upsertPriceData } from "./upsert.js";

// ── Upsert config ─────────────────────────────────────────────────────────

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "tcgplayer",
};

// ── Constants ──────────────────────────────────────────────────────────────

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89; // Riftbound

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

async function fetchTcgplayerData(): Promise<TcgplayerFetchResult> {
  const { data: groupsData } = await fetchJson<{ results: TcgcsvGroup[] }>(
    `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/groups`,
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
          `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${group.groupId}/products`,
        ),
        fetchJson<{ results: TcgcsvPrice[] }>(
          `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${group.groupId}/prices`,
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
  ignoredKeys: Set<string>,
): StagingRow[] {
  const allStaging: StagingRow[] = [];

  for (const group of groups) {
    const products = groupProducts.get(group.groupId);
    const prices = groupPrices.get(group.groupId);
    if (!products || !prices) {
      continue;
    }

    const recordedAt = groupRecordedAt.get(group.groupId) ?? new Date();
    const pricesByProductId = groupIntoMap(prices, (p) => p.productId);

    for (const product of products) {
      const priceEntries = pricesByProductId.get(product.productId) || [];
      for (const entry of priceEntries) {
        const marketCents = toCents(entry.marketPrice);
        if (marketCents === null) {
          continue;
        }
        const finish = entry.subTypeName === "Foil" ? "foil" : "normal";
        if (ignoredKeys.has(`${product.productId}::${finish}`)) {
          continue;
        }
        allStaging.push({
          externalId: product.productId,
          groupId: group.groupId,
          productName: product.cleanName,
          finish,
          recordedAt: recordedAt,
          marketCents: marketCents,
          lowCents: toCents(entry.lowPrice),
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
  db: Kysely<Database>,
  log: Logger,
): Promise<PriceRefreshResult> {
  const ignoredKeys = await loadIgnoredKeys(db, "tcgplayer");

  // Phase 1: Fetch
  const fetchResult = await fetchTcgplayerData();
  const { groups, totalProducts } = fetchResult;

  // Phase 2: Transform
  const allStaging = buildTcgplayerStaging(fetchResult, ignoredKeys);
  const groupRows = buildTcgplayerGroups(groups);

  const transformedCounts = {
    groups: groupRows.length,
    products: totalProducts,
    prices: allStaging.length,
  };

  logFetchSummary(log, transformedCounts, ignoredKeys.size);

  // Phase 3: Persist
  await upsertMarketplaceGroups(db, "tcgplayer", groupRows);

  const counts = await upsertPriceData(db, log, UPSERT_CONFIG, allStaging);
  logUpsertCounts(log, counts);

  return { transformed: transformedCounts, upserted: counts };
}
