import type {
  CardFilters,
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import { comparePrintings, filterCards, getAvailableFilters, sortCards } from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";
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

function toComparable(printing: Printing, setOrderMap: Map<string, number>) {
  return {
    ...printing,
    setOrder: setOrderMap.get(printing.setId),
    promoTypeSlug: printing.promoType?.slug,
  };
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
  const { stacks, totalCopies } = useStackedCopies(collectionId);

  const collectionPrintings = stacks.map((stack) => stack.printing);
  const setOrderMap = new Map(sets.map((set, index) => [set.id, index]));
  const setSlugToName = new Map(sets.map((set) => [set.slug, set.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const getPrice = (p: Printing) => prices.get(p.id, favoriteMarketplace);

  const availableFilters = getAvailableFilters(collectionPrintings, { getPrice });
  const filteredCards = filterCards(collectionPrintings, filters, { keywordReverseMap, getPrice });

  // In "cards" view, deduplicate by cardId (keep canonical printing)
  const displayCards =
    view === "cards" ? deduplicateByCard(filteredCards, setOrderMap, languageOrder) : filteredCards;

  // Group all collection printings by cardId for detail pane siblings
  const printingsByCardId = groupPrintingsByCardId(collectionPrintings, setOrderMap, languageOrder);

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
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    stacks,
    totalCopies,
    stackByPrintingId,
    totalUniqueCards,
    setDisplayLabel,
  };
}

function compareWithLanguagePreference(
  a: Printing,
  b: Printing,
  setOrderMap: Map<string, number>,
  languageOrder?: string[],
): number {
  if (languageOrder && languageOrder.length > 1) {
    const aIdx = languageOrder.indexOf(a.language);
    const bIdx = languageOrder.indexOf(b.language);
    const aPos = aIdx === -1 ? languageOrder.length : aIdx;
    const bPos = bIdx === -1 ? languageOrder.length : bIdx;
    const langCompare = aPos - bPos;
    if (langCompare !== 0) {
      return langCompare;
    }
  }
  return comparePrintings(toComparable(a, setOrderMap), toComparable(b, setOrderMap));
}

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

function groupPrintingsByCardId(
  printings: Printing[],
  setOrderMap: Map<string, number>,
  languageOrder?: string[],
): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const printing of printings) {
    let group = map.get(printing.cardId);
    if (!group) {
      group = [];
      map.set(printing.cardId, group);
    }
    group.push(printing);
  }
  for (const group of map.values()) {
    group.sort((a, b) => compareWithLanguagePreference(a, b, setOrderMap, languageOrder));
  }
  return map;
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
