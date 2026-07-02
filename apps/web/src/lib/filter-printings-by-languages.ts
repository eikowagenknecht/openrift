import type { Printing } from "@openrift/shared";

/**
 * Restricts a `printingsByCardId` map to the given languages. An empty language
 * list means "show all" — the same convention as the rest of the filter
 * pipeline.
 * @returns A filtered map; cards with no printing in any listed language are
 * dropped, and the surviving printings keep their original order.
 */
export function filterPrintingsByLanguages(
  source: ReadonlyMap<string, Printing[]>,
  languages: readonly string[],
): Map<string, Printing[]> {
  if (languages.length === 0) {
    return new Map(source);
  }
  const allowed = new Set(languages);
  const result = new Map<string, Printing[]>();
  for (const [cardId, printings] of source) {
    const filtered = printings.filter((printing) => allowed.has(printing.language));
    if (filtered.length > 0) {
      result.set(cardId, filtered);
    }
  }
  return result;
}
