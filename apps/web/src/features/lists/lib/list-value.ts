import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace } from "@openrift/shared/types/pricing";

export interface ListValueResult {
  value: number;
  unpriced: number;
}

interface ComputeListValueInput {
  entries: readonly ListEntryDetailResponse[];
  prices: PriceLookup;
  marketplace: Marketplace;
  printingsByCardId: ReadonlyMap<string, Printing[]>;
}

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
