/**
 * Deduplicates an array, preserving insertion order.
 *
 * @returns A new array with duplicates removed.
 */
export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Group items into a Map by a key derived from each item.
 *
 * @returns A Map from keys to arrays of items sharing that key.
 */
export function groupIntoMap<K, T>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(item);
  }
  return map;
}

/**
 * Build composite printing ID.
 * @returns Deterministic ID string: "{source_id}:{art_variant}:{signed|}:{promo|}:{finish}"
 */
export function buildPrintingId(
  sourceId: string,
  artVariant: string,
  isSigned: boolean,
  isPromo: boolean,
  finish: string,
): string {
  return `${sourceId}:${artVariant}:${isSigned ? "signed" : ""}:${isPromo ? "promo" : ""}:${finish}`;
}

/**
 * Returns the min and max of a number array, snapped to whole numbers (floor min, ceil max). Defaults to 0 when empty.
 *
 * @returns An object with `min` and `max` bounds.
 */
export function boundsOf(vals: number[]): { min: number; max: number } {
  if (vals.length === 0) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.floor(vals.reduce((a, b) => Math.min(a, b))),
    max: Math.ceil(vals.reduce((a, b) => Math.max(a, b))),
  };
}
