/**
 * Refreshes CardTrader price data from the CardTrader API v2.
 *
 * Fetches blueprints per expansion, then marketplace listings per expansion
 * to compute the lowest price per blueprint. Auto-matches blueprints to
 * existing printings via TCGPlayer/Cardmarket cross-references, writes
 * snapshots for already-mapped sources into marketplace_snapshots, and
 * stages unmatched products in marketplace_staging for admin mapping.
 */

import type { PriceRefreshResponse } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";

import type { Database } from "../../db/types.js";
import type { Fetch } from "../../io.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { GroupRow, PriceUpsertConfig, StagingRow } from "./types.js";
import { loadIgnoredKeys, upsertMarketplaceGroups, upsertPriceData } from "./upsert.js";

// ── Upsert config ─────────────────────────────────────────────────────────

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "cardtrader",
};

// ── Constants ──────────────────────────────────────────────────────────────

const CT_API_BASE = "https://api.cardtrader.com/api/v2";
const CT_GAME_ID = 22; // Riftbound
const CT_SINGLES_CATEGORY = 258;
const FETCH_TIMEOUT_MS = 30_000;

// ── External API types ─────────────────────────────────────────────────────

interface CtExpansion {
  id: number;
  game_id: number;
  code: string;
  name: string;
}

interface CtBlueprint {
  id: number;
  name: string;
  category_id: number;
  expansion_id: number;
  card_market_ids: number[];
  tcg_player_id: number | null;
}

interface CtMarketplaceProduct {
  blueprint_id: number;
  name_en: string;
  price_cents: number;
  price_currency: string;
  properties_hash?: {
    riftbound_foil?: boolean;
  };
}

interface CtPrice {
  blueprintId: number;
  name: string;
  finish: string;
  minPriceCents: number;
}

// ── API helpers ───────────────────────────────────────────────────────────

/**
 * Fetch JSON from CardTrader API v2 with auth and timeout.
 * Handles the `{"array": [...]}` response wrapping some endpoints use.
 * @returns The parsed JSON body.
 */
