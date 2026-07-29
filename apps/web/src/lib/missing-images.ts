import type { MissingImageCard } from "@openrift/shared";

export interface MissingImageLanguageSummary {
  language: string;
  /** Printings of that language without an active front image. */
  printings: number;
  /** Cards that miss at least one printing of that language. */
  cards: number;
}

/**
 * Sorts language codes by the catalogue order from /init, with unknown codes
 * last (alphabetically among themselves) so a language missing from the enum
 * still shows up.
 * @param codes — the language codes to sort
 * @param order — language codes in catalogue order
 * @returns A new array of codes in display order.
 */
function sortByCatalogueOrder(codes: string[], order: string[]): string[] {
  const rank = new Map(order.map((code, index) => [code, index]));
  return codes.toSorted((a, b) => {
    const rankA = rank.get(a) ?? Number.POSITIVE_INFINITY;
    const rankB = rank.get(b) ?? Number.POSITIVE_INFINITY;
    return rankA === rankB ? a.localeCompare(b) : rankA - rankB;
  });
}

/**
 * Aggregates per-card missing-image counts into one row per language.
 * @param cards — cards with per-language missing counts
 * @param languageOrder — language codes in catalogue order
 * @returns One summary per language that has at least one missing printing.
 */
export function summarizeMissingImagesByLanguage(
  cards: MissingImageCard[],
  languageOrder: string[],
): MissingImageLanguageSummary[] {
  const totals = new Map<string, MissingImageLanguageSummary>();
  for (const card of cards) {
    for (const entry of card.byLanguage) {
      const total = totals.get(entry.language) ?? {
        language: entry.language,
        printings: 0,
        cards: 0,
      };
      total.printings += entry.count;
      total.cards += 1;
      totals.set(entry.language, total);
    }
  }
  const order = sortByCatalogueOrder([...totals.keys()], languageOrder);
  return order.flatMap((language) => totals.get(language) ?? []);
}

/**
 * Narrows the card list to those missing at least one printing in `language`,
 * dropping the other languages from each card's breakdown.
 * @param cards — cards with per-language missing counts
 * @param language — the language code to keep, or null for no filtering
 * @returns The filtered cards, each carrying only the selected language.
 */
export function filterMissingImagesByLanguage(
  cards: MissingImageCard[],
  language: string | null,
): MissingImageCard[] {
  if (language === null) {
    return cards;
  }
  return cards
    .map((card) => ({
      ...card,
      byLanguage: card.byLanguage.filter((entry) => entry.language === language),
    }))
    .filter((card) => card.byLanguage.length > 0);
}
