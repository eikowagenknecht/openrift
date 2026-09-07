import type { ReactNode } from "react";

import {
  PrintingChoiceMenuSection,
  PrintingChoicePreview,
  usePrintingChoiceHover,
} from "@/components/cards/printing-choice-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { usePrintingChoices } from "@/hooks/use-printing-choices";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

interface TierCardPrintingMenuProps {
  cardId: string;
  pinnedPrintingId: string | null;
  children: ReactNode;
}

/**
 * A card can only sit in one tier however many printings it has, so this pins
 * the art without splitting the entry.
 */
export function TierCardPrintingMenu({
  cardId,
  pinnedPrintingId,
  children,
}: TierCardPrintingMenuProps) {
  const setPrinting = useTierListBuilderStore((state) => state.setPrinting);
  const unassign = useTierListBuilderStore((state) => state.unassign);
  const printings = usePrintingChoices(cardId, pinnedPrintingId);
  const { hoveredId, popupRef, hoverProps, reset } = usePrintingChoiceHover();

  return (
    <ContextMenu onOpenChange={(open) => !open && reset()}>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent ref={popupRef} className="max-h-[70vh] w-72 overflow-y-auto">
        <ContextMenuItem onClick={() => unassign(cardId)}>Unrank this card</ContextMenuItem>
        {printings.length > 0 && <ContextMenuSeparator />}
        <PrintingChoiceMenuSection
          printings={printings}
          activePrintingId={pinnedPrintingId}
          hoverProps={hoverProps}
          onSelect={(printing) => setPrinting(cardId, printing.id)}
          onSelectDefault={() => setPrinting(cardId, null)}
        />
      </ContextMenuContent>
      <PrintingChoicePreview hoveredId={hoveredId} printings={printings} anchorRef={popupRef} />
    </ContextMenu>
  );
}
