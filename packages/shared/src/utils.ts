import type { ArtVariant } from "./types.js";
import { ART_VARIANT_ORDER } from "./types.js";

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
 * Normalize a card/product name for matching.
 * Strips all non-alphanumeric characters **and spaces**, producing a
 * spaceless lowercase slug so that names like "Kai'Sa, Survivor" / "KaiSa
 * Survivor" and "Mega-Mech" / "Mega Mech" all compare equal.
 *
 * @returns A lowercased alphanumeric-only slug (e.g. "kaisasurvivor").
 */
export function normalizeNameForMatching(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/**
 * Compare two printings by set, collector number, then art variant.
 * Use as a comparator for `.sort()` to get canonical printing order.
 *
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
export function comparePrintings(
  a: { setId?: string | null; collectorNumber: number; artVariant: ArtVariant },
  b: { setId?: string | null; collectorNumber: number; artVariant: ArtVariant },
): number {
  return (
    (a.setId ?? "").localeCompare(b.setId ?? "") ||
    a.collectorNumber - b.collectorNumber ||
    ART_VARIANT_ORDER.indexOf(a.artVariant) - ART_VARIANT_ORDER.indexOf(b.artVariant)
  );
}

/**
 * Convert a dollar/euro amount to integer cents. Treats 0 as null (no data).
 * @returns The amount in cents, or null if empty/zero.
 */
export function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === 0) {
    return null;
  }
  return Math.round(amount * 100);
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
