import { orderIndex } from "./filters-shared.js";
import type { SetOrderInfo } from "./set-order.js";
import { setIndexById, UNKNOWN_SET_INDEX } from "./set-order.js";
import type { Printing } from "./types/catalog.js";
import type { SortDirection, SortOption } from "./types/search.js";
import { legendDisplayName } from "./utils.js";

/** Nulls always sort to the end; the tiebreaker (card ID) is always ascending. */
function compareWithFallback(
  a: Printing,
  b: Printing,
  getValue: (p: Printing) => number | null | undefined,
  dir: 1 | -1,
  byId: (a: Printing, b: Printing) => number,
): number {
  const va = getValue(a);
  const vb = getValue(b);
  const aNullish = va === null || va === undefined;
  const bNullish = vb === null || vb === undefined;
  if (aNullish && bNullish) {
    return byId(a, b);
  }
  if (aNullish) {
    return 1;
  }
  if (bNullish) {
    return -1;
  }
  return dir * (va - vb) || byId(a, b);
}

/** Without `sets`, the short code stands alone and orders sets by their alphabetical prefix. */
function idComparator(sets?: readonly SetOrderInfo[]): (a: Printing, b: Printing) => number {
  if (!sets) {
    return (a, b) => a.shortCode.localeCompare(b.shortCode);
  }
  const indexes = setIndexById(sets);
  const indexOf = (printing: Printing) => indexes.get(printing.setId) ?? UNKNOWN_SET_INDEX;
  return (a, b) => indexOf(a) - indexOf(b) || a.shortCode.localeCompare(b.shortCode);
}

export interface SortCardsOptions {
  sortDir?: SortDirection;
  /** Without it, all printings appear price-less and fall back to shortCode order. */
  getPrice?: (p: Printing) => number | null | undefined;
  rarityOrder?: readonly string[];
  /** Also used as every other sort's tiebreaker when supplied, in place of the short code's alphabetical prefix. */
  sets?: readonly SetOrderInfo[];
}

export function sortCards(
  printings: Printing[],
  sortBy: SortOption,
  options: SortCardsOptions = {},
): Printing[] {
  const dir: 1 | -1 = options.sortDir === "desc" ? -1 : 1;
  const byId = idComparator(options.sets);
  if (sortBy === "name") {
    // Decorated first so composing the display name doesn't rebuild it O(n log n) times.
    return printings
      .map((printing) => ({ printing, name: legendDisplayName(printing.card) }))
      .sort((a, b) => dir * a.name.localeCompare(b.name) || byId(a.printing, b.printing))
      .map((entry) => entry.printing);
  }
  if (sortBy === "id") {
    if (!options.sets) {
      throw new Error("sortCards: `sets` is required when sortBy is 'id'");
    }
    return printings.toSorted((a, b) => dir * byId(a, b));
  }
  if (sortBy === "energy") {
    return printings.toSorted((a, b) => compareWithFallback(a, b, (p) => p.card.energy, dir, byId));
  }
  if (sortBy === "rarity") {
    if (!options.rarityOrder) {
      throw new Error("sortCards: `rarityOrder` is required when sortBy is 'rarity'");
    }
    const rarityOrder = options.rarityOrder;
    return printings.toSorted(
      (a, b) =>
        dir * (orderIndex(rarityOrder, a.rarity) - orderIndex(rarityOrder, b.rarity)) || byId(a, b),
    );
  }
  // oxlint-disable-next-line unicorn/no-useless-undefined -- returning undefined satisfies the getPrice contract
  const getPrice = options.getPrice ?? (() => undefined);
  return printings.toSorted((a, b) => compareWithFallback(a, b, getPrice, dir, byId));
}
