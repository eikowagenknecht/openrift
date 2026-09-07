import { initContract } from "@openrift/shared/contracts/init";
import { pricesContract } from "@openrift/shared/contracts/prices";
import type { AvailableFilters, FilterCounts } from "@openrift/shared/filters";
import { computeFilterCounts, filterCards, getAvailableFilters } from "@openrift/shared/filters";
import { priceLookupFromMap } from "@openrift/shared/price-lookup";
import type { CatalogResponse } from "@openrift/shared/types/api/catalog";
import type { InitResponse } from "@openrift/shared/types/api/init";
import type { PricesResponse } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import type {
  ArtVariant,
  CardSize,
  CardType,
  Domain,
  EnumOrders,
  Finish,
  Rarity,
  SuperType,
} from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { PresenceDimension, PresenceState } from "@openrift/shared/types/search";
import { DEFAULT_SEARCH_SCOPE, EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";
import { createServerFn } from "@tanstack/react-start";

import { enrichCatalog, readCatalogFromServerCache } from "@/lib/catalog-query";
import type { FilterSearch } from "@/lib/search-schemas";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

// Matches the fallback in <CardBrowser> for users with no `marketplaceOrder`
// preference.
const SSR_MARKETPLACE: Marketplace = "cardtrader";

// Matches PREFERENCE_DEFAULTS from shared/types/api/preferences.ts.
const SSR_DEFAULT_VIEW = "cards";

function readPricesFromServerCache(): Promise<PricesResponse> {
  return serverCache.query({
    queryKey: ["server-cache", "prices"],
    queryFn: () => apiOrpcClient(pricesContract).prices(),
  });
}

function readInitFromServerCache(): Promise<InitResponse> {
  return serverCache.query({
    queryKey: ["server-cache", "init"],
    queryFn: () => apiOrpcClient(initContract).get(),
  });
}

function ordersFromInit(init: InitResponse): EnumOrders {
  const slugs = (rows: { slug: string; sortOrder: number }[]): string[] =>
    rows.toSorted((a, b) => a.sortOrder - b.sortOrder).map((row) => row.slug);
  return {
    finishes: slugs(init.enums.finishes),
    rarities: slugs(init.enums.rarities),
    domains: slugs(init.enums.domains),
    cardTypes: slugs(init.enums.cardTypes),
    superTypes: slugs(init.enums.superTypes),
    artVariants: slugs(init.enums.artVariants),
    cardSizes: slugs(init.enums.cardSizes),
  };
}

export function extractCatalogFacets(
  catalog: CatalogResponse,
  prices: PricesResponse,
  orders: EnumOrders,
): AvailableFilters {
  const { allPrintings, sets } = enrichCatalog(catalog);
  const lookup = priceLookupFromMap(prices.prices);
  const getPrice = (printing: Printing) => lookup.get(printing.id, SSR_MARKETPLACE);
  return getAvailableFilters(allPrintings, { orders, sets, getPrice });
}

/** Matches the derivation in `useCardData` so the SSR shell renders the same language section the live grid does. */
export function extractAvailableLanguages(catalog: CatalogResponse): string[] {
  const { allPrintings } = enrichCatalog(catalog);
  return [...new Set(allPrintings.map((printing) => printing.language))];
}

/** Powers `setDisplayLabel` in chrome components without shipping the full GroupInfo[] over the wire. */
export function extractSetLabels(catalog: CatalogResponse): Record<string, string> {
  return Object.fromEntries(catalog.sets.map((set) => [set.slug, set.name]));
}

/** Mirrors the inline presence construction in `useFilterValues` for the server path. */
function presenceFromSearch(
  search: FilterSearch,
): Partial<Record<PresenceDimension, PresenceState>> {
  const presence: Partial<Record<PresenceDimension, PresenceState>> = {};
  if (search.markersPresence) {
    presence.markers = search.markersPresence;
  }
  if (search.superTypesPresence) {
    presence.superTypes = search.superTypesPresence;
  }
  if (search.customTagsPresence) {
    presence.customTags = search.customTagsPresence;
  }
  if (search.channelsPresence) {
    presence.distributionChannels = search.channelsPresence;
  }
  if (search.keywordsPresence) {
    presence.keywords = search.keywordsPresence;
  }
  if (search.tagsPresence) {
    presence.tags = search.tagsPresence;
  }
  return presence;
}

/** Mirrors `useFilterValues`; the server has no search scope store, so it uses the default scope. */
export function searchToFilters(search: FilterSearch) {
  return {
    ...EMPTY_CARD_FILTERS,
    search: search.search ?? "",
    searchScope: [...DEFAULT_SEARCH_SCOPE],
    sets: search.sets ?? [],
    languages: search.languages ?? [],
    rarities: (search.rarities ?? []) as Rarity[],
    types: (search.types ?? []) as CardType[],
    superTypes: (search.superTypes ?? []) as SuperType[],
    domains: (search.domains ?? []) as Domain[],
    artVariants: (search.artVariants ?? []) as ArtVariant[],
    finishes: (search.finishes ?? []) as Finish[],
    cardSizes: (search.cardSizes ?? []) as CardSize[],
    isSigned: search.signed ?? null,
    isOvernumbered: search.overnumbered ?? null,
    presence: presenceFromSearch(search),
    markerSlugs: search.markers ?? [],
    distributionChannelSlugs: search.channels ?? [],
    keywords: search.keywords ?? [],
    tags: search.tags ?? [],
    // The public SSR catalog carries no per-user custom-tag assignments, so
    // neither this nor `customTagsEx` can match until `useCardData` recomputes after hydration.
    customTagSlugs: [] as string[],
    isBanned: search.banned ?? null,
    hasErrata: search.errata ?? null,
    setsExclude: search.setsEx ?? [],
    languagesExclude: search.languagesEx ?? [],
    raritiesExclude: (search.raritiesEx ?? []) as Rarity[],
    typesExclude: (search.typesEx ?? []) as CardType[],
    superTypesExclude: (search.superTypesEx ?? []) as SuperType[],
    domainsExclude: (search.domainsEx ?? []) as Domain[],
    artVariantsExclude: (search.artVariantsEx ?? []) as ArtVariant[],
    finishesExclude: (search.finishesEx ?? []) as Finish[],
    markerSlugsExclude: search.markersEx ?? [],
    distributionChannelSlugsExclude: search.channelsEx ?? [],
    customTagSlugsExclude: search.customTagsEx ?? [],
    keywordsExclude: search.keywordsEx ?? [],
    tagsExclude: search.tagsEx ?? [],
    isStandard: search.standard ?? null,
    energy: { min: search.energyMin ?? null, max: search.energyMax ?? null },
    might: { min: search.mightMin ?? null, max: search.mightMax ?? null },
    power: { min: search.powerMin ?? null, max: search.powerMax ?? null },
    price: { min: search.priceMin ?? null, max: search.priceMax ?? null },
  };
}

export interface CardCounts {
  totalCards: number;
  filteredCount: number;
}

/**
 * Skips the owned/incomplete post-processing because the SSR pass has no
 * per-user collection data; the count flips on hydration for `?owned=...`.
 */
export function extractCardCounts(
  catalog: CatalogResponse,
  prices: PricesResponse,
  search: FilterSearch,
): CardCounts {
  const { allPrintings } = enrichCatalog(catalog);
  const view = search.view ?? SSR_DEFAULT_VIEW;
  const lookup = priceLookupFromMap(prices.prices);
  const getPrice = (printing: Printing) => lookup.get(printing.id, SSR_MARKETPLACE);
  const filters = searchToFilters(search);
  const filtered = filterCards(allPrintings, filters, { getPrice });

  const totalCards =
    view === "cards"
      ? new Set(allPrintings.map((printing) => printing.cardId)).size
      : allPrintings.length;
  const filteredCount =
    view === "cards" ? new Set(filtered.map((printing) => printing.cardId)).size : filtered.length;

  return { totalCards, filteredCount };
}

// The server-fn boundary can't serialize `AvailableFilters`'s
// `ReadonlySet<string>` (`supplementalSets`); rehydrate via `fromWireFacets`.
export type AvailableFiltersWire = Omit<AvailableFilters, "supplementalSets"> & {
  supplementalSets: string[];
};

function toWireFacets(facets: AvailableFilters): AvailableFiltersWire {
  return { ...facets, supplementalSets: [...facets.supplementalSets] };
}

export function fromWireFacets(wire: AvailableFiltersWire): AvailableFilters {
  return { ...wire, supplementalSets: new Set(wire.supplementalSets) };
}

// `Map<string, number>` doesn't serialize across the server-fn boundary;
// rehydrate via `fromWireFilterCounts`.
type CountMapWire = Record<string, number>;

export interface FilterCountsWire {
  sets: CountMapWire;
  languages: CountMapWire;
  domains: CountMapWire;
  types: CountMapWire;
  superTypes: CountMapWire;
  rarities: CountMapWire;
  artVariants: CountMapWire;
  finishes: CountMapWire;
  cardSizes: CountMapWire;
  markers: CountMapWire;
  channels: CountMapWire;
  keywords: CountMapWire;
  tags: CountMapWire;
  flags: {
    signed: number;
    overnumbered: number;
    banned: number;
    errata: number;
    standard: number;
    // `owned` is omitted on purpose: it requires the user's collection
    // counts, which the SSR layer doesn't have.
  };
  presence: FilterCounts["presence"];
  ranges: FilterCounts["ranges"];
}

function toWireFilterCounts(counts: FilterCounts): FilterCountsWire {
  return {
    sets: Object.fromEntries(counts.sets),
    languages: Object.fromEntries(counts.languages),
    domains: Object.fromEntries(counts.domains),
    types: Object.fromEntries(counts.types),
    superTypes: Object.fromEntries(counts.superTypes),
    rarities: Object.fromEntries(counts.rarities),
    artVariants: Object.fromEntries(counts.artVariants),
    finishes: Object.fromEntries(counts.finishes),
    cardSizes: Object.fromEntries(counts.cardSizes),
    markers: Object.fromEntries(counts.markers),
    channels: Object.fromEntries(counts.channels),
    keywords: Object.fromEntries(counts.keywords),
    tags: Object.fromEntries(counts.tags),
    flags: {
      signed: counts.flags.signed,
      overnumbered: counts.flags.overnumbered,
      banned: counts.flags.banned,
      errata: counts.flags.errata,
      standard: counts.flags.standard,
    },
    presence: counts.presence,
    ranges: counts.ranges,
  };
}

export function fromWireFilterCounts(wire: FilterCountsWire): FilterCounts {
  return {
    sets: new Map(Object.entries(wire.sets)),
    languages: new Map(Object.entries(wire.languages)),
    domains: new Map(Object.entries(wire.domains)),
    types: new Map(Object.entries(wire.types)),
    superTypes: new Map(Object.entries(wire.superTypes)),
    rarities: new Map(Object.entries(wire.rarities)),
    artVariants: new Map(Object.entries(wire.artVariants)),
    finishes: new Map(Object.entries(wire.finishes)),
    cardSizes: new Map(Object.entries(wire.cardSizes)),
    markers: new Map(Object.entries(wire.markers)),
    channels: new Map(Object.entries(wire.channels)),
    keywords: new Map(Object.entries(wire.keywords)),
    tags: new Map(Object.entries(wire.tags)),
    flags: { ...wire.flags },
    presence: wire.presence,
    ranges: wire.ranges,
  };
}

interface CardFacetsPayloadWire {
  facets: AvailableFiltersWire;
  availableLanguages: string[];
  setLabels: Record<string, string>;
}

// TODO: no in-process cache layered on top of the upstream serverCache reads.
// Today this is fine — catalog/prices/init are deduplicated by serverCache, so
// repeated /cards SSR requests reuse the same upstream payloads. If profiling
// shows the per-request `getAvailableFilters` scan dominates SSR cost, memoize
// the result keyed on (catalog, prices, orders) reference identity.
export const fetchCardFacets = createServerFn({ method: "GET" }).handler(
  async (): Promise<CardFacetsPayloadWire> => {
    const [catalog, prices, init] = await Promise.all([
      readCatalogFromServerCache(),
      readPricesFromServerCache(),
      readInitFromServerCache(),
    ]);
    const facets = extractCatalogFacets(catalog, prices, ordersFromInit(init));
    return {
      facets: toWireFacets(facets),
      availableLanguages: extractAvailableLanguages(catalog),
      setLabels: extractSetLabels(catalog),
    };
  },
);

export const fetchCardCounts = createServerFn({ method: "GET" })
  .validator((input: FilterSearch) => input)
  .handler(async ({ data }): Promise<CardCounts> => {
    const [catalog, prices] = await Promise.all([
      readCatalogFromServerCache(),
      readPricesFromServerCache(),
    ]);
    return extractCardCounts(catalog, prices, data);
  });

export const fetchCardFilterCounts = createServerFn({ method: "GET" })
  .validator((input: FilterSearch) => input)
  .handler(async ({ data }): Promise<FilterCountsWire> => {
    const [catalog, prices] = await Promise.all([
      readCatalogFromServerCache(),
      readPricesFromServerCache(),
    ]);
    const { allPrintings } = enrichCatalog(catalog);
    const lookup = priceLookupFromMap(prices.prices);
    const getPrice = (printing: Printing) => lookup.get(printing.id, SSR_MARKETPLACE);
    const view = data.view ?? SSR_DEFAULT_VIEW;
    const counts = computeFilterCounts(allPrintings, searchToFilters(data), {
      countBy: view === "cards" ? "card" : "printing",
      getPrice,
    });
    return toWireFilterCounts(counts);
  });
