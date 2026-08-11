import type { Printing } from "@openrift/shared";

/** One session row reduced to what the summary math needs. */
export interface ScanSummaryRow {
  printing: Printing;
  /** Physical cards this row stands for (copies plus identify-only readings). */
  count: number;
}

/** What a scan session amounted to, for the tray's summary line. */
export interface ScanSessionSummaryData {
  /** Total physical cards in the session. */
  cards: number;
  /** Sum of the headline prices of every priced card, in the marketplace's currency. */
  totalValue: number;
  /** Cards with no price at the chosen marketplace (never counted as zero). */
  unpricedCards: number;
  /** Cards matching at least one of the user's wish entries. */
  wishedCards: number;
  /**
   * Cards of printings the user owned no copy of before this session, or null
   * while ownership data has not loaded yet (unknown is not zero).
   */
  newCards: number | null;
  /** The single most valuable printing scanned, for the "best pull" line. */
  best: { printing: Printing; value: number } | null;
}

interface ScanSummaryDeps {
  /** Headline price of a printing at the chosen marketplace, if any. */
  priceOf: (printingId: string) => number | undefined;
  /** Whether the printing (or its card) sits on one of the user's wishlists. */
  isWished: (cardId: string, printingId: string) => boolean;
  /**
   * Copies of a printing owned before this session started, or null while the
   * ownership data is still loading.
   */
  ownedBefore: ((printingId: string) => number) | null;
}

/**
 * Reduce a scan session to the numbers that answer "was there anything good
 * in that pack": how much the cards are worth, how many are wanted, and how
 * many are new to the collection. Pure so the math is unit-testable without
 * the store or any query hook.
 *
 * @returns The session summary.
 */
export function computeScanSessionSummary(
  rows: readonly ScanSummaryRow[],
  deps: ScanSummaryDeps,
): ScanSessionSummaryData {
  let cards = 0;
  let totalValue = 0;
  let unpricedCards = 0;
  let wishedCards = 0;
  let newCards = 0;
  let best: { printing: Printing; value: number } | null = null;

  for (const row of rows) {
    if (row.count <= 0) {
      continue;
    }
    cards += row.count;
    const value = deps.priceOf(row.printing.id);
    if (value === undefined) {
      unpricedCards += row.count;
    } else {
      totalValue += value * row.count;
      if (best === null || value > best.value) {
        best = { printing: row.printing, value };
      }
    }
    if (deps.isWished(row.printing.cardId, row.printing.id)) {
      wishedCards += row.count;
    }
    if (deps.ownedBefore !== null && deps.ownedBefore(row.printing.id) === 0) {
      newCards += row.count;
    }
  }

  return {
    cards,
    totalValue,
    unpricedCards,
    wishedCards,
    newCards: deps.ownedBefore === null ? null : newCards,
    best,
  };
}
