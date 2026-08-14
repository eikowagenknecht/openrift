import type { Card, Printing, TierRow } from "@openrift/shared";
import { TIER_LABEL_INK, tierColor } from "@openrift/shared";
import type { ReactNode } from "react";

import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import {
  TierCardTile,
  tierRowMinHeight,
  useTierTileWidth,
} from "@/components/tier-lists/tier-card-tile";
import { Pressable } from "@/components/ui/pressable";
import { cn } from "@/lib/utils";

/**
 * Resolves a board's entries against the catalogue. Ids that no longer resolve
 * (a card pulled from the catalogue after the list was saved) are dropped
 * rather than rendered as blanks, matching what the share image does.
 *
 * The art comes from the entry's pinned printing when the creator chose one and
 * it still exists, so a board built out of alt arts keeps them; otherwise it
 * falls back to the first printing, which is already sorted by the viewer's
 * languages and canonical rank.
 * @returns The rows with their cards resolved, in board order.
 */
export function resolveTierRows(
  rows: readonly TierRow[],
  cardsById: Record<string, Card>,
  printingsByCardId: Map<string, Printing[]>,
): { label: string; cards: TierCardView[] }[] {
  return rows.map((row) => ({
    label: row.label,
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

interface TierRowFrameProps {
  rowIndex: number;
  /** The label chip. Static text on a read-only board, a rename control in the builder. */
  label: ReactNode;
  /** Controls shown before the label chip (e.g. the builder's drag handle). */
  leading?: ReactNode;
  /** Row-level controls (reorder grip, remove) shown after the card strip. */
  trailing?: ReactNode;
  /** Set while a drag is hovering this row. */
  active?: boolean;
  children: ReactNode;
}

/**
 * The chrome every board row shares: the coloured label chip, the card strip,
 * and an optional trailing control cluster. Both the read-only board and the
 * builder compose this, so a row looks identical on the share page and in the
 * editor — which matters, because the editor is what gets screen-captured.
 *
 * The strip's minimum height is derived from the tile size rather than picked,
 * so an empty tier is exactly as tall as a full one and dropping the first card
 * into it doesn't resize the row under the pointer.
 *
 * @returns The row frame node.
 */
export function TierRowFrame({
  rowIndex,
  label,
  leading,
  trailing,
  active,
  children,
}: TierRowFrameProps) {
  const tileWidth = useTierTileWidth();

  return (
    <div
      className={cn(
        "bg-card/40 flex items-stretch overflow-hidden rounded-md ring-1 transition-colors",
        active ? "ring-ring ring-2" : "ring-border",
      )}
    >
      {leading}
      <div
        // wrap-anywhere, not truncate: a renamed tier ("Absolutely broken")
        // should read on more than one line rather than lose its tail.
        className="flex w-12 shrink-0 items-center justify-center px-1 text-center font-bold wrap-anywhere sm:w-14"
        style={{ backgroundColor: tierColor(rowIndex), color: TIER_LABEL_INK }}
      >
        {label}
      </div>
      <div
        className="flex min-w-0 flex-1 flex-wrap content-center items-center gap-1 p-1"
        style={{ minHeight: tierRowMinHeight(tileWidth) }}
      >
        {children}
      </div>
      {trailing}
    </div>
  );
}

interface TierBoardProps {
  rows: readonly { label: string; cards: TierCardView[] }[];
  /** Called when a tile is clicked; opens the card detail on the share page. */
  onCardClick?: (view: TierCardView) => void;
  className?: string;
}

/**
 * Read-only board. Used by the public share page and anywhere the ranking is
 * shown rather than edited. Empty rows are drawn — a deliberately empty bottom
 * tier is a statement about the set, not missing data.
 *
 * @returns The board node.
 */
export function TierBoard({ rows, onCardClick, className }: TierBoardProps) {
  const tileWidth = useTierTileWidth();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {rows.map((row, rowIndex) => (
        <TierRowFrame key={rowIndex} rowIndex={rowIndex} label={row.label}>
          {row.cards.length === 0 ? (
            <span className="text-muted-foreground px-1 text-sm italic">Nothing here</span>
          ) : (
            row.cards.map((view) =>
              onCardClick ? (
                <TierBoardCardButton
                  key={view.cardId}
                  view={view}
                  width={tileWidth}
                  onClick={onCardClick}
                />
              ) : (
                <TierCardTile key={view.cardId} view={view} width={tileWidth} />
              ),
            )
          )}
        </TierRowFrame>
      ))}
    </div>
  );
}

function TierBoardCardButton({
  view,
  width,
  onClick,
}: {
  view: TierCardView;
  width: number;
  onClick: (view: TierCardView) => void;
}) {
  return (
    <Pressable aria-label={view.card.name} className="rounded-sm" onClick={() => onClick(view)}>
      <TierCardTile view={view} width={width} />
    </Pressable>
  );
}
