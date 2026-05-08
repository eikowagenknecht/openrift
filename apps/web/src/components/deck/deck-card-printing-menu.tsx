import type { Printing } from "@openrift/shared";
import type { MouseEvent, ReactNode } from "react";
import { useRef } from "react";

import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { PrintingOptionContent } from "@/components/cards/printing-option-content";
import { usePrintingHover } from "@/components/cards/use-printing-hover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCards } from "@/hooks/use-cards";
import { useDeckBuilderActions } from "@/hooks/use-deck-builder";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface DeckCardPrintingMenuProps {
  deckId: string;
  card: DeckBuilderCard;
  children: ReactNode;
}

/**
 * Right-click menu for a deck row: lists available printings with thumbnails
 * and a large hover preview anchored beside the menu. Click a printing to
 * convert every copy in this row; shift-click to split off a single copy.
 * @returns The wrapped children with the context menu attached.
 */
export function DeckCardPrintingMenu({ deckId, card, children }: DeckCardPrintingMenuProps) {
  const { changePreferredPrinting } = useDeckBuilderActions(deckId);
  const { printingsByCardId } = useCards();
  const languages = useDisplayStore((state) => state.languages);
  const allPrintings = printingsByCardId.get(card.cardId) ?? [];
  // Filter to the user's preferred languages, but always keep the currently
  // pinned printing visible even if its language is outside the filter.
  const printings =
    languages && languages.length > 0
      ? allPrintings.filter(
          (printing) =>
            languages.includes(printing.language) || printing.id === card.preferredPrintingId,
        )
      : allPrintings;
  const { hoveredId, onEnter, onLeave, reset } = usePrintingHover();
  const popupRef = useRef<HTMLDivElement>(null);

  if (printings.length === 0) {
    return children;
  }

  const handleSelect = (printing: Printing, event: MouseEvent) => {
    const isShift = event.shiftKey;
    // Shift-click on a row with >1 copies splits off one copy to the target.
    // Otherwise convert the whole row.
    const count = isShift && card.quantity > 1 ? 1 : card.quantity;
    changePreferredPrinting(card.cardId, card.zone, card.preferredPrintingId, printing.id, count);
  };

  const hoveredPrinting = hoveredId ? printings.find((p) => p.id === hoveredId) : null;

  return (
    <ContextMenu onOpenChange={(open) => !open && reset()}>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent ref={popupRef} className="max-h-[70vh] w-72 overflow-y-auto">
        <div className="text-muted-foreground text-2xs px-1.5 pt-1 pb-1.5 font-medium tracking-wide uppercase">
          Change printing
          {card.quantity > 1 && (
            <span className="text-muted-foreground/70 ml-1 hidden normal-case md:inline">
              · shift-click to split 1
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          {printings.map((printing) => (
            <PrintingMenuItem
              key={printing.id}
              printing={printing}
              printings={printings}
              isActive={printing.id === card.preferredPrintingId}
              onSelect={handleSelect}
              onHoverEnter={onEnter}
              onHoverLeave={onLeave}
            />
          ))}
        </div>
      </ContextMenuContent>
      {hoveredPrinting && <PrintingHoverPreview printing={hoveredPrinting} anchorRef={popupRef} />}
    </ContextMenu>
  );
}

function PrintingMenuItem({
  printing,
  printings,
  isActive,
  onSelect,
  onHoverEnter,
  onHoverLeave,
}: {
  printing: Printing;
  printings: Printing[];
  isActive: boolean;
  onSelect: (printing: Printing, event: MouseEvent) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}) {
  return (
    <ContextMenuItem
      className={cn(isActive && "bg-muted ring-border ring-1")}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(printing, event);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          onHoverEnter(printing.id);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          onHoverLeave();
        }
      }}
    >
      <PrintingOptionContent printing={printing} siblings={printings} />
    </ContextMenuItem>
  );
}
