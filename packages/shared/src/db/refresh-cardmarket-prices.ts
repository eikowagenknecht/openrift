/* oxlint-disable no-console -- CLI script */

/**
 * Refreshes Cardmarket price data from the Cardmarket product catalog API.
 *
 * Fetches price guides and singles, matches products to DB printings, and
 * writes cardmarket_sources + cardmarket_snapshots. Unmatched products are
 * staged for manual admin mapping.
 *
 * Usage: bun packages/shared/src/db/refresh-cardmarket-prices.ts
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

import {
  fetchJson,
  loadReferenceData,
  logUpsertCounts,
  toCents,
  upsertCardmarketPriceData,
} from "./refresh-prices-shared.js";
import type {
  CardmarketSnapshotData,
  CardmarketSourceRow,
  CardmarketStagingRow,
  PriceRefreshResult,
} from "./refresh-prices-shared.js";
import type { Database } from "./types.js";

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
  const ref = await loadReferenceData(db);

  // ── Collected rows ─────────────────────────────────────────────────────────

  const allSources: CardmarketSourceRow[] = [];
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

  // Group singles by expansion
  const cmByExpansion = new Map<number, CmProduct[]>();
  for (const product of cmSingles) {
    let arr = cmByExpansion.get(product.idExpansion);
    if (!arr) {
      arr = [];
      cmByExpansion.set(product.idExpansion, arr);
    }
    arr.push(product);
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

  // Build expansion -> set mapping from DB
  const expansionSetMap = new Map<number, string>();
  const dbExpansions = await db
    .selectFrom("cardmarket_expansions")
    .select(["expansion_id", "set_id"])
    .execute();

  for (const row of dbExpansions) {
    if (row.set_id) {
      expansionSetMap.set(row.expansion_id, row.set_id);
    }
  }

  const cmMappedCount = dbExpansions.filter((e) => e.set_id).length;
  const cmUnmappedCount = dbExpansions.filter((e) => !e.set_id).length;

  // Pre-load existing Cardmarket cardmarket_sources so we don't overwrite manual mappings
  const existingCmSources = new Map<string, number>(); // printing_id -> external_id
  const cmSourceRows = await db
    .selectFrom("cardmarket_sources")
    .select(["printing_id", "external_id"])
    .where("external_id", "is not", null)
    .execute();

  for (const row of cmSourceRows) {
    if (row.external_id !== null) {
      existingCmSources.set(row.printing_id, row.external_id);
    }
  }

  // Process matched expansions: merge products from all expansions that map to the
  // same set so multi-variant detection works across expansion boundaries.

  const productsBySet = new Map<string, CmProduct[]>();
  for (const [expId, setId] of expansionSetMap) {
    const products = cmByExpansion.get(expId);
    if (!products) {
      continue;
    }
    let merged = productsBySet.get(setId);
    if (!merged) {
      merged = [];
      productsBySet.set(setId, merged);
    }
    merged.push(...products);
  }

  for (const [setId, products] of productsBySet) {
    const setNameMap = ref.namesBySet.get(setId);
    if (!setNameMap) {
      continue;
    }

    // Group CM products by lowercased card name (across all expansions for this set)
    const productsByName = new Map<string, CmProduct[]>();
    for (const product of products) {
      const key = product.name.toLowerCase();
      let arr = productsByName.get(key);
      if (!arr) {
        arr = [];
        productsByName.set(key, arr);
      }
      arr.push(product);
    }

    for (const [nameLower, nameProducts] of productsByName) {
      const cardId = setNameMap.get(nameLower);

      if (!cardId) {
        // No card match -> stage all products in this name group

        for (const product of nameProducts) {
          const pg = cmPriceById.get(product.idProduct);
          if (!pg) {
            continue;
          }
          const normalMarket = toCents(pg.avg);
          if (normalMarket !== null) {
            allStaging.push({
              set_id: setId,
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
          if (foilMarket !== null) {
            allStaging.push({
              set_id: setId,
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
        continue;
      }

      // Card matched — handle already-mapped printings first
      // 1. Write snapshots for printings that already have a CM source mapping
      const mappedExternalIds = new Set<number>();
      for (const finish of ["normal", "foil"] as const) {
        const pids = ref.printingsByCardSetFinish.get(`${cardId}|${setId}|${finish}`) || [];
        for (const pid of pids) {
          const extId = existingCmSources.get(pid);
          if (extId === undefined) {
            continue;
          }
          mappedExternalIds.add(extId);
          const pg = cmPriceById.get(extId);
          if (!pg) {
            continue;
          }
          const marketCents = finish === "foil" ? toCents(pg["avg-foil"]) : toCents(pg.avg);
          if (marketCents === null) {
            continue;
          }

          allSnapshots.push({
            printing_id: pid,
            recorded_at: cmRecordedAt,
            market_cents: marketCents,
            low_cents: finish === "foil" ? toCents(pg["low-foil"]) : toCents(pg.low),
            trend_cents: finish === "foil" ? toCents(pg["trend-foil"]) : toCents(pg.trend),
            avg1_cents: finish === "foil" ? toCents(pg["avg1-foil"]) : toCents(pg.avg1),
            avg7_cents: finish === "foil" ? toCents(pg["avg7-foil"]) : toCents(pg.avg7),
            avg30_cents: finish === "foil" ? toCents(pg["avg30-foil"]) : toCents(pg.avg30),
          });
        }
      }

      // 2. Filter out CM products whose external_ids are already mapped
      const remainingProducts = nameProducts.filter((p) => !mappedExternalIds.has(p.idProduct));

      if (remainingProducts.length > 0) {
        // Multiple products for this card name (or multiple remaining) -> stage all (admin UI will resolve)

        for (const product of remainingProducts) {
          const pg = cmPriceById.get(product.idProduct);
          if (!pg) {
            continue;
          }
          const normalMarket = toCents(pg.avg);
          if (normalMarket !== null) {
            allStaging.push({
              set_id: setId,
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
          if (foilMarket !== null) {
            allStaging.push({
              set_id: setId,
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
      }
      // remainingProducts.length === 0: all products already mapped, nothing to do
    }
  }

  // Stage products from unmapped expansions with set_id = null
  for (const [expId, products] of cmByExpansion) {
    if (expansionSetMap.has(expId)) {
      continue; // already handled above
    }
    for (const product of products) {
      const pg = cmPriceById.get(product.idProduct);
      if (!pg) {
        continue;
      }
      const normalMarket = toCents(pg.avg);
      if (normalMarket !== null) {
        allStaging.push({
          set_id: null,
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
      if (foilMarket !== null) {
        allStaging.push({
          set_id: null,
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
  }

  console.log(
    `Cardmarket fetched: ${dbExpansions.length} expansions (${cmMappedCount} mapped, ${cmUnmappedCount} unmapped), ` +
      `${cmSingles.length} products, ${cmPriceGuides.length} prices`,
  );

  // ── Upsert ──────────────────────────────────────────────────────────────────

  const counts = await upsertCardmarketPriceData(db, allSources, allSnapshots, allStaging);

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

if (import.meta.main) {
  const { createDb } = await import("./connect.js");
  const db = createDb();
  try {
    await refreshCardmarketPrices(db);
  } finally {
    await db.destroy();
  }
}
