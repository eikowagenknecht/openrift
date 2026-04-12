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
  deduplicateByCard,
  filterCards,
  getAvailableFilters,
  groupPrintingsByCardId,
  sortCards,
} from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  languageFilter?: string[];
  filters: CardFilters;
  /** Tri-state ownership filter: true = owned only, false = missing only, null = all. */
  isOwned?: boolean | null;
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
  isOwned,
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
  // Sort order for set filter: main sets first (in sortOrder), then supplemental.
  const setSlugOrder = new Map(
    sets
      .toSorted((a, b) => (a.setType === b.setType ? 0 : a.setType === "main" ? -1 : 1))
      .map((s, i) => [s.slug, i]),
  );

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
  availableFilters.sets.sort(
    (a, b) => (setSlugOrder.get(a) ?? Infinity) - (setSlugOrder.get(b) ?? Infinity),
  );
  availableFilters.supplementalSets = new Set(
    sets.filter((s) => s.setType === "supplemental").map((s) => s.slug),
  );
  let filteredCards = filterCards(langFiltered, filters, { keywordReverseMap, getPrice });

  // Apply ownership filter (frontend-only, needs user copy data)
  if (isOwned !== null && isOwned !== undefined && ownedCountByPrinting) {
    // Build set of owned card IDs for "cards" view deduplication
    const ownedCardIds = new Set<string>();
    for (const printing of langFiltered) {
      if ((ownedCountByPrinting[printing.id] ?? 0) > 0) {
        ownedCardIds.add(printing.cardId);
      }
    }
    filteredCards = isOwned
      ? filteredCards.filter((printing) => ownedCardIds.has(printing.cardId))
      : filteredCards.filter((printing) => !ownedCardIds.has(printing.cardId));
  }

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
