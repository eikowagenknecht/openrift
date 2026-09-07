import type { Logger } from "@openrift/shared/logger";
import type { PriceRefreshResponse } from "@openrift/shared/types/api/admin";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";

import type { Repos } from "../../deps.js";
import type { Fetch } from "../../io.js";
import type { LoadedIgnoredKeys } from "../../repositories/price-refresh.js";
import { logFetchSummary, logUpsertCounts } from "./log.js";
import type { GroupRow, PriceUpsertConfig, StagingRow } from "./types.js";
import { loadIgnoredKeys, upsertMarketplaceGroups, upsertPriceData } from "./upsert.js";

const UPSERT_CONFIG: PriceUpsertConfig = {
  marketplace: "cardtrader",
};

const CT_API_BASE = "https://api.cardtrader.com/api/v2";
const CT_GAME_ID = 22; // Riftbound
const CT_SINGLES_CATEGORY = 258;
const FETCH_TIMEOUT_MS = 30_000;

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
  /** Number of copies sold together at price_cents; >1 means it's a bundle, not a single. */
  bundle_size?: number;
  /** Seller has paused the shop; listing is visible but not purchasable. */
  on_vacation?: boolean;
  user?: {
    /** Seller participates in CardTrader Zero (hub-eligible listings). */
    can_sell_via_hub?: boolean;
  };
  properties_hash?: {
    /** CardTrader condition string, e.g. "Near Mint", "Lightly Played". */
    condition?: string;
    riftbound_foil?: boolean;
    riftbound_language?: string;
  };
}

interface CtPrice {
  blueprintId: number;
  name: string;
  finish: string;
  language: string;
  /** Lowest asking price across all eligible sellers. */
  minPriceCents: number;
  /** Lowest asking price among CardTrader Zero (hub-eligible) sellers, if any. */
  minZeroPriceCents: number | null;
}

/**
 * Normalize CardTrader's language codes to the form stored on
 * `printings.language`. CardTrader uses `zh-CN` for Simplified Chinese; our
 * printings use Riot's printed code, `SC`. Everything else is upper-cased.
 *
 * `marketplace_products.language` has no FK to `languages`, so an un-normalized
 * code inserts cleanly and then joins to nothing — the prices just disappear
 * from the UI while the refresh reports success. Keep this in step with the
 * `languages` table.
 */
function normalizeCtLanguage(raw: string | undefined): string {
  if (!raw) {
    return WellKnown.language.EN;
  }
  const upper = raw.toUpperCase();
  if (upper === "ZH-CN" || upper === "ZH_CN") {
    return WellKnown.language.SC;
  }
  return upper;
}

/**
 * Fetch JSON from CardTrader API v2 with auth and timeout, unwrapping the
 * `{"array": [...]}` response wrapping some endpoints use.
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
  const allExpansions = await ctFetch<CtExpansion[]>(
    fetchFn,
    `${CT_API_BASE}/expansions`,
    authHeaders,
  );
  const expansions = allExpansions.filter((e) => e.game_id === CT_GAME_ID);
  log.info(`${expansions.length} Riftbound expansions`);

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

  const prices = new Map<string, CtPrice>();
  for (const exp of expansions) {
    const products = await ctFetch<Record<string, CtMarketplaceProduct[]>>(
      fetchFn,
      `${CT_API_BASE}/marketplace/products?expansion_id=${exp.id}`,
      authHeaders,
    );

    for (const [bpId, allListings] of Object.entries(products)) {
      if (allListings.length === 0) {
        continue;
      }
      const id = Number(bpId);

      const eligible = allListings.filter(
        (listing) =>
          (!listing.properties_hash?.condition ||
            listing.properties_hash.condition === "Near Mint") &&
          listing.on_vacation !== true &&
          (listing.bundle_size ?? 1) === 1,
      );
      if (eligible.length === 0) {
        continue;
      }

      const byLangFinish = new Map<string, CtMarketplaceProduct[]>();
      for (const listing of eligible) {
        const lang = normalizeCtLanguage(listing.properties_hash?.riftbound_language);
        const finish =
          listing.properties_hash?.riftbound_foil === true
            ? WellKnown.finish.FOIL
            : WellKnown.finish.NORMAL;
        const key = `${lang}::${finish}`;
        const list = byLangFinish.get(key) ?? [];
        list.push(listing);
        byLangFinish.set(key, list);
      }

      for (const [key, listings] of byLangFinish) {
        const [language, finish] = key.split("::") as [string, string];
        const cheapest = listings.reduce((min, p) => (p.price_cents < min.price_cents ? p : min));
        const zeroListings = listings.filter((listing) => listing.user?.can_sell_via_hub === true);
        const cheapestZero =
          zeroListings.length > 0
            ? zeroListings.reduce((min, p) => (p.price_cents < min.price_cents ? p : min))
            : null;
        prices.set(`${id}::${finish}::${language}`, {
          blueprintId: id,
          name: cheapest.name_en,
          finish,
          language,
          minPriceCents: cheapest.price_cents,
          minZeroPriceCents: cheapestZero?.price_cents ?? null,
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

function buildCardtraderStaging(
  { blueprints, prices, recordedAt }: CardtraderFetchResult,
  ignoredKeys: LoadedIgnoredKeys,
): StagingRow[] {
  const allStaging: StagingRow[] = [];

  for (const bp of blueprints) {
    if (bp.category_id !== CT_SINGLES_CATEGORY) {
      continue;
    }
    if (ignoredKeys.productIds.has(bp.id)) {
      continue;
    }
    for (const price of prices.values()) {
      if (price.blueprintId !== bp.id || price.minPriceCents <= 0) {
        continue;
      }
      if (ignoredKeys.variantKeys.has(`${bp.id}::${price.finish}::${price.language}`)) {
        continue;
      }
      allStaging.push({
        externalId: bp.id,
        groupId: bp.expansion_id,
        productName: bp.name,
        finish: price.finish,
        language: price.language,
        recordedAt,
        marketCents: null,
        lowCents: price.minPriceCents,
        zeroLowCents: price.minZeroPriceCents,
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

/**
 * Build a lookup from "printing identity without language" to a map of
 * `language → printingId`, so that given an English printing we can find its
 * sibling printing in any other language that shares the same card, set,
 * short code, finish, art variant, signed status, and promo type.
 */
