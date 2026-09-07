import type { Printing, SearchablePrintingCodes } from "@openrift/shared";
import {
  buildCardIndex,
  cardSearchAltNames,
  legendDisplayName,
  searchCards,
} from "@openrift/shared";
import { useMemo } from "react";

import type { QuickAddCardResult } from "@/lib/quick-add-result";

interface QuickAddSearchOptions {
  ownedCountByPrinting?: Record<string, number>;
  preferredLanguages?: readonly string[];
  limit?: number;
}

const DEFAULT_LIMIT = 8;

/** One row per card, carrying its printings so the palette can expand without a second lookup. */
interface QuickAddRow {
  id: string;
  slug: string;
  name: string;
  altNames: string[];
  printings: Printing[];
}

/**
 * Ranking uses the app-wide matcher (`@openrift/shared/card-search`), so
 * results order the same way here as in every other picker.
 */
export function useQuickAddSearch(
  query: string,
  printingsByCardId: Map<string, Printing[]>,
  options: QuickAddSearchOptions = {},
): QuickAddCardResult[] {
  const { ownedCountByPrinting, preferredLanguages, limit = DEFAULT_LIMIT } = options;

  // Must be a joined string, not an array: a caller rebuilding the list each render
  // would otherwise invalidate the index on every keystroke.
  const languageKey = preferredLanguages?.join(",") ?? "";

  const index = useMemo(() => {
    const allowlist = languageKey === "" ? null : new Set(languageKey.split(","));
    const rows: QuickAddRow[] = [];
    const codes = new Map<string, SearchablePrintingCodes[]>();
    for (const [cardId, allPrintings] of printingsByCardId) {
      const printings = allowlist
        ? allPrintings.filter((printing) => allowlist.has(printing.language))
        : allPrintings;
      const first = printings[0];
      if (!first) {
        continue;
      }
      rows.push({
        id: cardId,
        slug: cardId,
        name: legendDisplayName(first.card),
        altNames: cardSearchAltNames(
          first.card,
          printings.map((printing) => printing.printedName),
        ),
        printings,
      });
      codes.set(
        cardId,
        printings.map((printing) => ({
          shortCode: printing.shortCode,
          publicCode: printing.publicCode,
        })),
      );
    }
    return buildCardIndex(rows, codes);
  }, [printingsByCardId, languageKey]);

  return useMemo(() => {
    if (query.trim() === "") {
      return [];
    }
    return searchCards(index, query, limit).map((row) => {
      let ownedCount = 0;
      if (ownedCountByPrinting) {
        for (const printing of row.printings) {
          ownedCount += ownedCountByPrinting[printing.id] ?? 0;
        }
      }
      return {
        cardId: row.id,
        cardName: row.name,
        // A row only exists when it has at least one printing, so this is safe.
        defaultPrinting: row.printings[0] as Printing,
        printings: row.printings,
        ownedCount,
      };
    });
  }, [index, query, limit, ownedCountByPrinting]);
}
