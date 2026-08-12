import type { Printing, SetOrderInfo } from "@openrift/shared";
import { setIndexById, UNKNOWN_SET_INDEX } from "@openrift/shared";

/** A printing's place in the catalog: its set's order, then its card number. */
export interface CatalogPosition {
  setIndex: number;
  shortCode: string;
}

/** A printing whose set the catalog doesn't know, so it sorts after all others. */
const UNKNOWN_POSITION: CatalogPosition = { setIndex: UNKNOWN_SET_INDEX, shortCode: "" };

/**
 * Orders two printings the way the catalog does: by set, then by short code,
 * whose zero-padded number sorts as a plain string ("OGN-002" before "OGN-010").
 * @param a The first position.
 * @param b The second position.
 * @returns Negative when `a` comes first, positive when `b` does, 0 when equal.
 */
export function compareCatalogPosition(a: CatalogPosition, b: CatalogPosition): number {
  return a.setIndex - b.setIndex || a.shortCode.localeCompare(b.shortCode);
}

/**
 * Builds a comparator over printing ids for the surfaces that carry a printing
 * id but no catalog fields of their own (trade rows, match rows). Ids the
 * catalog doesn't know sort last, keeping their relative order.
 * @param printingsById The catalog's printings by id.
 * @param sets The catalog's sets, in catalog order.
 * @returns A comparator for two printing ids.
 */
export function comparePrintingIdsByCatalog(
  printingsById: Record<string, Printing>,
  sets: readonly SetOrderInfo[],
): (a: string, b: string) => number {
  const setIndexes = setIndexById(sets);
  const positionOf = (printingId: string): CatalogPosition => {
    const printing = printingsById[printingId];
    if (!printing) {
      return UNKNOWN_POSITION;
    }
    return {
      setIndex: setIndexes.get(printing.setId) ?? UNKNOWN_SET_INDEX,
      shortCode: printing.shortCode,
    };
  };
  return (a, b) => compareCatalogPosition(positionOf(a), positionOf(b));
}
