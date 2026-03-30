import type {
  CardFilters,
  Marketplace,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import { comparePrintings, filterCards, getAvailableFilters, sortCards } from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
}

function toComparable(p: Printing, setOrderMap: Map<string, number>) {
  return { ...p, setOrder: setOrderMap.get(p.setId), promoTypeSlug: p.promoType?.slug };
}

/**
 * In "cards" mode, deduplicate by cardId — keep the canonical printing per comparePrintings order
 * (earliest set by display order, then normal finish before foil, non-promo before promo, etc.).
 * @returns Deduplicated printings, one per card.
 */
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

/**
 * Group all printings by cardId and sort each group by canonical printing order.
 * @returns A map from cardId to sorted printings.
 */
function groupPrintingsByCardId(
  allPrintings: Printing[],
  setOrderMap: Map<string, number>,
): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const p of allPrintings) {
    let group = map.get(p.card.id);
    if (!group) {
      group = [];
      map.set(p.card.id, group);
    }
    group.push(p);
  }
  for (const group of map.values()) {
    group.sort((a, b) =>
      comparePrintings(toComparable(a, setOrderMap), toComparable(b, setOrderMap)),
    );
  }
  return map;
}

/**
 * Resolve the display price for a printing from the user's favorite marketplace.
 * Falls back to `marketPrice` (TCGplayer) when `marketPrices` is absent.
 * @returns The price or `undefined` if unavailable.
 */
export function resolvePrice(printing: Printing, marketplace: Marketplace): number | undefined {
  return (
    printing.marketPrices?.[marketplace] ??
    (marketplace === "tcgplayer" ? printing.marketPrice : undefined)
  );
}

/**
 * Compute min/max market price per cardId from grouped printings.
 * @returns A map from cardId to price range.
 */
function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  marketplace: Marketplace,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of printings) {
      const price = resolvePrice(p, marketplace);
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
      countByCard.set(p.card.id, (countByCard.get(p.card.id) ?? 0) + count);
    }
    for (const p of displayCards) {
      const count = countByCard.get(p.card.id) ?? 0;
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

export function useCardData({
  allPrintings,
  sets,
  filters,
  sortBy,
  sortDir,
  view,
  ownedCountByPrinting,
  favoriteMarketplace,
}: UseCardDataParams) {
  "use memo";
  const setSlugToName = new Map(sets.map((s) => [s.slug, s.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;
  const setOrderMap = new Map(sets.map((s, i) => [s.id, i]));

  const availableFilters = getAvailableFilters(allPrintings);
  const filteredCards = filterCards(allPrintings, filters);

  const displayCards =
    view === "cards" ? deduplicateByCard(filteredCards, setOrderMap) : filteredCards;

  const printingsByCardId = groupPrintingsByCardId(filteredCards, setOrderMap);

  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, favoriteMarketplace) : null;

  const sortOptions: SortCardsOptions = { sortDir };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (p) => {
      const range = priceRangeByCardId.get(p.card.id);
      if (!range) {
        return resolvePrice(p, favoriteMarketplace) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  }
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  const ownedCounts = ownedCountByPrinting
    ? buildOwnedCounts(allPrintings, displayCards, ownedCountByPrinting, view)
    : undefined;

  const totalUniqueCards =
    view === "cards" ? new Set(allPrintings.map((c) => c.card.id)).size : allPrintings.length;

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
