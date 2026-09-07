/**
 * Runtime shims for built-ins newer than the browser floor. Vite's
 * `build.target` downlevels syntax only, not missing built-ins, so an ES2024
 * method throws at runtime on a browser that lacks it (Map.groupBy did, on
 * iOS < 17.4). Must be imported first in the client entry so the shim installs
 * before any module calls it at import time.
 */

// Matches the spec's iteration order: keys appear in the order first
// encountered, values within a group keep source order.
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
