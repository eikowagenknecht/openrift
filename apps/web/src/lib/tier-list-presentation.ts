import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import type { PresentationItem } from "@/lib/presentation-queue";

/**
 * A board resolved against the catalogue, as {@link resolveTierRows} returns it.
 * Named here so the presentation helpers can talk about boards without pulling
 * the board components in.
 */
export interface ResolvedTierRow {
  label: string;
  cards: TierCardView[];
  /** The grey "considered and cut" row, always the last one. */
  unranked?: boolean;
}

/**
 * Which end of the ladder a run starts at.
 *
 * `best-first` reads the board the way it is written, top row down.
 * `worst-first` is how a ranking video is usually paced: start at the bottom and
 * climb, so the card everyone came to argue about lands last.
 */
export type TierQueueDirection = "best-first" | "worst-first";

/** One stop in a tier-list run, carrying where on the board it belongs. */
export interface TierQueueStop extends PresentationItem {
  /** Index of the board row holding this card. */
  rowIndex: number;
  /** Position within that row, left to right. */
  position: number;
}

/**
 * The stable key for one slot on the board.
 *
 * Board coordinates rather than the printing id alone: a card can only sit in
 * one tier, but keying on the slot keeps the id unique even if the same art
 * were ever pinned to two entries.
 *
 * @returns The stop id for that slot.
 */
function stopId(rowIndex: number, position: number, printingId: string): string {
  return `${rowIndex}:${position}:${printingId}`;
}

/**
 * Flattens a resolved board into a presentation queue.
 *
 * Cards with no printing to draw are dropped rather than queued as a blank
 * stage, matching what the board itself does with ids that no longer resolve.
 * Each stop carries its tier label as the corner marker's context, and its board
 * coordinates so the board modes can find its slot again.
 *
 * @returns The stops, in the order the run walks them.
 */
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

/**
 * The board as it stands partway through a reveal: every card the run has
 * already placed, each still in its own row and in board order.
 *
 * `count` is how many stops have been placed, so the card at the current index
 * is deliberately *not* included — it is up on the stage waiting to be dropped
 * in, which is the beat the whole reveal exists for. Empty rows stay, because a
 * tier the run hasn't reached yet still has to hold its place on the ladder.
 *
 * @returns The rows, holding only the cards revealed so far.
 */
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