function buildSiblingLookup(
  printings: {
    id: string;
    cardId: string;
    setId: string;
    shortCode: string;
    finish: string;
    artVariant: string;
    isSigned: boolean;
    isOvernumbered: boolean;
    language: string;
    markerSlugs: string[];
  }[],
): Map<string, Map<string, string>> {
  const byIdentity = new Map<string, Map<string, string>>();
  for (const p of printings) {
    const slugKey = [...p.markerSlugs].sort().join(",");
    const identity = `${p.cardId}|${p.setId}|${p.shortCode}|${p.finish}|${p.artVariant}|${p.isSigned}|${p.isOvernumbered}|${slugKey}`;
    let byLang = byIdentity.get(identity);
    if (!byLang) {
      byLang = new Map<string, string>();
      byIdentity.set(identity, byLang);
    }
    if (!byLang.has(p.language)) {
      byLang.set(p.language, p.id);
    }
  }
  return byIdentity;
}

/**
 * Auto-match CardTrader blueprints to existing printings by looking up their
 * TCGPlayer and Cardmarket cross-references in `marketplace_product_variants`
 * and then propagating the cardtrader-observed `(finish, language)` tuples
 * through to sibling printings.
 *
 * TCG and Cardmarket only carry English printings, so a direct cross-reference
 * from a cardtrader blueprint lands on an English printing. If the cardtrader
 * blueprint also has prices in Chinese (or any other language), we look up the
 * sibling printing in our catalog — same card, short code, finish, art variant,
 * signed status, and promo type, but with the requested language — and create
 * a variant pointing at the sibling.
 */
