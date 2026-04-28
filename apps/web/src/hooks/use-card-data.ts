import type {
  CardFilters,
  FilterCounts,
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import {
  computeFilterCounts,
  EMPTY_PRICE_LOOKUP,
  filterCards,
  getAvailableFilters,
  getPlaysetSize,
  sortCards,
} from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";
import { useEnumOrders } from "@/hooks/use-enums";
import type { OwnedFilterState } from "@/lib/search-schemas";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  filters: CardFilters;
  /** Owned filter state: "owned" | "missing" | "incomplete" | null (no filter). */
  ownedFilter?: OwnedFilterState | null;
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

const EMPTY_PRINTINGS_MAP = new Map<string, Printing[]>();
const NO_OP_LABEL = (slug: string) => slug;

const EMPTY_FILTER_COUNTS: FilterCounts = {
  sets: new Map<string, number>(),
  languages: new Map<string, number>(),
  domains: new Map<string, number>(),
  types: new Map<string, number>(),
  superTypes: new Map<string, number>(),
  rarities: new Map<string, number>(),
  artVariants: new Map<string, number>(),
  finishes: new Map<string, number>(),
  flags: { signed: 0, promo: 0, banned: 0, errata: 0 },
  ranges: {
    energy: { min: 0, max: 0, hasNullStat: false },
    might: { min: 0, max: 0, hasNullStat: false },
    power: { min: 0, max: 0, hasNullStat: false },
    price: { min: 0, max: 0 },
  },
};

/**
 * Apply the owned/missing/incomplete filter to a printings list. Mirrors the
 * same logic the main render path uses but takes the owned state as an
 * argument so it can be reused to compute the owned-chip count for any
 * hypothetical state.
 *
 * @returns Printings remaining after the owned filter is applied.
 */
function applyOwnedFilter(
  cards: Printing[],
  state: OwnedFilterState,
  view: "cards" | "printings",
  ownedCountByPrinting: Record<string, number>,
): Printing[] {
  if (state === "incomplete") {
    const ownedTotalByCard = new Map<string, number>();
    const cardById = new Map<string, Printing["card"]>();
    for (const printing of cards) {
      const count = ownedCountByPrinting[printing.id] ?? 0;
      ownedTotalByCard.set(printing.cardId, (ownedTotalByCard.get(printing.cardId) ?? 0) + count);
      if (!cardById.has(printing.cardId)) {
        cardById.set(printing.cardId, printing.card);
      }
    }
    const incompleteCardIds = new Set<string>();
    for (const [cardId, total] of ownedTotalByCard) {
      const card = cardById.get(cardId);
      if (!card) {
        continue;
      }
      if (total < getPlaysetSize(card.type, card.keywords)) {
        incompleteCardIds.add(cardId);
      }
    }
    return cards.filter((printing) => incompleteCardIds.has(printing.cardId));
  }
  if (view === "printings") {
    return state === "owned"
      ? cards.filter((printing) => (ownedCountByPrinting[printing.id] ?? 0) > 0)
      : cards.filter((printing) => (ownedCountByPrinting[printing.id] ?? 0) === 0);
  }
  const ownedCardIds = new Set<string>();
  for (const printing of cards) {
    if ((ownedCountByPrinting[printing.id] ?? 0) > 0) {
      ownedCardIds.add(printing.cardId);
    }
  }
  return state === "owned"
    ? cards.filter((printing) => ownedCardIds.has(printing.cardId))
    : cards.filter((printing) => !ownedCardIds.has(printing.cardId));
}

/**
 * Keep the first printing encountered per `cardId`. Relies on the input
 * being pre-sorted in the order the caller wants to break ties in — here,
 * (userLanguageRank, canonicalRank) from useCards().
 *
 * @returns One printing per cardId, in first-occurrence order.
 */
function firstPrintingPerCard(printings: Printing[]): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    if (!seen.has(printing.cardId)) {
      seen.add(printing.cardId);
      result.push(printing);
    }
  }
  return result;
}

export function useCardData({
  allPrintings,
  sets,
  filters,
  ownedFilter,
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

  const { orders } = useEnumOrders();

  if (!enabled) {
    return {
      availableFilters: getAvailableFilters([], { orders }),
      availableLanguages: [] as string[],
      filterCounts: EMPTY_FILTER_COUNTS,
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

  // getPrice resolves a printing's price on the user's favorite marketplace.
  // Filters, sorting, and the available-price-range histogram all read prices
  // through this dependency rather than reading a field off the printing.
  const lookup = prices ?? EMPTY_PRICE_LOOKUP;
  const getPrice = (p: Printing) => lookup.get(p.id, favoriteMarketplace);

  // `allPrintings` from useCards() arrives in (userLanguageRank, canonicalRank)
  // order, so `filterCards` preserves that order and the dedup/group below
  // can be first-occurrence without re-sorting.
  const availableFilters = getAvailableFilters(allPrintings, { orders, sets, getPrice });
  const filterCounts = computeFilterCounts(allPrintings, filters, {
    countBy: view === "cards" ? "card" : "printing",
    keywordReverseMap,
    getPrice,
  });
  let filteredCards = filterCards(allPrintings, filters, { keywordReverseMap, getPrice });
  const cardsBeforeOwned = filteredCards;

  if (ownedFilter && ownedCountByPrinting) {
    filteredCards = applyOwnedFilter(filteredCards, ownedFilter, view, ownedCountByPrinting);
  }

  // The Owned chip count reflects whichever cycle state the chip is currently
  // showing — null displays the "Owned" label, so we count owned matches.
  if (ownedCountByPrinting) {
    const ownedSubset = applyOwnedFilter(
      cardsBeforeOwned,
      ownedFilter ?? "owned",
      view,
      ownedCountByPrinting,
    );
    filterCounts.flags.owned =
      view === "cards" ? new Set(ownedSubset.map((p) => p.cardId)).size : ownedSubset.length;
  }

  const displayCards = view === "cards" ? firstPrintingPerCard(filteredCards) : filteredCards;

  const printingsByCardId = Map.groupBy(filteredCards, (p) => p.cardId);

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
  } else if (sortBy === "rarity") {
    sortOptions.rarityOrder = orders.rarities;
  }
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  const ownedCounts = ownedCountByPrinting
    ? buildOwnedCounts(allPrintings, displayCards, ownedCountByPrinting, view)
    : undefined;

  const totalUniqueCards =
    view === "cards" ? new Set(allPrintings.map((c) => c.cardId)).size : allPrintings.length;

  // Available languages are derived from ALL printings (before language filtering)
  // so the filter UI always shows every language that exists in the catalog.
  const availableLanguages = [...new Set(allPrintings.map((p) => p.language))];

  return {
    availableFilters,
    availableLanguages,
    filterCounts,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  };
}
