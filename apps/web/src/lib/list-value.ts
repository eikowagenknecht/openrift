import type { ListEntryDetailResponse, Marketplace, PriceLookup, Printing } from "@openrift/shared";

export interface ListValueResult {
  /** Sum of entry quantities × per-entry price, on the chosen marketplace. */
  value: number;
  /** Total quantity across entries that resolved to no priced printing. */
  unpriced: number;
}

interface ComputeListValueInput {
  entries: readonly ListEntryDetailResponse[];
  prices: PriceLookup;
  marketplace: Marketplace;
  /**
   * Catalog map keyed by cardId. For card-kind entries we take the lowest
   * priced printing from this map, so pre-filter it to the user's preferred
   * languages before passing it in (an empty map for a cardId is treated as
   * unpriced).
   */
  printingsByCardId: ReadonlyMap<string, Printing[]>;
}

/**
 * Sums a list's value at the user's preferred marketplace. Pricing per entry:
 * - card: lowest priced printing in `printingsByCardId` (caller scopes the map
 *   to the user's languages).
 * - printing / copy: the entry's own printing price.
 *
 * Quantities count even when unpriced — a list of three unpriced cards shows
 * "(3 unpriced)" so the user knows the total isn't the whole picture.
 * @returns Total value plus the unpriced quantity tally.
 */
export function computeListValue(input: ComputeListValueInput): ListValueResult {
  const { entries, prices, marketplace, printingsByCardId } = input;
  let value = 0;
  let unpriced = 0;
  for (const entry of entries) {
    const price = priceForEntry(entry, prices, marketplace, printingsByCardId);
    if (price === undefined) {
      unpriced += entry.quantity;
    } else {
      value += price * entry.quantity;
    }
  }
  return { value, unpriced };
}

function priceForEntry(
  entry: ListEntryDetailResponse,
  prices: PriceLookup,
  marketplace: Marketplace,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): number | undefined {
  if (entry.kind === "card") {
    return lowestPriceForCard(entry.cardId, prices, marketplace, printingsByCardId);
  }
  return prices.get(entry.printingId, marketplace);
}

function lowestPriceForCard(
  cardId: string,
  prices: PriceLookup,
  marketplace: Marketplace,
  printingsByCardId: ReadonlyMap<string, Printing[]>,
): number | undefined {
  const printings = printingsByCardId.get(cardId);
  if (!printings || printings.length === 0) {
    return undefined;
  }
  let min = Infinity;
  for (const printing of printings) {
    const candidate = prices.get(printing.id, marketplace);
    if (candidate !== undefined && candidate < min) {
      min = candidate;
    }
  }
  return min === Infinity ? undefined : min;
}
