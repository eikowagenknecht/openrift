import { WellKnown } from "./well-known.js";

/**
 * The set fields the ordering helpers read. A structural subset of the catalog
 * set response, so any set-shaped object qualifies.
 */
export interface SetOrderInfo {
  id: string;
  setType?: "main" | "supplemental";
}

/** Sort position of a printing whose set isn't in the catalog: last. */
export const UNKNOWN_SET_INDEX = Number.MAX_SAFE_INTEGER;

/**
 * Stable-sorts sets main-first, then supplemental, preserving the source
 * (release) order within each set type. The API hands sets back in the admin's
 * `sortOrder`, so that source order is the release order.
 *
 * This is the app's one definition of set order: the grid's set group headers
 * (`groupItemsBySet`), the set filter dropdown (`getAvailableFilters`), the SSR
 * first-row preview (`extractFirstRow`), and every sort by card ID all order
 * sets this way, so a set never appears ahead of another on one surface and
 * behind it on the next.
 *
 * @returns A new array with main sets before supplemental ones.
 */
export function orderSetsMainFirst<SetLike extends { setType?: string }>(
  sets: readonly SetLike[],
): SetLike[] {
  return sets.toSorted((a, b) =>
    a.setType === b.setType ? 0 : a.setType === WellKnown.setType.MAIN ? -1 : 1,
  );
}

/**
 * Maps each set id to its position in {@link orderSetsMainFirst} order, so a
 * printing can be placed by its set without a set-level order field travelling
 * with the row being sorted.
 *
 * @param sets The catalog's sets, in catalog order.
 * @returns A lookup from set id to its position.
 */
export function setIndexById(sets: readonly SetOrderInfo[]): Map<string, number> {
  return new Map(orderSetsMainFirst(sets).map((set, index) => [set.id, index]));
}
