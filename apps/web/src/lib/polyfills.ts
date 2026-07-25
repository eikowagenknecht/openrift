/**
 * Runtime shims for built-ins that are newer than the browser floor declared in
 * `apps/web/package.json` (`browserslist`).
 *
 * Vite's `build.target` only downlevels *syntax* — it never adds missing
 * built-in methods. So an ES2024 method call compiles through untouched and
 * throws at runtime on any browser that lacks it. `Map.groupBy` did exactly
 * that: it is Safari/iOS 17.4+, and on iOS 16.6 every route reaching
 * `use-cards`, `use-enums`, `catalog-query` or `card-groups` died with
 * "Map.groupBy is not a function".
 *
 * This module must be imported *first* in the client entry so the shim is
 * installed before any module that calls it at import time.
 *
 * Anything else past the floor is blocked by the `no-restricted-properties`
 * oxlint rule; add a shim here (and drop the restriction) when one is needed.
 */

/**
 * Stand-in for `Map.groupBy`, matching the spec's iteration order: keys appear
 * in the order first encountered, and values within a group keep source order.
 * @param items Iterable to partition.
 * @param keySelector Derives the group key for each item.
 * @returns A map of group key to the items assigned to that key.
 */
export function groupByShim<K, T>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  let index = 0;
  for (const item of items) {
    const key = keySelector(item, index);
    index += 1;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

if (typeof Map.groupBy !== "function") {
  Map.groupBy = groupByShim;
}
