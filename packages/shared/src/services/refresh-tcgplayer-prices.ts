/**
 * Refreshes TCGPlayer price data from the TCGCSV API.
 *
 * Fetches groups and products, stages all products for manual admin mapping.
 *
 * Usage: bun scripts/refresh-tcgplayer-prices.ts
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/types.js";
import {
  fetchJson,
  logUpsertCounts,
  toCents,
  upsertTcgplayerPriceData,
} from "./refresh-prices-shared.js";
import type {
  PriceRefreshResult,
  TcgplayerSnapshotData,
  TcgplayerStagingRow,
} from "./refresh-prices-shared.js";

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

// ── Main ───────────────────────────────────────────────────────────────────

export async function refreshTcgplayerPrices(db: Kysely<Database>): Promise<PriceRefreshResult> {
  // ── Load ignored products ────────────────────────────────────────────────

  const ignoredRows = await db
    .selectFrom("tcgplayer_ignored_products")
    .select(["external_id", "finish"])
    .execute();
  const ignoredKeys = new Set(ignoredRows.map((r) => `${r.external_id}::${r.finish}`));

  // ── Collected rows ─────────────────────────────────────────────────────────

  const allStaging: TcgplayerStagingRow[] = [];

  // ── Fetch TCGCSV data ──────────────────────────────────────────────────────

  const { data: groupsData } = await fetchJson<{ results: TcgcsvGroup[] }>(
    `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/groups`,
  );
  const groups = groupsData.results;

  // Upsert all groups into tcgplayer_groups
  if (groups.length > 0) {
    await db
      .insertInto("tcgplayer_groups")
      .values(
        groups.map((g) => ({
          group_id: g.groupId,
          name: g.name,
          abbreviation: g.abbreviation,
        })),
      )
      .onConflict((oc) =>
        oc.column("group_id").doUpdateSet({
          name: sql<string>`excluded.name`,
          abbreviation: sql<string>`excluded.abbreviation`,
          updated_at: sql<Date>`now()`,
        }),
      )
      .execute();
  }

  // Build group -> set mapping from DB (refresh for any newly-upserted groups)
  const groupSetMap = new Map<number, string | null>();
  const allDbGroups = await db
    .selectFrom("tcgplayer_groups")
    .select(["group_id", "name", "set_id"])
    .execute();
  for (const row of allDbGroups) {
    groupSetMap.set(row.group_id, row.set_id);
  }

  const mappedCount = allDbGroups.filter((g) => g.set_id).length;
  const unmappedCount = allDbGroups.filter((g) => !g.set_id).length;

  // Fetch all products per group
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

  // Process all groups: stage everything for manual admin mapping
  // recorded_at from the Last-Modified header of the first prices response.
  // TCGCSV updates daily at ~20:00 UTC; this makes same-day re-runs idempotent.
  let tcgcsvRecordedAt: Date | null = null;

  for (const [groupId] of groupSetMap) {
    const products = groupProducts.get(groupId);
    if (!products) {
      continue;
    }

    // Fetch prices for this group
    const { data: pricesData, lastModified } = await fetchJson<{ results: TcgcsvPrice[] }>(
      `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${groupId}/prices`,
    );
    if (!tcgcsvRecordedAt) {
      tcgcsvRecordedAt = lastModified ?? new Date();
    }
    const pricesByProductId = new Map<number, TcgcsvPrice[]>();
    for (const price of pricesData.results || []) {
      let arr = pricesByProductId.get(price.productId);
      if (!arr) {
        arr = [];
        pricesByProductId.set(price.productId, arr);
      }
      arr.push(price);
    }

    // Stage all products — mapping is done via the admin UI
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
          group_id: groupId,
          product_name: product.cleanName,
          finish,
          recorded_at: tcgcsvRecordedAt,
          market_cents: marketCents,
          low_cents: toCents(entry.lowPrice),
          mid_cents: toCents(entry.midPrice),
          high_cents: toCents(entry.highPrice),
        });
      }
    }
  }

  if (!tcgcsvRecordedAt) {
    tcgcsvRecordedAt = new Date();
  }

  // ── Upsert ──────────────────────────────────────────────────────────────────

  const ignoredSuffix = ignoredKeys.size > 0 ? `, ${ignoredKeys.size} ignored` : "";
  console.log(
    `TCGPlayer fetched: ${groups.length} groups (${mappedCount} mapped, ${unmappedCount} unmapped), ${totalProducts} products, ${allStaging.length} prices${ignoredSuffix}`,
  );

  // Build snapshots for already-mapped products so prices stay current
  const existingSources = await db
    .selectFrom("tcgplayer_sources as ts")
    .innerJoin("printings as p", "p.id", "ts.printing_id")
    .select(["ts.printing_id", "ts.external_id", "p.finish"])
    .execute();

  // Map (external_id, finish) -> printing_ids
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

  const allSnapshots: TcgplayerSnapshotData[] = [];
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
        mid_cents: staging.mid_cents,
        high_cents: staging.high_cents,
      });
    }
  }

  if (allSnapshots.length > 0) {
    console.log(
      `TCGPlayer: ${allSnapshots.length} snapshots for ${existingSources.length} mapped sources`,
    );
  }

  const counts = await upsertTcgplayerPriceData(db, [], allSnapshots, allStaging);

  logUpsertCounts(counts);

  return {
    fetched: {
      groups: groups.length,
      mapped: mappedCount,
      unmapped: unmappedCount,
      products: totalProducts,
      prices: allStaging.length,
    },
    upserted: counts,
  };
}
