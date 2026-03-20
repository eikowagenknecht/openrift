import type { ArtVariant, CardType, Finish, Rarity } from "./types/index.js";
import { ART_VARIANT_ORDER, FINISH_ORDER, RARITY_ORDER } from "./types/index.js";

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
 * @returns Deterministic ID string: "{short_code}:{rarity}:{finish}:{promo_type_slug|}"
 */
export function buildPrintingId(
  shortCode: string,
  rarity: string,
  promoTypeSlug: string | null,
  finish: string,
): string {
  return `${shortCode}:${rarity.toLowerCase()}:${finish}:${promoTypeSlug ?? ""}`;
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
 * Compare two printings for canonical ordering.
 * Sort order: set → collector number → art variant → rarity → finish → signed.
 * Null/empty art variants are treated as "normal".
 * Use as a comparator for `.sort()` to get canonical printing order.
 *
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
export function comparePrintings(
  a: {
    setId?: string | null;
    collectorNumber: number;
    artVariant: ArtVariant | null;
    rarity: Rarity | string;
    finish: Finish | string;
    isSigned: boolean;
    promoTypeSlug?: string | null;
  },
  b: {
    setId?: string | null;
    collectorNumber: number;
    artVariant: ArtVariant | null;
    rarity: Rarity | string;
    finish: Finish | string;
    isSigned: boolean;
    promoTypeSlug?: string | null;
  },
): number {
  const av = (v: ArtVariant | null): ArtVariant => v || "normal";
  const promoA = a.promoTypeSlug ?? "";
  const promoB = b.promoTypeSlug ?? "";
  return (
    (a.setId ?? "").localeCompare(b.setId ?? "") ||
    a.collectorNumber - b.collectorNumber ||
    ART_VARIANT_ORDER.indexOf(av(a.artVariant)) - ART_VARIANT_ORDER.indexOf(av(b.artVariant)) ||
    RARITY_ORDER.indexOf(a.rarity as Rarity) - RARITY_ORDER.indexOf(b.rarity as Rarity) ||
    FINISH_ORDER.indexOf(a.finish as Finish) - FINISH_ORDER.indexOf(b.finish as Finish) ||
    Number(a.isSigned) - Number(b.isSigned) ||
    Number(promoA !== "") - Number(promoB !== "") ||
    promoA.localeCompare(promoB)
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
 * Convert a nullable cent value to dollars. Inverse of {@link toCents}.
 * @returns The amount in dollars, or `null` if the input is `null`.
 */
export function centsToDollars<T extends number | null>(cents: T): T extends null ? null : number {
  return (cents === null ? null : cents / 100) as T extends null ? null : number;
}

/**
 * Formats a `Date` or ISO string as a UTC `YYYY-MM-DD` date string.
 * Useful for API responses where only the calendar date matters.
 *
 * @returns A `YYYY-MM-DD` string in UTC.
 */
export function formatDateUTC(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split("T")[0];
}

/**
 * Converts empty strings to `null`, passing through non-empty strings and nullish values as-is.
 *
 * @returns The original string if non-empty, otherwise `null`.
 */
export function emptyToNull(value: string | null | undefined): string | null {
  return value || null;
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

export function getOrientation(type: CardType): "portrait" | "landscape" {
  return type === "Battlefield" ? "landscape" : "portrait";
}

/**
 * Return the most frequent string in the array. Ties broken by first occurrence.
 * @returns The most common value, or `""` if the array is empty.
 */
export function mostCommonValue(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let best = items[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Format short codes as "OGN-027, OGN-027a ×2" (counted + alpha-sorted).
 * @returns A formatted string, or `""` if the array is empty.
 */
export function formatShortCodes(ids: string[]): string {
  if (ids.length === 0) {
    return "";
  }
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => (n > 1 ? `${id} ×${n}` : id))
    .join(", ");
}
