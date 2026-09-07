import type { Card, Printing, TierRow } from "@openrift/shared";

import type { PresentationItem } from "@/lib/presentation-queue";

export interface TierCardView {
  cardId: string;
  card: Card;
  printing: Printing | undefined;
  pinnedPrintingId: string | null;
}

export interface ResolvedTierRow {
  label: string;
  cards: TierCardView[];
  unranked?: boolean;
}

export type TierQueueDirection = "best-first" | "worst-first";

export interface TierQueueStop extends PresentationItem {
  rowIndex: number;
  position: number;
}

// Board coordinates, not the printing id alone, keep a stop's id unique even
// if the same art were ever pinned to two entries.
function stopId(rowIndex: number, position: number, printingId: string): string {
  return `${rowIndex}:${position}:${printingId}`;
}

export function tierRowsToQueue(
  rows: readonly ResolvedTierRow[],
  direction: TierQueueDirection = "best-first",
): TierQueueStop[] {
  // Pair each row with its real board index before reordering, so a worst-first
  // run still places and colours its cards by where they actually rank.
  const indexed = rows.map((row, rowIndex) => ({ row, rowIndex }));
  const ordered = direction === "worst-first" ? indexed.toReversed() : indexed;

  return ordered.flatMap(({ row, rowIndex }) =>
    row.cards.flatMap((view, position): TierQueueStop[] =>
      view.printing
        ? [
            {
              id: stopId(rowIndex, position, view.printing.id),
              printing: view.printing,
              contextLabel: row.label,
              rowIndex,
              position,
            },
          ]
        : [],
    ),
  );
}

// The stage and the OBS overlay draw the same board, so this count has to
// mean the same thing on both: in a reveal, the card at the current stop is
// up on the stage, not yet in its tier, so the board behind it holds `index`
// cards. Without a reveal the whole ranking is up already.
export function boardRevealCount({
  reveal,
  index,
  total,
}: {
  reveal: boolean;
  index: number;
  total: number;
}): number {
  if (!reveal) {
    return total;
  }
  return Math.min(Math.max(index, 0), Math.max(total, 0));
}

// `count` stops are placed; the card at the current index is deliberately not
// included, since it's up on the stage waiting to be dropped in. Empty rows
// stay so a tier the run hasn't reached yet still holds its place.
export function revealedRows(
  rows: readonly ResolvedTierRow[],
  queue: readonly TierQueueStop[],
  count: number,
): ResolvedTierRow[] {
  const placed = new Set(queue.slice(0, Math.max(count, 0)).map((stop) => stop.id));
  return rows.map((row, rowIndex) => ({
    ...row,
    cards: row.cards.filter((view, position) =>
      view.printing ? placed.has(stopId(rowIndex, position, view.printing.id)) : false,
    ),
  }));
}

/** Cards whose id no longer resolves against the catalogue are dropped, not rendered blank. */
export function resolveTierRows(
  rows: readonly TierRow[],
  cardsById: Record<string, Card>,
  printingsByCardId: Map<string, Printing[]>,
): ResolvedTierRow[] {
  return rows.map((row) => ({
    label: row.label,
    unranked: row.unranked === true,
    cards: row.cards.flatMap((entry) => {
      const card = cardsById[entry.cardId];
      if (!card) {
        return [];
      }
      const printings = printingsByCardId.get(entry.cardId);
      const pinned = entry.printingId
        ? printings?.find((printing) => printing.id === entry.printingId)
        : undefined;
      return [
        {
          cardId: entry.cardId,
          card,
          printing: pinned ?? printings?.[0],
          pinnedPrintingId: entry.printingId,
        },
      ];
    }),
  }));
}
