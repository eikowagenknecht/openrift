import { HandIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Pressable } from "@/components/ui/pressable";
import { CARD_BORDER_RADIUS } from "@/features/cards/lib/card-grid-constants";
import type { HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { cardHoverProps } from "@/features/cards/lib/card-row-interactions";
import type { BenchState } from "@/features/decks/lib/deck-bench-pool";
import { formatChancePct } from "@/features/decks/lib/deck-draw-odds";
import type { LibraryHitChance } from "@/features/decks/lib/deck-hand-odds";
import { shortGroupLabel } from "@/features/decks/lib/deck-hand-odds";
import { cn } from "@/lib/utils";

function LibraryOddsLine({
  lead,
  rows,
  emptyLabel,
}: {
  lead: string;
  rows: readonly LibraryHitChance[];
  emptyLabel?: string;
}) {
  if (rows.length === 0 && emptyLabel === undefined) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-2xs">
      {lead}{" "}
      {rows.length === 0
        ? emptyLabel
        : rows.map((row, index) => (
            <span key={row.key}>
              {index > 0 && " · "}
              <span className="tabular-nums">{formatChancePct(row.chance)}</span>{" "}
              {shortGroupLabel(row.label)}
            </span>
          ))}
    </p>
  );
}

interface DeckBenchHandProps {
  bench: BenchState | null;
  selected: ReadonlySet<string>;
  poolSize: number;
  mulliganRows: readonly LibraryHitChance[];
  nextCardRows: readonly LibraryHitChance[];
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  onHoverCard?: HoverHandler;
  onDrawHand: () => void;
  onMulligan: () => void;
  onDrawNext: () => void;
  onToggleSelected: (key: string) => void;
}

export function DeckBenchHand({
  bench,
  selected,
  poolSize,
  mulliganRows,
  nextCardRows,
  getThumbnail,
  onHoverCard,
  onDrawHand,
  onMulligan,
  onDrawNext,
  onToggleSelected,
}: DeckBenchHandProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={bench ? "outline" : "default"}
          onClick={onDrawHand}
          disabled={poolSize === 0}
          aria-keyshortcuts="N"
        >
          {bench ? <RotateCcwIcon className="size-4" /> : <HandIcon className="size-4" />}
          Draw a hand
          <Kbd
            className={cn(
              "max-sm:hidden",
              !bench && "bg-primary-foreground/20 text-primary-foreground",
            )}
          >
            N
          </Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onMulligan}
          disabled={!bench || bench.mulliganUsed || bench.hasDrawn || selected.size === 0}
          aria-keyshortcuts="M"
        >
          Mulligan
          <Kbd className="max-sm:hidden">M</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDrawNext}
          disabled={!bench || bench.library.length === 0}
          aria-keyshortcuts="D"
        >
          Draw a card
          <Kbd className="max-sm:hidden">D</Kbd>
        </Button>
        {bench && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {bench.library.length} left in deck
          </span>
        )}
      </div>
      {bench ? (
        <div className="flex flex-wrap items-start gap-2">
          {bench.hand.map((card) => {
            const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
            const isSelected = selected.has(card.key);
            const canMulligan = !bench.mulliganUsed && !bench.hasDrawn;
            return (
              <Pressable
                key={card.key}
                {...cardHoverProps(onHoverCard, card.cardId, card.preferredPrintingId)}
                onClick={() => onToggleSelected(card.key)}
                aria-pressed={isSelected}
                aria-label={canMulligan ? `${card.cardName} — select to mulligan` : card.cardName}
                style={{ borderRadius: CARD_BORDER_RADIUS }}
                className={cn(
                  "transition-transform",
                  canMulligan && "hover:-translate-y-1",
                  isSelected && "ring-primary ring-offset-background ring-2 ring-offset-2",
                )}
              >
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt={card.cardName}
                    style={{ borderRadius: CARD_BORDER_RADIUS }}
                    className="aspect-card h-40 object-cover shadow-sm sm:h-48"
                    draggable={false}
                  />
                ) : (
                  <span
                    style={{ borderRadius: CARD_BORDER_RADIUS }}
                    className="aspect-card border-muted-foreground/25 flex h-40 items-center justify-center border border-dashed p-2 text-center text-xs sm:h-48"
                  >
                    {card.cardName}
                  </span>
                )}
              </Pressable>
            );
          })}
        </div>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
          Draw a sample hand to see how the deck opens.
        </div>
      )}
      {bench && selected.size > 0 && (
        <LibraryOddsLine
          lead={`Exchanging ${selected.size}:`}
          rows={mulliganRows}
          emptyLabel="nothing left to look for, this hand covers every group."
        />
      )}
      {bench && selected.size === 0 && bench.library.length > 0 && (
        <LibraryOddsLine lead="Next card:" rows={nextCardRows} />
      )}
    </>
  );
}
