import type { Printing } from "@openrift/shared";
import { foldForSearch, legendDisplayName, squashForSearch } from "@openrift/shared";

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

interface SearchCardsOptions {
  ownedCountByPrinting?: Record<string, number>;
  /**
   * Optional allowlist of language codes — when provided, each card's
   * printings are narrowed to this set and cards with no remaining printings
   * are dropped. Used to honor the user's profile language preference in the
   * Quick Add palette on routes that don't seed it into the URL filter.
   */
  preferredLanguages?: readonly string[];
  limit?: number;
}

/**
 * Searches the catalog by card name and returns grouped, ranked results.
 * All filtering is client-side against the in-memory catalog.
 * @returns Up to `options.limit` card results ranked by match quality.
 */
export function searchCards(
  query: string,
  printingsByCardId: Map<string, Printing[]>,
  options: SearchCardsOptions = {},
): QuickAddCardResult[] {
  const { ownedCountByPrinting, preferredLanguages, limit = 8 } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const normalizedQuery = squashForSearch(trimmed);
  if (normalizedQuery.length === 0) {
    return [];
  }
  const foldedQuery = foldForSearch(trimmed);

  const languageAllowlist =
    preferredLanguages && preferredLanguages.length > 0 ? new Set(preferredLanguages) : null;

  const results: { result: QuickAddCardResult; rank: number }[] = [];

  for (const [cardId, allPrintings] of printingsByCardId) {
    const printings = languageAllowlist
      ? allPrintings.filter((p) => languageAllowlist.has(p.language))
      : allPrintings;
    if (printings.length === 0) {
      continue;
    }
    // Match and display by the colloquial Legend name ("Azir, Emperor of the
    // Sands") so typing the champion finds it; non-Legends are unchanged.
    const cardName = legendDisplayName(printings[0].card);
    const normalizedName = squashForSearch(cardName);

    let rank: number;
    if (normalizedName === normalizedQuery) {
      // Exact match
      rank = 0;
    } else if (normalizedName.startsWith(normalizedQuery)) {
      // Prefix match
      rank = 1;
    } else {
      // Word-boundary match: check if any word in the name starts with the query.
      // Compared on the folded forms, so a typed "kai'sa" lines up with the
      // stored "Kai’Sa" here the same way it does for the ranks above.
      const words = foldForSearch(cardName).split(" ");
      if (words.some((word) => word.startsWith(foldedQuery))) {
        rank = 2;
      } else if (normalizedName.includes(normalizedQuery)) {
        // Substring match
        rank = 3;
      } else if (printings.some((p) => squashForSearch(p.shortCode).includes(normalizedQuery))) {
        // Short code match (e.g. "OGN-042", "ogn042" or just "042")
        rank = 4;
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
