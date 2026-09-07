import type { Printing } from "@openrift/shared/types/catalog";
import type { MouseEvent, ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  PrintingChoiceMenuSection,
  PrintingChoicePreview,
  usePrintingChoiceHover,
} from "@/features/cards/components/printing-choice-menu";
import { usePrintingChoices } from "@/features/cards/hooks/use-printing-choices";
import { useDeckBuilderActions } from "@/features/decks/hooks/use-deck-builder";
import { useDeckDetail } from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { buildMoveRows, getAllowedMoveTargets } from "@/features/decks/lib/deck-builder-card";
import { ZONE_LABELS } from "@/features/decks/lib/deck-zone-labels";
import { useIsMobile } from "@/hooks/use-mobile";

interface DeckCardPrintingMenuProps {
  deckId: string;
  card: DeckBuilderCard;
  children: ReactNode;
}

function SplitHint({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground/70 ml-1 hidden normal-case md:inline">{children}</span>
  );
}

// On mobile (no drag, no shift key) a multi-copy row gets an extra "move 1" entry per zone.
export function DeckCardPrintingMenu({ deckId, card, children }: DeckCardPrintingMenuProps) {
  const { changePreferredPrinting, moveCard, moveOneCard } = useDeckBuilderActions(deckId);
  const isMobile = useIsMobile();
  const printings = usePrintingChoices(card.cardId, card.preferredPrintingId);
  const { hoveredId, popupRef, hoverProps, reset } = usePrintingChoiceHover();

  const { data: deckDetail } = useDeckDetail(deckId);
  const moveTargets = getAllowedMoveTargets(card, deckDetail.deck.format);
  const splitRowsShown = isMobile && card.quantity > 1;
  const moveRows = buildMoveRows(moveTargets, card.quantity, isMobile);

  if (printings.length === 0 && moveTargets.length === 0) {
    return children;
  }

  const countFor = (event: MouseEvent) => (event.shiftKey && card.quantity > 1 ? 1 : card.quantity);

  const handleSelect = (printing: Printing, event: MouseEvent) => {
    changePreferredPrinting(
      card.cardId,
      card.zone,
      card.preferredPrintingId,
      printing.id,
      countFor(event),
    );
  };

  // `null` clears the pinned printing so the row falls back to the language/set default.
  const handleSelectDefault = (event: MouseEvent) => {
    changePreferredPrinting(
      card.cardId,
      card.zone,
      card.preferredPrintingId,
      null,
      countFor(event),
    );
  };

  const handleMove = (targetZone: (typeof moveTargets)[number], splitOne: boolean) => {
    if (splitOne) {
      moveOneCard(card.cardId, card.zone, targetZone, card.preferredPrintingId);
    } else {
      moveCard(card.cardId, card.zone, targetZone, card.preferredPrintingId);
    }
  };

  return (
    <ContextMenu onOpenChange={(open) => !open && reset()}>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent ref={popupRef} className="max-h-[70vh] w-72 overflow-y-auto">
        {moveTargets.length > 0 && (
          <>
            <div className="text-muted-foreground text-2xs px-1.5 pt-1 pb-1.5 font-medium tracking-wide uppercase">
              Move to
              {card.quantity > 1 && <SplitHint>· shift-click to move 1</SplitHint>}
            </div>
            <div className="flex flex-col gap-0.5">
              {moveRows.map((row) => (
                <ContextMenuItem
                  key={`${row.zone}:${row.splitOne}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMove(row.zone, row.splitOne || (event.shiftKey && card.quantity > 1));
                  }}
                >
                  {ZONE_LABELS[row.zone]}
                  {splitRowsShown && (
                    <span className="text-muted-foreground/70 ml-1">
                      {row.splitOne ? "· move 1" : `· move all ${card.quantity}`}
                    </span>
                  )}
                </ContextMenuItem>
              ))}
            </div>
            {printings.length > 0 && <ContextMenuSeparator />}
          </>
        )}
        <PrintingChoiceMenuSection
          printings={printings}
          activePrintingId={card.preferredPrintingId}
          hoverProps={hoverProps}
          hint={card.quantity > 1 && <SplitHint>· shift-click to split 1</SplitHint>}
          onSelect={handleSelect}
          onSelectDefault={handleSelectDefault}
        />
      </ContextMenuContent>
      <PrintingChoicePreview hoveredId={hoveredId} printings={printings} anchorRef={popupRef} />
    </ContextMenu>
  );
}
