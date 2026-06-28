/**
 * Stable-sorts sets main-first, then supplemental, preserving the source
 * (release) order within each set type. Shared by the live grid's
 * `groupItemsBySet` and the SSR first-row preview (`extractFirstRow`) so the
 * server-rendered shell and the hydrated grid agree on which set leads — see
 * the comment in `cards-first-row.ts`.
 * @returns A new array with main sets before supplemental ones.
 */
export function orderSetsMainFirst<SetLike extends { setType?: "main" | "supplemental" }>(
  sets: readonly SetLike[],
): SetLike[] {
  return sets.toSorted((a, b) => (a.setType === b.setType ? 0 : a.setType === "main" ? -1 : 1));
}
