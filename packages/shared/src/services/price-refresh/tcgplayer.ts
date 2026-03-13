/**
 * Refreshes TCGPlayer price data from the TCGCSV API.
 *
 * Fetches groups and products, stages all products for manual admin mapping.
 *
 * Usage: bun scripts/refresh-tcgplayer-prices.ts
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../db/types.js";
import type { Logger } from "../../logger.js";
import { groupIntoMap, toCents } from "../../utils.js";
import { fetchJson } from "./fetch.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { PriceRefreshResult, PriceUpsertConfig } from "./types.js";
import { buildMappedSnapshots, loadIgnoredKeys, upsertPriceData } from "./upsert.js";

// ── Local row types ───────────────────────────────────────────────────────

interface TcgplayerStagingRow {
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
}

// ── Upsert config ─────────────────────────────────────────────────────────

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "tcgplayer",
  priceColumns: ["market_cents", "low_cents", "mid_cents", "high_cents"],
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
  totalProducts: number;
  recordedAt: Date;
}

async function fetchTcgplayerData(): Promise<TcgplayerFetchResult> {
  const { data: groupsData } = await fetchJson<{ results: TcgcsvGroup[] }>(
    `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/groups`,
  );
  const groups = groupsData.results;

  const groupProducts = new Map<number, TcgcsvProduct[]>();
  let totalProducts = 0;
  for (const group of groups) {
    const { data } = await fetchJson<{ results: TcgcsvProduct[] }>(
      `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${group.groupId}/products`,
    );
    const results = data.results || [];
    groupProducts.set(group.groupId, results);
    totalProducts += results.length;
  }

  const groupPrices = new Map<number, TcgcsvPrice[]>();
  let recordedAt: Date | null = null;
  for (const group of groups) {
    const { data: pricesData, lastModified } = await fetchJson<{ results: TcgcsvPrice[] }>(
      `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${group.groupId}/prices`,
    );
    if (!recordedAt) {
      recordedAt = lastModified ?? new Date();
    }
    groupPrices.set(group.groupId, pricesData.results || []);
  }

  return {
    groups,
    groupProducts,
    groupPrices,
    totalProducts,
    recordedAt: recordedAt ?? new Date(),
  };
}

// ── Transform ──────────────────────────────────────────────────────────────

function buildTcgplayerStaging(
  groups: TcgcsvGroup[],
  groupProducts: Map<number, TcgcsvProduct[]>,
  groupPrices: Map<number, TcgcsvPrice[]>,
  recordedAt: Date,
  ignoredKeys: Set<string>,
): TcgplayerStagingRow[] {
  const allStaging: TcgplayerStagingRow[] = [];

  for (const group of groups) {
    const products = groupProducts.get(group.groupId);
    const prices = groupPrices.get(group.groupId);
    if (!products || !prices) {
      continue;
    }

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
          external_id: product.productId,
          group_id: group.groupId,
          product_name: product.cleanName,
          finish,
          recorded_at: recordedAt,
          market_cents: marketCents,
          low_cents: toCents(entry.lowPrice),
          mid_cents: toCents(entry.midPrice),
          high_cents: toCents(entry.highPrice),
        });
      }
    }
  }

  return allStaging;
}

// ── Persist ────────────────────────────────────────────────────────────────

async function upsertTcgplayerGroups(db: Kysely<Database>, groups: TcgcsvGroup[]): Promise<void> {
  if (groups.length === 0) {
    return;
  }
  await db
    .insertInto("marketplace_groups")
    .values(
      groups.map((g) => ({
        marketplace: "tcgplayer" as const,
        group_id: g.groupId,
        name: g.name,
        abbreviation: g.abbreviation,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["marketplace", "group_id"]).doUpdateSet({
        name: sql<string>`excluded.name`,
        abbreviation: sql<string>`excluded.abbreviation`,
        updated_at: sql<Date>`now()`,
      }),
    )
    .execute();
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
  const { groups, groupProducts, groupPrices, totalProducts, recordedAt } =
    await fetchTcgplayerData();

  // Phase 2: Transform
  const allStaging = buildTcgplayerStaging(
    groups,
    groupProducts,
    groupPrices,
    recordedAt,
    ignoredKeys,
  );

  // Phase 3: Persist
  await upsertTcgplayerGroups(db, groups);

  const fetchedCounts = {
    groups: groups.length,
    products: totalProducts,
    prices: allStaging.length,
  };

  logFetchSummary(log, "groups", fetchedCounts, ignoredKeys.size);

  const allSnapshots = await buildMappedSnapshots(db, log, UPSERT_CONFIG, allStaging);
  const counts = await upsertPriceData(db, UPSERT_CONFIG, allSnapshots, allStaging);
  logUpsertCounts(log, counts);

  return { fetched: fetchedCounts, upserted: counts };
}
