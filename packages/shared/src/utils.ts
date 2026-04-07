import type { CardType } from "./types/index.js";
import { DEFAULT_ENUM_ORDERS } from "./types/index.js";
import { WellKnown } from "./well-known.js";

/**
 * Deduplicates an array, preserving insertion order.
 *
 * @returns A new array with duplicates removed.
 */
export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Format a human-readable printing label from its component fields.
 * Non-EN languages get a trailing `:LANG` suffix; EN (the default) is omitted.
 * @returns Display label: "{short_code}:{finish}:{promo_type_slug|}[:LANG]"
 */
export function formatPrintingLabel(
  shortCode: string,
  promoTypeSlug: string | null,
  finish: string,
  language?: string | null,
): string {
  const base = `${shortCode}:${finish}:${promoTypeSlug ?? ""}`;
  if (language && language !== "EN") {
    return `${base}:${language}`;
  }
  return base;
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

export interface ComparablePrinting {
  setId?: string | null;
  setOrder?: number;
  shortCode: string;
  promoTypeSlug?: string | null;
  finish?: string;
}

/**
 * Compare two printings for canonical ordering.
 * Sort order:
 *   1. Set release date (by `setOrder` when available, else `setId` string)
 *   2. Short code (alphabetical — base variants sort before alt-art/overnumbered)
 *   3. Non-promo first
 *   4. Normal finish before foil
 * Use as a comparator for `.sort()` to get canonical printing order.
 *
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
export function comparePrintings(
  a: ComparablePrinting,
  b: ComparablePrinting,
  finishOrder: readonly string[] = DEFAULT_ENUM_ORDERS.finishes,
): number {
  const aFinishIdx = finishOrder.indexOf(a.finish ?? "");
  const bFinishIdx = finishOrder.indexOf(b.finish ?? "");
  const setCompare =
    a.setOrder !== undefined && b.setOrder !== undefined
      ? a.setOrder - b.setOrder
      : (a.setId ?? "").localeCompare(b.setId ?? "");
  // Unknown finishes (not in order) sort after known ones; two unknowns are equal.
  const finishCompare =
    aFinishIdx === -1 && bFinishIdx === -1
      ? 0
      : aFinishIdx === -1
        ? 1
        : bFinishIdx === -1
          ? -1
          : aFinishIdx - bFinishIdx;
  return (
    setCompare ||
    a.shortCode.localeCompare(b.shortCode) ||
    Number(Boolean(a.promoTypeSlug)) - Number(Boolean(b.promoTypeSlug)) ||
    finishCompare
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
    min: Math.floor(Math.min(...vals)),
    max: Math.ceil(Math.max(...vals)),
  };
}

export function getOrientation(type: CardType): "portrait" | "landscape" {
  return type === WellKnown.cardType.BATTLEFIELD ? "landscape" : "portrait";
}

/**
 * Extract the card ID prefix from a short code by stripping any trailing
 * lowercase letters or asterisks after the last digit.
 * E.g. "OGN-027a" → "OGN-027", "OGN-027*" → "OGN-027", "OGN-027" → "OGN-027".
 *
 * @returns The short code with its variant/promo suffix removed.
 */
export function extractCardIdFromShortCode(shortCode: string): string {
  return shortCode.replace(/(?<=\d)[a-z*]+$/, "");
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
 * Deduplicate and alpha-sort short codes as "OGN-027, OGN-027a ×2" entries.
 * @returns An array of formatted entries, or `[]` if the input is empty.
 */
export function formatShortCodesArray(ids: string[]): string[] {
  if (ids.length === 0) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => (n > 1 ? `${id} ×${n}` : id));
}

/**
 * Format short codes as "OGN-027, OGN-027a ×2" (counted + alpha-sorted).
 * @returns A formatted string, or `""` if the array is empty.
 */
export function formatShortCodes(ids: string[]): string {
  return formatShortCodesArray(ids).join(", ");
}
