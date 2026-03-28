import type { Printing } from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared";

interface QuickAddCardResult {
  /** The card ID shared by all printings in this group. */
  cardId: string;
  cardName: string;
  /** The "default" printing — first canonical printing (normal finish, normal art, earliest set). */
  defaultPrinting: Printing;
  /** All printings for this card, sorted by canonical order. */
  printings: Printing[];
  /** Total owned across all printings of this card, if available. */
  ownedCount: number;
}

/**
 * Searches the catalog by card name and returns grouped, ranked results.
 * All filtering is client-side against the in-memory catalog.
 * @returns Up to `limit` card results ranked by match quality.
 */
export function searchCards(
  query: string,
  printingsByCardId: Map<string, Printing[]>,
  ownedCountByPrinting?: Record<string, number>,
  limit = 8,
): QuickAddCardResult[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const normalizedQuery = normalizeNameForMatching(trimmed);
  if (normalizedQuery.length === 0) {
    return [];
  }

  const results: { result: QuickAddCardResult; rank: number }[] = [];

  for (const [cardId, printings] of printingsByCardId) {
    if (printings.length === 0) {
      continue;
    }
    const cardName = printings[0].card.name;
    const normalizedName = normalizeNameForMatching(cardName);

    let rank: number;
    if (normalizedName === normalizedQuery) {
      // Exact match
      rank = 0;
    } else if (normalizedName.startsWith(normalizedQuery)) {
      // Prefix match
      rank = 1;
    } else {
      // Word-boundary match: check if any word in the name starts with the query
      const words = cardName.toLowerCase().split(/\s+/);
      const queryLower = trimmed.toLowerCase();
      if (words.some((word) => word.startsWith(queryLower))) {
        rank = 2;
      } else if (normalizedName.includes(normalizedQuery)) {
        // Substring match
        rank = 3;
      } else {
        continue;
      }
    }

    let ownedCount = 0;
    if (ownedCountByPrinting) {
      for (const printing of printings) {
        ownedCount += ownedCountByPrinting[printing.id] ?? 0;
      }
    }

    results.push({
      result: {
        cardId,
        cardName,
        defaultPrinting: printings[0],
        printings,
        ownedCount,
      },
      rank,
    });
  }

  results.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return a.result.cardName.localeCompare(b.result.cardName);
  });

  return results.slice(0, limit).map((entry) => entry.result);
}
