import { WellKnown } from "@openrift/shared/well-known";
import type { ReactNode } from "react";

import type { CardOpenTarget, HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps } from "@/features/cards/lib/card-row-interactions";
import type { DrawOddsRow } from "@/features/decks/lib/deck-draw-odds";
import { formatChancePct } from "@/features/decks/lib/deck-draw-odds";
import type { OddsGroupRow } from "@/features/decks/lib/deck-odds-groups";
import { oddsRowTitle } from "@/features/decks/lib/deck-odds-row-title";
import { cn } from "@/lib/utils";

function InHandDot({ inHand }: { inHand: number }) {
  if (inHand === 0) {
    return null;
  }
  return (
    <span aria-hidden className="bg-primary mr-1 inline-block size-1.5 rounded-full align-middle" />
  );
}

interface DeckDrawOddsPanelProps {
  picker: ReactNode;
  oddsRows: DrawOddsRow[];
  groupRows: OddsGroupRow[];
  inHandGroupCounts: ReadonlyMap<string, number>;
  inHandCounts: ReadonlyMap<string, string[]>;
  printingByCardId: ReadonlyMap<string, string | null>;
  showHandDots: boolean;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
}

export function DeckDrawOddsPanel({
  picker,
  oddsRows,
  groupRows,
  inHandGroupCounts,
  inHandCounts,
  printingByCardId,
  showHandDots,
  onHoverCard,
  onCardClick,
}: DeckDrawOddsPanelProps) {
  return (
    <div>
      <div className="text-muted-foreground text-2xs mb-1.5 flex items-center font-semibold tracking-wide uppercase">
        Draw odds
        {picker}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="px-2 py-1.5 text-left font-medium">Card</th>
              <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">Hand</th>
              <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">First 7</th>
            </tr>
          </thead>
          <tbody>
            {/* Group rows first, then per-card rows below. */}
            {groupRows.map((row) => {
              const inHand = inHandGroupCounts.get(row.key) ?? 0;
              return (
                <tr key={row.key} className="bg-muted/50 border-t">
                  <td
                    className="max-w-0 truncate px-2 py-1"
                    title={oddsRowTitle(row.label, inHand)}
                  >
                    <InHandDot inHand={inHand} />
                    {row.label}{" "}
                    <span className="text-muted-foreground tabular-nums">· {row.copies}</span>
                  </td>
                  <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {formatChancePct(row.openingChance)}
                  </td>
                  <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {formatChancePct(row.earlyChance)}
                  </td>
                </tr>
              );
            })}
            {oddsRows.map((row) => {
              const preferredPrintingId = printingByCardId.get(row.cardId) ?? null;
              const inHand = inHandCounts.get(row.cardId)?.length ?? 0;
              const openCard = onCardClick
                ? () =>
                    onCardClick({
                      cardId: row.cardId,
                      preferredPrintingId,
                      zone: WellKnown.deckZone.MAIN,
                    })
                : undefined;
              return (
                <tr
                  key={row.cardId}
                  className={cn("border-t", openCard && "hover:bg-muted/50 cursor-pointer")}
                  {...cardHoverProps(onHoverCard, row.cardId, preferredPrintingId)}
                  {...rowActivateProps(openCard)}
                >
                  <td
                    className="max-w-0 truncate px-2 py-1"
                    title={oddsRowTitle(row.cardName, inHand)}
                  >
                    <InHandDot inHand={inHand} />
                    <span className="text-muted-foreground tabular-nums">{row.copies}×</span>{" "}
                    {row.cardName}
                  </td>
                  <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {formatChancePct(row.openingChance)}
                  </td>
                  <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {formatChancePct(row.earlyChance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-2xs mt-1.5">
        Chance of at least one copy in your opening hand, and anywhere in your first 7 cards.
      </p>
      {showHandDots && (
        <p className="text-muted-foreground text-2xs">Dots show what you hit in the sample hand.</p>
      )}
    </div>
  );
}
