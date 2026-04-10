import type {
  CardFilters,
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import {
  EMPTY_PRICE_LOOKUP,
  comparePrintings,
  filterCards,
  getAvailableFilters,
  sortCards,
} from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  languageFilter?: string[];
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  enabled?: boolean;
  /** Reverse map from translated keyword labels to canonical names, for cross-language search. */
  keywordReverseMap?: Map<string, string>;
}

function toComparable(p: Printing, setOrderMap: Map<string, number>) {
  return { ...p, setOrder: setOrderMap.get(p.setId), promoTypeSlug: p.promoType?.slug };
}

/**
 * Compare two printings with language preference as the primary tiebreaker.
 * Preferred languages (earlier in the user's language order) sort first,
 * then fall back to the canonical comparePrintings order.
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
function compareWithLanguagePreference(
  a: Printing,
  b: Printing,
  setOrderMap: Map<string, number>,
  languageOrder?: string[],
): number {
  if (languageOrder && languageOrder.length > 1) {
    const aIdx = languageOrder.indexOf(a.language);
    const bIdx = languageOrder.indexOf(b.language);
    // Missing languages (already filtered out) sort after listed ones
    const aPos = aIdx === -1 ? languageOrder.length : aIdx;
    const bPos = bIdx === -1 ? languageOrder.length : bIdx;
    const langCompare = aPos - bPos;
    if (langCompare !== 0) {
      return langCompare;
    }
  }
  return comparePrintings(toComparable(a, setOrderMap), toComparable(b, setOrderMap));
}

/**
 * In "cards" mode, deduplicate by cardId — keep the canonical printing per language preference
 * then comparePrintings order (earliest set by display order, then short code, then non-promo first).
 * @returns Deduplicated printings, one per card.
 */
function deduplicateByCard(
  filteredCards: Printing[],
  setOrderMap: Map<string, number>,
  languageOrder?: string[],
): Printing[] {
  const seen = new Map<string, Printing>();
  for (const printing of filteredCards) {
    const existing = seen.get(printing.cardId);
    if (existing) {
      if (compareWithLanguagePreference(printing, existing, setOrderMap, languageOrder) < 0) {
        seen.set(printing.cardId, printing);
      }
    } else {
      seen.set(printing.cardId, printing);
    }
  }
  return [...seen.values()];
}

/**
 * Group all printings by cardId and sort each group by language preference then canonical order.
 * @returns A map from cardId to sorted printings.
 */
function groupPrintingsByCardId(
  allPrintings: Printing[],
  setOrderMap: Map<string, number>,
  languageOrder?: string[],
): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const p of allPrintings) {
    let group = map.get(p.cardId);
    if (!group) {
      group = [];
      map.set(p.cardId, group);
    }
    group.push(p);
  }
  for (const group of map.values()) {
    group.sort((a, b) => compareWithLanguagePreference(a, b, setOrderMap, languageOrder));
  }
  return map;
}

/**
 * Compute min/max market price per cardId from grouped printings, looking up
 * each printing's price on the user's favorite marketplace.
 * @returns A map from cardId to price range.
 */
function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  prices: PriceLookup,
  marketplace: Marketplace,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of printings) {
      const price = prices.get(p.id, marketplace);
      if (price !== undefined) {
        min = Math.min(min, price);
        max = Math.max(max, price);
      }
    }
    if (min !== Infinity) {
      map.set(cardId, { min, max });
    }
  }
  return map;
}

/**
 * Build owned-count map keyed by printing ID. In "cards" view, the representative gets the sum.
 * @returns A map from printing ID to owned count.
 */
function buildOwnedCounts(
  allPrintings: Printing[],
  displayCards: Printing[],
  ownedCountByPrinting: Record<string, number>,
  view: "cards" | "printings",
): Map<string, number> {
  const map = new Map<string, number>();
  if (view === "cards") {
    const countByCard = new Map<string, number>();
    for (const p of allPrintings) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      countByCard.set(p.cardId, (countByCard.get(p.cardId) ?? 0) + count);
    }
    for (const p of displayCards) {
      const count = countByCard.get(p.cardId) ?? 0;
      if (count > 0) {
        map.set(p.id, count);
      }
    }
  } else {
    for (const p of allPrintings) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      if (count > 0) {
        map.set(p.id, count);
      }
    }
  }
  return map;
}

const EMPTY_AVAILABLE = getAvailableFilters([]);
const EMPTY_PRINTINGS_MAP = new Map<string, Printing[]>();
const NO_OP_LABEL = (slug: string) => slug;

export function useCardData({
  allPrintings,
  sets,
  languageFilter,
  filters,
  sortBy,
  sortDir,
  view,
  ownedCountByPrinting,
  favoriteMarketplace,
  prices,
  enabled = true,
  keywordReverseMap,
}: UseCardDataParams) {
  "use memo";

  if (!enabled) {
    return {
      availableFilters: EMPTY_AVAILABLE,
      sortedCards: [] as Printing[],
      printingsByCardId: EMPTY_PRINTINGS_MAP,
      priceRangeByCardId: null,
      ownedCounts: undefined,
      totalUniqueCards: 0,
      setDisplayLabel: NO_OP_LABEL,
    };
  }

  const setSlugToName = new Map(sets.map((s) => [s.slug, s.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;
  const setOrderMap = new Map(sets.map((s, i) => [s.id, i]));

  // Apply language filter before other filters
  const langFiltered =
    languageFilter && languageFilter.length > 0
      ? allPrintings.filter((printing) => languageFilter.includes(printing.language))
      : allPrintings;

  // getPrice resolves a printing's price on the user's favorite marketplace.
  // Filters, sorting, and the available-price-range histogram all read prices
  // through this dependency rather than reading a field off the printing.
  const lookup = prices ?? EMPTY_PRICE_LOOKUP;
  const getPrice = (p: Printing) => lookup.get(p.id, favoriteMarketplace);

  const availableFilters = getAvailableFilters(langFiltered, { getPrice });
  const filteredCards = filterCards(langFiltered, filters, { keywordReverseMap, getPrice });

  const displayCards =
    view === "cards"
      ? deduplicateByCard(filteredCards, setOrderMap, languageFilter)
      : filteredCards;

  const printingsByCardId = groupPrintingsByCardId(filteredCards, setOrderMap, languageFilter);

  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, lookup, favoriteMarketplace) : null;

  const sortOptions: SortCardsOptions = { sortDir };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (p) => {
      const range = priceRangeByCardId.get(p.cardId);
      if (!range) {
        return getPrice(p) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  } else if (sortBy === "price") {
    sortOptions.getPrice = getPrice;
  }
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  const ownedCounts = ownedCountByPrinting
    ? buildOwnedCounts(langFiltered, displayCards, ownedCountByPrinting, view)
    : undefined;

  const totalUniqueCards =
    view === "cards" ? new Set(langFiltered.map((c) => c.cardId)).size : langFiltered.length;

  return {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  };
}
