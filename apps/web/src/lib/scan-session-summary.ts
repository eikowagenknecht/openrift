import type { Printing } from "@openrift/shared/types/catalog";

export interface ScanSummaryRow {
  printing: Printing;
  count: number;
}

export interface ScanSessionSummaryData {
  cards: number;
  totalValue: number;
  unpricedCards: number;
  wishedCards: number;
  newCards: number | null;
}

interface ScanSummaryDeps {
  priceOf: (printingId: string) => number | undefined;
  isWished: (cardId: string, printingId: string) => boolean;
  ownedBefore: ((printingId: string) => number) | null;
}

export function computeScanSessionSummary(
  rows: readonly ScanSummaryRow[],
  deps: ScanSummaryDeps,
): ScanSessionSummaryData {
  let cards = 0;
  let totalValue = 0;
  let unpricedCards = 0;
  let wishedCards = 0;
  let newCards = 0;

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
  };
}
