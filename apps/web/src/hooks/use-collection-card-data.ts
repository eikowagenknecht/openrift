import type {
  CardFilters,
  Marketplace,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import { comparePrintings, filterCards, getAvailableFilters, sortCards } from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";
import { resolvePrice } from "@/hooks/use-card-data";
import { useStackedCopies } from "@/hooks/use-stacked-copies";

interface UseCollectionCardDataParams {
  collectionId?: string;
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  sets: SetInfo[];
  favoriteMarketplace: Marketplace;
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
}: UseCollectionCardDataParams) {
  "use memo";
  const { stacks, totalCopies } = useStackedCopies(collectionId);

  const collectionPrintings = stacks.map((stack) => stack.printing);
  const setOrderMap = new Map(sets.map((set, index) => [set.id, index]));
  const setSlugToName = new Map(sets.map((set) => [set.slug, set.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const availableFilters = getAvailableFilters(collectionPrintings);
  const filteredCards = filterCards(collectionPrintings, filters);

  // In "cards" view, deduplicate by cardId (keep canonical printing)
  const displayCards =
    view === "cards" ? deduplicateByCard(filteredCards, setOrderMap) : filteredCards;

  // Group all collection printings by cardId for detail pane siblings
  const printingsByCardId = groupPrintingsByCardId(collectionPrintings, setOrderMap);

  // Price ranges for "cards" view sorting
  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, favoriteMarketplace) : null;

  const sortOptions: SortCardsOptions = { sortDir };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (printing) => {
      const range = priceRangeByCardId.get(printing.card.id);
      if (!range) {
        return resolvePrice(printing, favoriteMarketplace) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  }
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  // Build stack lookup for renderCard to find copyIds/counts
  const stackByPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));

  const totalUniqueCards =
    view === "cards"
      ? new Set(collectionPrintings.map((p) => p.card.id)).size
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

function deduplicateByCard(
  filteredCards: Printing[],
  setOrderMap: Map<string, number>,
): Printing[] {
  const seen = new Map<string, Printing>();
  for (const printing of filteredCards) {
    const existing = seen.get(printing.card.id);
    if (existing) {
      if (
        comparePrintings(toComparable(printing, setOrderMap), toComparable(existing, setOrderMap)) <
        0
      ) {
        seen.set(printing.card.id, printing);
      }
    } else {
      seen.set(printing.card.id, printing);
    }
  }
  return [...seen.values()];
}

function groupPrintingsByCardId(
  printings: Printing[],
  setOrderMap: Map<string, number>,
): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const printing of printings) {
    let group = map.get(printing.card.id);
    if (!group) {
      group = [];
      map.set(printing.card.id, group);
    }
    group.push(printing);
  }
  for (const group of map.values()) {
    group.sort((a, b) =>
      comparePrintings(toComparable(a, setOrderMap), toComparable(b, setOrderMap)),
    );
  }
  return map;
}

function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  marketplace: Marketplace,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const printing of printings) {
      const price = resolvePrice(printing, marketplace);
      if (price !== null && price !== undefined) {
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
