import type { MissingImageCard } from "@openrift/shared/types/api/admin";

export interface MissingImageLanguageSummary {
  language: string;
  printings: number;
  cards: number;
}

/** Unknown codes sort last, alphabetically among themselves, so a language missing from the enum still shows up. */
function sortByCatalogueOrder(codes: string[], order: string[]): string[] {
  const rank = new Map(order.map((code, index) => [code, index]));
  return codes.toSorted((a, b) => {
    const rankA = rank.get(a) ?? Number.POSITIVE_INFINITY;
    const rankB = rank.get(b) ?? Number.POSITIVE_INFINITY;
    return rankA === rankB ? a.localeCompare(b) : rankA - rankB;
  });
}

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
