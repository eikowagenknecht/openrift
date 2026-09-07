import type { Printing } from "@openrift/shared/types/catalog";
import { useState } from "react";

import { VariantLocationsPopover } from "@/components/collection/variant-locations-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { resolveVariantPopoverPrintings } from "@/lib/variant-popover-printings";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useSelectionStore } from "@/stores/selection-store";

interface VariantLocationsPopoverHostProps {
  catalogPrintingsByCardId: ReadonlyMap<string, Printing[]>;
  languageScopedPrintingsByCardId: ReadonlyMap<string, Printing[]>;
  onQuickAdd?: (printing: Printing) => void;
  defaultTargetCollectionId?: string;
  onAddToCollection: (printing: Printing, collectionId: string) => void;
  onRemoveFromCollection: (printing: Printing, collectionId: string) => void;
  closeVariants: (pressTarget?: EventTarget | null) => void;
  viewCollectionId?: string;
}

// Kept separate from CollectionGrid: the grid must not subscribe to
// `variantPopover`, or opening/closing it would re-render and reset the grid's scroll.
export function VariantLocationsPopoverHost({
  catalogPrintingsByCardId,
  languageScopedPrintingsByCardId,
  onQuickAdd,
  defaultTargetCollectionId,
  onAddToCollection,
  onRemoveFromCollection,
  closeVariants,
  viewCollectionId,
}: VariantLocationsPopoverHostProps) {
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const selectedCardId = useSelectionStore((s) => s.selectedCard?.id);
  const [addCollectionTarget, setAddCollectionTarget] = useState<Printing | null>(null);

  const [lastPopoverCardId, setLastPopoverCardId] = useState(variantPopover?.cardId);
  if (variantPopover?.cardId !== lastPopoverCardId) {
    setLastPopoverCardId(variantPopover?.cardId);
    setAddCollectionTarget(null);
  }

  const variantPrintings = resolveVariantPopoverPrintings(
    catalogPrintingsByCardId,
    languageScopedPrintingsByCardId,
    variantPopover,
  );

  if (!variantPopover || !variantPrintings || !onQuickAdd) {
    return null;
  }

  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        if (open) {
          return;
        }
        // Escape backs out of the add sub-page: clear addCollectionTarget, keep `open` true.
        if (details.reason === "escape-key" && addCollectionTarget) {
          setAddCollectionTarget(null);
          return;
        }
        setAddCollectionTarget(null);
        closeVariants(details.reason === "outside-press" ? details.event.target : undefined);
      }}
    >
      <PopoverContent
        anchor={variantPopover.anchor}
        side="bottom"
        align="center"
        className="max-h-72 w-max max-w-[min(90vw,24rem)] min-w-56 gap-0 overflow-y-auto p-0"
      >
        <VariantLocationsPopover
          printings={variantPrintings}
          initialHighlightId={selectedCardId}
          intent={variantPopover.intent}
          onQuickAdd={onQuickAdd}
          defaultTargetCollectionId={defaultTargetCollectionId}
          onAddToCollection={onAddToCollection}
          onRemoveFromCollection={onRemoveFromCollection}
          addCollectionTarget={addCollectionTarget}
          setAddCollectionTarget={setAddCollectionTarget}
          viewCollectionId={viewCollectionId}
        />
      </PopoverContent>
    </Popover>
  );
}