async function autoMatchBlueprints(
  repos: Repos,
  blueprints: CtBlueprint[],
  prices: Map<string, CtPrice>,
  log: Logger,
): Promise<number> {
  const existingSources = await repos.priceRefresh.existingSourcesByMarketplaces([
    "tcgplayer",
    "cardmarket",
  ]);

  const allPrintings = await repos.priceRefresh.allPrintingsForPriceMatch();
  const siblingByIdentity = buildSiblingLookup(allPrintings);
  const identityByPrintingId = new Map<string, string>();
  for (const p of allPrintings) {
    const slugKey = [...p.markerSlugs].sort().join(",");
    const identity = `${p.cardId}|${p.setId}|${p.shortCode}|${p.finish}|${p.artVariant}|${p.isSigned}|${p.isOvernumbered}|${slugKey}`;
    identityByPrintingId.set(p.id, identity);
  }

  // Only the `printingId` and `finish` matter for sibling resolution — the
  // cross-ref's own `language` is irrelevant because the target language is
  // picked from the cardtrader blueprint's own prices.
  interface CrossRefEntry {
    printingId: string;
    finish: string;
  }

  const tcgLookup = new Map<number, CrossRefEntry[]>();
  const cmLookup = new Map<number, CrossRefEntry[]>();

  for (const src of existingSources) {
    const entry: CrossRefEntry = {
      printingId: src.printingId,
      finish: src.finish,
    };
    const lookup = src.marketplace === "tcgplayer" ? tcgLookup : cmLookup;
    const list = lookup.get(src.externalId) ?? [];
    list.push(entry);
    lookup.set(src.externalId, list);
  }

  const pricesByBlueprint = Map.groupBy([...prices.values()], (p) => p.blueprintId);

  // Build a per-variant skip set from existing cardtrader variants. Skipping at
  // the (externalId, finish, language) level is what lets a new language (e.g.
  // SC) land on a blueprint whose EN variant already exists — gating on the
  // blueprint alone would leave the new-language row permanently orphaned.
  const existingCtSources = await repos.priceRefresh.existingSourcesByMarketplaces(["cardtrader"]);
  const existingCtVariantKeys = new Set(
    existingCtSources.map((s) => `${s.externalId}::${s.finish}::${s.language ?? ""}`),
  );

  const toInsert: {
    marketplace: Marketplace;
    externalId: number;
    groupId: number;
    productName: string;
    printingId: string;
    finish: string;
    language: string | null;
  }[] = [];

  // Deduplicate (bp.id, finish, language) across iterations in case the same
  // combo is emitted twice via different cross-refs.
  const emitted = new Set<string>();

  for (const bp of blueprints) {
    if (bp.category_id !== CT_SINGLES_CATEGORY) {
      continue;
    }

    let crossRefVariants: CrossRefEntry[] | undefined;
    if (bp.tcg_player_id !== null) {
      crossRefVariants = tcgLookup.get(bp.tcg_player_id);
    }
    if (!crossRefVariants) {
      for (const cmId of bp.card_market_ids) {
        crossRefVariants = cmLookup.get(cmId);
        if (crossRefVariants) {
          break;
        }
      }
    }

    if (!crossRefVariants) {
      continue;
    }

    const identityByFinish = new Map<string, string>();
    for (const variant of crossRefVariants) {
      const identity = identityByPrintingId.get(variant.printingId);
      if (identity && !identityByFinish.has(variant.finish)) {
        identityByFinish.set(variant.finish, identity);
      }
    }

    const observed = pricesByBlueprint.get(bp.id) ?? [];
    for (const price of observed) {
      const identity = identityByFinish.get(price.finish);
      if (!identity) {
        continue;
      }
      const sibling = siblingByIdentity.get(identity)?.get(price.language);
      if (!sibling) {
        continue;
      }
      const emitKey = `${bp.id}::${price.finish}::${price.language}`;
      if (emitted.has(emitKey) || existingCtVariantKeys.has(emitKey)) {
        continue;
      }
      emitted.add(emitKey);
      toInsert.push({
        marketplace: "cardtrader",
        externalId: bp.id,
        groupId: bp.expansion_id,
        productName: bp.name,
        printingId: sibling,
        finish: price.finish,
        language: price.language,
      });
    }
  }

  if (toInsert.length === 0) {
    return 0;
  }

  const BATCH_SIZE = 200;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    await repos.priceRefresh.batchInsertProductVariants(batch);
  }

  log.info(`Auto-matched ${toInsert.length} CardTrader variants to existing printings`);
  return toInsert.length;
}

export async function refreshCardtraderPrices(
  fetchFn: Fetch,
  repos: Repos,
  log: Logger,
  apiToken: string,
): Promise<PriceRefreshResponse> {
  const authHeaders = { Authorization: `Bearer ${apiToken}` };
  const ignoredKeys = await loadIgnoredKeys(repos.priceRefresh, "cardtrader");

  const fetchResult = await fetchCardtraderData(fetchFn, authHeaders, log);
  const { expansions, blueprints, prices } = fetchResult;

  // Groups must be upserted before auto-match: the variant rows need the FK.
  const groupRows = buildCardtraderGroups(expansions);
  await upsertMarketplaceGroups(repos.priceRefresh, "cardtrader", groupRows);

  // Auto-match before transform so newly matched products get snapshots.
  await autoMatchBlueprints(repos, blueprints, prices, log);

  const allStaging = buildCardtraderStaging(fetchResult, ignoredKeys);

  const transformedCounts = {
    groups: groupRows.length,
    products: blueprints.filter((bp) => bp.category_id === CT_SINGLES_CATEGORY).length,
    prices: allStaging.length,
  };

  logFetchSummary(
    log,
    transformedCounts,
    ignoredKeys.productIds.size + ignoredKeys.variantKeys.size,
  );

  const counts = await upsertPriceData(repos.priceRefresh, log, UPSERT_CONFIG, allStaging);
  logUpsertCounts(log, counts);

  await repos.marketplace.refreshLatestPrices();

  return { transformed: transformedCounts, upserted: counts };
}
