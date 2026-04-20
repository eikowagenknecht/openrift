import type { CardType, Printing } from "./types/index.js";
import { WellKnown } from "./well-known.js";

/**
 * Converts a card name to a URL-friendly slug.
 * Example: "Ahri, Alluring" → "ahri-alluring"
 * @returns A lowercase, hyphen-separated slug.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/-{2,}/g, "-")
    .replaceAll(/^-|-$/g, "");
}

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
 * Marker slugs are joined with `+` (e.g. `top-8+promo`) and the segment is
 * empty for unmarked printings.
 * @returns Display label: "{short_code}:{finish}:{marker_slugs|}[:LANG]"
 */
export function formatPrintingLabel(
  shortCode: string,
  markerSlugs: readonly string[],
  finish: string,
  language?: string | null,
): string {
  const base = `${shortCode}:${finish}:${markerSlugs.join("+")}`;
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

interface ComparablePrinting {
  setId?: string | null;
  setOrder?: number;
  shortCode: string;
  markerSlugs?: readonly string[];
  finish?: string;
}

/**
 * Compare two printings for canonical ordering.
 * Sort order:
 *   1. Set sort order from DB (by `setOrder` when available, else `setId` string)
 *   2. Short code (alphabetical — base variants sort before alt-art/overnumbered)
 *   3. Non-promo first
 *   4. Finish order from the DB `finishes.sort_order` (required — callers must
 *      thread the live order from `/api/enums` so admin re-ordering takes effect)
 * Use as a comparator for `.sort()` to get canonical printing order.
 *
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
export function comparePrintings(
  a: ComparablePrinting,
  b: ComparablePrinting,
  finishOrder: readonly string[],
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
  const aHasMarker = (a.markerSlugs?.length ?? 0) > 0;
  const bHasMarker = (b.markerSlugs?.length ?? 0) > 0;
  return (
    setCompare ||
    a.shortCode.localeCompare(b.shortCode) ||
    Number(aHasMarker) - Number(bHasMarker) ||
    finishCompare
  );
}

/**
 * Compare two printings with language preference as the primary tiebreaker.
 * Languages earlier in `languageOrder` sort first; unlisted languages sort
 * after listed ones. Falls back to `canonicalRank` — a single-integer key
 * encoding the remaining canonical axes (set, shortCode, marker, finish),
 * computed by the `printings_ordered` DB view.
 *
 * `languageOrder` is required and should be the effective order the caller
 * wants applied — either the user's preference or the DB's
 * `languages.sort_order` (from `/api/enums`) for the default case. There is
 * no hardcoded fallback: admin reorders of the `languages` table must take
 * effect, and that means the caller owns the choice.
 *
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
export function compareWithLanguagePreference(
  a: Printing,
  b: Printing,
  languageOrder: readonly string[],
): number {
  const aIdx = languageOrder.indexOf(a.language);
  const bIdx = languageOrder.indexOf(b.language);
  const aPos = aIdx === -1 ? languageOrder.length : aIdx;
  const bPos = bIdx === -1 ? languageOrder.length : bIdx;
  const langCompare = aPos - bPos;
  if (langCompare !== 0) {
    return langCompare;
  }
  // Both unlisted — sort alphabetically so the order is deterministic.
  if (aIdx === -1 && bIdx === -1) {
    const alphaCompare = a.language.localeCompare(b.language);
    if (alphaCompare !== 0) {
      return alphaCompare;
    }
  }
  return a.canonicalRank - b.canonicalRank;
}

/**
 * Deduplicate printings to one per card, keeping the best match per
 * {@link compareWithLanguagePreference} (language preference, then canonical rank).
 * @returns Deduplicated printings, one per cardId.
 */
export function deduplicateByCard(
  printings: Printing[],
  languageOrder: readonly string[],
): Printing[] {
  const seen = new Map<string, Printing>();
  for (const printing of printings) {
    const existing = seen.get(printing.cardId);
    if (existing) {
      if (compareWithLanguagePreference(printing, existing, languageOrder) < 0) {
        seen.set(printing.cardId, printing);
      }
    } else {
      seen.set(printing.cardId, printing);
    }
  }
  return [...seen.values()];
}

/**
 * Pick the single best printing for a card from a list of candidates,
 * respecting language preference and canonical ordering.
 * Use this whenever you need "the" printing to display for a card.
 * @returns The preferred printing, or `undefined` if the array is empty.
 */
export function preferredPrinting(
  printings: Printing[],
  languageOrder: readonly string[],
): Printing | undefined {
  if (printings.length === 0) {
    return undefined;
  }
  let best = printings[0];
  for (let i = 1; i < printings.length; i++) {
    if (compareWithLanguagePreference(printings[i], best, languageOrder) < 0) {
      best = printings[i];
    }
  }
  return best;
}

/**
 * Group all printings by cardId and sort each group by
 * {@link compareWithLanguagePreference}.
 * @returns A map from cardId to sorted printings.
 */
export function groupPrintingsByCardId(
  printings: Printing[],
  languageOrder: readonly string[],
): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const printing of printings) {
    let group = map.get(printing.cardId);
    if (!group) {
      group = [];
      map.set(printing.cardId, group);
    }
    group.push(printing);
  }
  for (const group of map.values()) {
    group.sort((a, b) => compareWithLanguagePreference(a, b, languageOrder));
  }
  return map;
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
 * Deduplicate short codes as "OGN-027, OGN-027a ×2" entries, preserving input order.
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
  return [...counts.entries()].map(([id, n]) => (n > 1 ? `${id} ×${n}` : id));
}

/**
 * Format short codes as "OGN-027, OGN-027a ×2" (counted, input order preserved).
 * @returns A formatted string, or `""` if the array is empty.
 */
export function formatShortCodes(ids: string[]): string {
  return formatShortCodesArray(ids).join(", ");
}
