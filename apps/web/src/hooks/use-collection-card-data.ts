import type {
  CardFilters,
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import {
  WellKnown,
  filterCards,
  getAvailableFilters,
  sortByLanguageAndCanonicalRank,
  sortCards,
} from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders } from "@/hooks/use-enums";
import { useStackedCopies } from "@/hooks/use-stacked-copies";

interface UseCollectionCardDataParams {
  collectionId?: string;
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  sets: SetInfo[];
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  /** Reverse map from translated keyword labels to canonical names, for cross-language search. */
  keywordReverseMap?: Map<string, string>;
  languageOrder?: string[];
}

/**
 * Bridges useStackedCopies with the shared filter/sort pipeline so that collection
 * cards can be filtered, sorted, and displayed using the same infrastructure as the
 * full catalog browser.
 * @returns Filtered/sorted collection data plus stack metadata.
 */
export function useCollectionCardData({
  collectionId,
  filters,
  sortBy,
  sortDir,
  view,
  sets,
  favoriteMarketplace,
  prices,
  keywordReverseMap,
  languageOrder,
}: UseCollectionCardDataParams) {
  "use memo";
  const { stacks, totalCopies, isReady } = useStackedCopies(collectionId);
  const { orders } = useEnumOrders();
  const defaultEffectiveLanguageOrder = useEffectiveLanguageOrder();

  const collectionPrintings = stacks.map((stack) => stack.printing);
  const setSlugToName = new Map(sets.map((set) => [set.slug, set.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const getPrice = (p: Printing) => prices.get(p.id, favoriteMarketplace);

  // `languageOrder` prop wins (collection UIs can narrow further); otherwise
  // fall back to the user's display-store pref, otherwise the DB default.
  const effectiveLanguageOrder =
    languageOrder && languageOrder.length > 0 ? languageOrder : defaultEffectiveLanguageOrder;

  const availableFilters = getAvailableFilters(collectionPrintings, { orders, getPrice });
  availableFilters.supplementalSets = new Set(
    sets.filter((s) => s.setType === WellKnown.setType.SUPPLEMENTAL).map((s) => s.slug),
  );

  // Derived from the user's actual owned printings so the filter UI lists only
  // languages present in this collection. When the user owns a single
  // language, the Language section stays hidden (filter-panel threshold is
  // length > 1).
  const availableLanguages = [...new Set(collectionPrintings.map((p) => p.language))];

  // `useStackedCopies` returns printings in shortCode order (for the Copies
  // view). Pre-sort by (languageRank, canonicalRank) here so dedup/group
  // below can be first-occurrence and still pick the user-preferred printing
  // per card.
  const canonicallyOrderedCollection = sortByLanguageAndCanonicalRank(
    collectionPrintings,
    effectiveLanguageOrder,
  );
  const filteredCards = filterCards(canonicallyOrderedCollection, filters, {
    keywordReverseMap,
    getPrice,
  });

  // In "cards" view, keep one printing per cardId (the first = canonical pick).
  const displayCards = view === "cards" ? firstPrintingPerCard(filteredCards) : filteredCards;

  // Group all collection printings by cardId for detail pane siblings.
  const printingsByCardId = Map.groupBy(canonicallyOrderedCollection, (p) => p.cardId);

  // Price ranges for "cards" view sorting
  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, prices, favoriteMarketplace) : null;

  const sortOptions: SortCardsOptions = { sortDir };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (printing) => {
      const range = priceRangeByCardId.get(printing.cardId);
      if (!range) {
        return getPrice(printing) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  } else if (sortBy === "price") {
    sortOptions.getPrice = getPrice;
  } else if (sortBy === "rarity") {
    sortOptions.rarityOrder = orders.rarities;
  }
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  // Build stack lookup for renderCard to find copyIds/counts
  const stackByPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));

  const totalUniqueCards =
    view === "cards"
      ? new Set(collectionPrintings.map((p) => p.cardId)).size
      : collectionPrintings.length;

  return {
    availableFilters,
    availableLanguages,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    stacks,
    totalCopies,
    stackByPrintingId,
    totalUniqueCards,
    setDisplayLabel,
    isReady,
  };
}

/**
 * Keep the first printing encountered per `cardId`. Relies on the input
 * being pre-sorted by (languageRank, canonicalRank).
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

function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  prices: PriceLookup,
  marketplace: Marketplace,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const printing of printings) {
      const price = prices.get(printing.id, marketplace);
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
