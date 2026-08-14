import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";
import { useRef } from "react";

import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { PrintingOptionContent } from "@/components/cards/printing-option-content";
import { usePrintingHover } from "@/components/cards/use-printing-hover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCards } from "@/hooks/use-cards";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

interface TierCardPrintingMenuProps {
  cardId: string;
  /** The entry's stored printing, or null when it follows the default. */
  pinnedPrintingId: string | null;
  children: ReactNode;
}

/**
 * Right-click / long-press menu for a ranked tile: which printing supplies its
 * art, plus unranking. Ranking stays per card — the same card cannot sit in two
 * tiers however many printings it has — so this pins the art without splitting
 * the entry, which is the difference from the deck builder's version of the
 * menu.
 *
 * @returns The wrapped children with the context menu attached.
 */
export function TierCardPrintingMenu({
  cardId,
  pinnedPrintingId,
  children,
}: TierCardPrintingMenuProps) {
  const { printingsByCardId } = useCards();
  const languages = useDisplayStore((state) => state.languages);
  const setPrinting = useTierListBuilderStore((state) => state.setPrinting);
  const unassign = useTierListBuilderStore((state) => state.unassign);
  const { hoveredId, onEnter, onLeave, reset } = usePrintingHover();
  const popupRef = useRef<HTMLDivElement>(null);

  const allPrintings = printingsByCardId.get(cardId) ?? [];
  // Filter to the user's preferred languages, but always keep the currently
  // pinned printing visible even if its language is outside the filter.
  const printings =
    languages && languages.length > 0
      ? allPrintings.filter(
          (printing) => languages.includes(printing.language) || printing.id === pinnedPrintingId,
        )
      : allPrintings;

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
        <ContextMenuItem onClick={() => unassign(cardId)}>Unrank this card</ContextMenuItem>
        {printings.length > 0 && (
          <>
            <ContextMenuSeparator />
            <div className="text-muted-foreground text-2xs px-1.5 pt-1 pb-1.5 font-medium tracking-wide uppercase">
              Change printing
            </div>
            <div className="flex flex-col gap-0.5">
              {pinnedPrintingId && (
                <ContextMenuItem onClick={() => setPrinting(cardId, null)}>
                  Use default printing
                </ContextMenuItem>
              )}
              {printings.map((printing) => (
                <PrintingMenuItem
                  key={printing.id}
                  printing={printing}
                  printings={printings}
                  isActive={printing.id === pinnedPrintingId}
                  onSelect={() => setPrinting(cardId, printing.id)}
                  onHoverEnter={onEnter}
                  onHoverLeave={onLeave}
                />
              ))}
            </div>
          </>
        )}
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
  onSelect: () => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}) {
  return (
    <ContextMenuItem
      className={cn(isActive && "bg-muted ring-border ring-1")}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
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