async function ctFetch<T>(
  fetchFn: Fetch,
  url: string,
  authHeaders: Record<string, string>,
): Promise<T> {
  const res = await fetchFn(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { ...authHeaders, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  const json: unknown = await res.json();
  // Some endpoints wrap arrays in {"array": [...]}
  if (
    json !== null &&
    typeof json === "object" &&
    "array" in json &&
    Array.isArray((json as Record<string, unknown>).array)
  ) {
    return (json as Record<string, unknown>).array as T;
  }
  return json as T;
}

// ── Fetch ──────────────────────────────────────────────────────────────────

interface CardtraderFetchResult {
  expansions: CtExpansion[];
  blueprints: CtBlueprint[];
  prices: Map<string, CtPrice>;
  recordedAt: Date;
}

async function fetchCardtraderData(
  fetchFn: Fetch,
  authHeaders: Record<string, string>,
  log: Logger,
): Promise<CardtraderFetchResult> {
  // 1. Fetch all expansions, filter to Riftbound
  const allExpansions = await ctFetch<CtExpansion[]>(
    fetchFn,
    `${CT_API_BASE}/expansions`,
    authHeaders,
  );
  const expansions = allExpansions.filter((e) => e.game_id === CT_GAME_ID);
  log.info(`${expansions.length} Riftbound expansions`);

  // 2. Fetch blueprints per expansion
  const allBlueprints: CtBlueprint[] = [];
  for (const exp of expansions) {
    const blueprints = await ctFetch<CtBlueprint[]>(
      fetchFn,
      `${CT_API_BASE}/blueprints/export?expansion_id=${exp.id}`,
      authHeaders,
    );
    allBlueprints.push(...blueprints);
  }
  log.info(`${allBlueprints.length} blueprints total`);

  // 3. Fetch marketplace listings per expansion, extract lowest price per blueprint+finish
  const prices = new Map<string, CtPrice>();
  for (const exp of expansions) {
    const products = await ctFetch<Record<string, CtMarketplaceProduct[]>>(
      fetchFn,
      `${CT_API_BASE}/marketplace/products?expansion_id=${exp.id}`,
      authHeaders,
    );

    for (const [bpId, listings] of Object.entries(products)) {
      if (listings.length === 0) {
        continue;
      }
      const id = Number(bpId);
      const normalListings = listings.filter((l) => !l.properties_hash?.riftbound_foil);
      const foilListings = listings.filter((l) => l.properties_hash?.riftbound_foil === true);

      if (normalListings.length > 0) {
        const cheapest = normalListings.reduce((min, p) =>
          p.price_cents < min.price_cents ? p : min,
        );
        prices.set(`${id}::normal`, {
          blueprintId: id,
          name: cheapest.name_en,
          finish: "normal",
          minPriceCents: cheapest.price_cents,
        });
      }
      if (foilListings.length > 0) {
        const cheapest = foilListings.reduce((min, p) =>
          p.price_cents < min.price_cents ? p : min,
        );
        prices.set(`${id}::foil`, {
          blueprintId: id,
          name: cheapest.name_en,
          finish: "foil",
          minPriceCents: cheapest.price_cents,
        });
      }
    }
  }
  log.info(`${prices.size} blueprint+finish prices`);

  return {
    expansions,
    blueprints: allBlueprints,
    prices,
    recordedAt: new Date(new Date().toISOString().slice(0, 10)),
  };
}

// ── Transform ──────────────────────────────────────────────────────────────

const FINISHES = ["normal", "foil"] as const;

function buildCardtraderStaging(
  { blueprints, prices, recordedAt }: CardtraderFetchResult,
  ignoredKeys: Set<string>,
): StagingRow[] {
  const allStaging: StagingRow[] = [];

  for (const bp of blueprints) {
    if (bp.category_id !== CT_SINGLES_CATEGORY) {
      continue;
    }
    for (const finish of FINISHES) {
      const price = prices.get(`${bp.id}::${finish}`);
      if (!price || price.minPriceCents <= 0) {
        continue;
      }
      if (ignoredKeys.has(`${bp.id}::${finish}`)) {
        continue;
      }
      allStaging.push({
        externalId: bp.id,
        groupId: bp.expansion_id,
        productName: bp.name,
        finish,
        recordedAt,
        marketCents: price.minPriceCents,
        lowCents: price.minPriceCents,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      });
    }
  }

  return allStaging;
}

function buildCardtraderGroups(expansions: CtExpansion[]): GroupRow[] {
  return expansions.map((e) => ({
    groupId: e.id,
    name: e.name,
    abbreviation: e.code,
  }));
}

// ── Auto-matching ──────────────────────────────────────────────────────────

/**
 * Auto-match CardTrader blueprints to existing printings by looking up
 * their TCGPlayer and Cardmarket cross-references in marketplace_products.
 * Inserts new marketplace_products rows with ON CONFLICT DO NOTHING.
 *
 * @returns The number of newly auto-matched products.
 */
async function autoMatchBlueprints(
  db: Kysely<Database>,
  blueprints: CtBlueprint[],
  log: Logger,
): Promise<number> {
  // Load existing marketplace_products for tcgplayer and cardmarket
  const existingSources = await db
    .selectFrom("marketplaceProducts")
    .select(["marketplace", "externalId", "printingId", "groupId", "productName"])
    .where("marketplace", "in", ["tcgplayer", "cardmarket"])
    .execute();

  const tcgLookup = new Map<number, { printingId: string; groupId: number; productName: string }>();
  const cmLookup = new Map<number, { printingId: string; groupId: number; productName: string }>();

  for (const src of existingSources) {
    const entry = {
      printingId: src.printingId,
      groupId: src.groupId,
      productName: src.productName,
    };
    if (src.marketplace === "tcgplayer") {
      tcgLookup.set(src.externalId, entry);
    } else {
      cmLookup.set(src.externalId, entry);
    }
  }

  // Load existing cardtrader products to avoid re-inserting
  const existingCt = await db
    .selectFrom("marketplaceProducts")
    .select(["externalId"])
    .where("marketplace", "=", "cardtrader")
    .execute();
  const existingCtIds = new Set(existingCt.map((r) => r.externalId));

  // Match blueprints to printings via cross-references
  const toInsert: {
    marketplace: string;
    externalId: number;
    groupId: number;
    productName: string;
    printingId: string;
  }[] = [];

  for (const bp of blueprints) {
    if (bp.category_id !== CT_SINGLES_CATEGORY) {
      continue;
    }
    if (existingCtIds.has(bp.id)) {
      continue;
    }

    // Try TCGPlayer cross-reference first
    let match: { printingId: string } | undefined;
    if (bp.tcg_player_id !== null) {
      match = tcgLookup.get(bp.tcg_player_id);
    }

    // Fall back to Cardmarket cross-references
    if (!match) {
      for (const cmId of bp.card_market_ids) {
        match = cmLookup.get(cmId);
        if (match) {
          break;
        }
      }
    }

    if (match) {
      toInsert.push({
        marketplace: "cardtrader",
        externalId: bp.id,
        groupId: bp.expansion_id,
        productName: bp.name,
        printingId: match.printingId,
      });
    }
  }

  if (toInsert.length === 0) {
    return 0;
  }

  // Batch insert with ON CONFLICT DO NOTHING
  const BATCH_SIZE = 200;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("marketplaceProducts")
      .values(batch)
      .onConflict((oc) => oc.columns(["marketplace", "printingId"]).doNothing())
      .execute();
  }

  log.info(`Auto-matched ${toInsert.length} CardTrader blueprints to existing printings`);
  return toInsert.length;
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Fetch the latest CardTrader blueprint prices for Riftbound, auto-match
 * blueprints to existing printings via cross-references, upsert expansion
 * metadata, and write snapshots. Unmatched products are staged for manual
 * admin mapping.
 * @returns Fetch totals and per-table upsert counts.
 */
export async function refreshCardtraderPrices(
  fetchFn: Fetch,
  db: Kysely<Database>,
  log: Logger,
  apiToken: string,
): Promise<PriceRefreshResponse> {
  const authHeaders = { Authorization: `Bearer ${apiToken}` };
  const ignoredKeys = await loadIgnoredKeys(db, "cardtrader");

  // Phase 1: Fetch
  const fetchResult = await fetchCardtraderData(fetchFn, authHeaders, log);
  const { expansions, blueprints } = fetchResult;

  // Phase 2: Upsert groups first (auto-match needs the FK)
  const groupRows = buildCardtraderGroups(expansions);
  await upsertMarketplaceGroups(db, "cardtrader", groupRows);

  // Phase 3: Auto-match (before transform so new products get snapshots)
  await autoMatchBlueprints(db, blueprints, log);

  // Phase 4: Transform
  const allStaging = buildCardtraderStaging(fetchResult, ignoredKeys);

  const transformedCounts = {
    groups: groupRows.length,
    products: blueprints.filter((bp) => bp.category_id === CT_SINGLES_CATEGORY).length,
    prices: allStaging.length,
  };

  logFetchSummary(log, transformedCounts, ignoredKeys.size);

  // Phase 5: Persist snapshots + staging
  const counts = await upsertPriceData(db, log, UPSERT_CONFIG, allStaging);
  logUpsertCounts(log, counts);

  return { transformed: transformedCounts, upserted: counts };
}
