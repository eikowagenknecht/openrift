import type { Printing, SearchablePrintingCodes } from "@openrift/shared";
import {
  buildCardIndex,
  cardSearchAltNames,
  legendDisplayName,
  searchCards,
} from "@openrift/shared";
import { useMemo } from "react";

export interface QuickAddCardResult {
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

interface QuickAddSearchOptions {
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

/** Default palette depth; a palette shows a short list, not the whole catalog. */
const DEFAULT_LIMIT = 8;

/**
 * One searchable row per card, carrying the card's printings so the palette can
 * expand a row without a second lookup.
 */
interface QuickAddRow {
  id: string;
  slug: string;
  name: string;
  altNames: string[];
  printings: Printing[];
}

/**
 * Searches the catalog by card name or printing code and returns grouped,
 * ranked results for the two command palettes (collection Quick Add, deck Quick
 * Add).
 *
 * Ranking is the app-wide matcher (`@openrift/shared/card-search`), the same one
 * behind every picker dropdown, so a query cannot order results one way here and
 * another in the deck plan editor. What stays local is the grouping: one row per
 * card with its printings and owned count attached, which is the shape a palette
 * row expands into.
 *
 * The index is memoized on the catalog (and the language allowlist, which
 * decides which cards exist at all), so typing re-ranks ready-made strings
 * instead of re-folding every name in the catalog per keystroke.
 *
 * @param query What the user typed; an empty query returns nothing.
 * @param printingsByCardId The catalog, identity-stable across keystrokes.
 * @param options Owned counts, language allowlist, and result cap.
 * @returns Up to `options.limit` card results, best match first.
 */
export function useQuickAddSearch(
  query: string,
  printingsByCardId: Map<string, Printing[]>,
  options: QuickAddSearchOptions = {},
): QuickAddCardResult[] {
  const { ownedCountByPrinting, preferredLanguages, limit = DEFAULT_LIMIT } = options;

  // Joined rather than passed as an array so a caller rebuilding the list each
  // render doesn't invalidate the index on every keystroke.
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
      // Display the colloquial Legend name ("Azir, Emperor of the Sands"), and
      // let the index match the stored name and every printed name as well.
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
