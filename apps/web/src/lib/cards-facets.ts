import type {
  ArtVariant,
  AvailableFilters,
  CardType,
  CatalogResponse,
  Domain,
  EnumOrders,
  Finish,
  InitResponse,
  Marketplace,
  PricesResponse,
  Printing,
  Rarity,
  SuperType,
} from "@openrift/shared";
import {
  DEFAULT_SEARCH_SCOPE,
  filterCards,
  getAvailableFilters,
  priceLookupFromMap,
} from "@openrift/shared";
import { createServerFn } from "@tanstack/react-start";

import { enrichCatalog, readCatalogFromServerCache } from "@/lib/catalog-query";
import type { FilterSearch } from "@/lib/search-schemas";
import { serverCache } from "@/lib/server-cache";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";

// Default marketplace used to compute the SSR price range. Matches the
// fallback in <CardBrowser> for users with no `marketplaceOrder` preference.
// Users who picked a different favorite marketplace will see the price slider
// thumb snap to their preferred range after hydration; the slider's bounding
// box doesn't change, so there's no layout shift.
const SSR_MARKETPLACE: Marketplace = "cardtrader";

// Default `view` mode when the URL doesn't carry one. Matches PREFERENCE_DEFAULTS
// from shared/types/api/preferences.ts. Used to decide whether `totalCards`
// counts unique card ids (cards view) or printings (printings view).
const SSR_DEFAULT_VIEW = "printings";

function readPricesFromServerCache(): Promise<PricesResponse> {
  return serverCache.fetchQuery({
    queryKey: ["server-cache", "prices"],
    queryFn: () =>
      fetchApiJson<PricesResponse>({
        errorTitle: "Couldn't load prices",
        path: "/api/v1/prices",
      }),
  });
}

function readInitFromServerCache(): Promise<InitResponse> {
  return serverCache.fetchQuery({
    queryKey: ["server-cache", "init"],
    queryFn: () =>
      fetchApiJson<InitResponse>({
        errorTitle: "Couldn't load initial data",
        path: "/api/v1/init",
      }),
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
  };
}

/**
 * Derives the `AvailableFilters` shape used by the cards page filter chrome
 * from a server-cached catalog + prices + enum orders snapshot.
 *
 * Pure function over its inputs — safe to call from tests with fixtures.
 *
 * @returns The set of filter dimensions and ranges observed in the catalog.
 */
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

/**
 * The set of distinct printing languages observed in the catalog. Matches the
 * derivation in `useCardData` so the SSR shell renders the same language
 * filter section the live grid does.
 *
 * @returns Sorted unique language codes (e.g. `["EN", "DE", "JA"]`).
 */
export function extractAvailableLanguages(catalog: CatalogResponse): string[] {
  const { allPrintings } = enrichCatalog(catalog);
  return [...new Set(allPrintings.map((printing) => printing.language))];
}

/**
 * Map of set slug → display name, derived from the catalog's `sets` array.
 * Powers `setDisplayLabel` in chrome components without shipping the full
 * SetInfo[] over the wire.
 *
 * @returns A record mapping each set slug to its human-readable name.
 */
export function extractSetLabels(catalog: CatalogResponse): Record<string, string> {
  return Object.fromEntries(catalog.sets.map((set) => [set.slug, set.name]));
}

/**
 * Builds the `CardFilters` shape `filterCards` expects from the URL-derived
 * `FilterSearch`. Mirrors the conversion in `useFilterValues`; on the server
 * we don't have access to the search scope store so we use the default scope.
 *
 * @returns A `CardFilters` object suitable for passing to shared `filterCards`.
 */
function searchToFilters(search: FilterSearch) {
  return {
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
    isSigned: search.signed ?? null,
    hasAnyMarker: search.promo ?? null,
    markerSlugs: [] as string[],
    distributionChannelSlugs: [] as string[],
    isBanned: search.banned ?? null,
    hasErrata: search.errata ?? null,
    energy: { min: search.energyMin ?? null, max: search.energyMax ?? null },
    might: { min: search.mightMin ?? null, max: search.mightMax ?? null },
    power: { min: search.powerMin ?? null, max: search.powerMax ?? null },
    price: { min: search.priceMin ?? null, max: search.priceMax ?? null },
  };
}

export interface CardCounts {
  /** Total count over the unfiltered catalog, respecting the active view. */
  totalCards: number;
  /** Count after applying URL filters, respecting the active view. */
  filteredCount: number;
}

/**
 * Computes the SearchBar's "X of Y" counts over the full catalog using the
 * URL-derived filters. Skips the owned/incomplete post-processing because the
 * SSR pass has no per-user collection data — for users arriving with an
 * `?owned=...` URL filter the count flips on hydration. That's a brief
 * cosmetic difference, not a layout shift.
 *
 * @returns Total and filtered card/printing counts.
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

// `AvailableFilters` carries a `ReadonlySet<string>` (`supplementalSets`) which
// the server-fn boundary cannot serialize. The wire shape replaces it with an
// array; consumers rehydrate via `fromWireFacets` before passing to UI code.
export type AvailableFiltersWire = Omit<AvailableFilters, "supplementalSets"> & {
  supplementalSets: string[];
};

export function toWireFacets(facets: AvailableFilters): AvailableFiltersWire {
  return { ...facets, supplementalSets: [...facets.supplementalSets] };
}

export function fromWireFacets(wire: AvailableFiltersWire): AvailableFilters {
  return { ...wire, supplementalSets: new Set(wire.supplementalSets) };
}

export interface CardFacetsPayloadWire {
  facets: AvailableFiltersWire;
  availableLanguages: string[];
  /** Slug → display name lookup for the Filters panel and ActiveFilters chips. */
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

/**
 * Server fn that returns SearchBar counts for a given URL search. Computed
 * over the full catalog using shared `filterCards`, so the SSR shell can show
 * "X of Y" with real numbers from byte zero.
 */
export const fetchCardCounts = createServerFn({ method: "GET" })
  .inputValidator((input: FilterSearch) => input)
  .handler(async ({ data }): Promise<CardCounts> => {
    const [catalog, prices] = await Promise.all([
      readCatalogFromServerCache(),
      readPricesFromServerCache(),
    ]);
    return extractCardCounts(catalog, prices, data);
  });
