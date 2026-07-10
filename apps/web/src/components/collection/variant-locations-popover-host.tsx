import type { Printing } from "@openrift/shared";
import { useEffect, useState } from "react";

import { VariantLocationsPopover } from "@/components/collection/variant-locations-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { resolveVariantPopoverPrintings } from "@/lib/variant-popover-printings";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useSelectionStore } from "@/stores/selection-store";

interface VariantLocationsPopoverHostProps {
  /** Catalog projection (respects the active filters), primary variant source. */
  catalogPrintingsByCardId: ReadonlyMap<string, Printing[]>;
  /** Language-scoped full variant list, fallback when the projection drops a card. */
  languageScopedPrintingsByCardId: ReadonlyMap<string, Printing[]>;
  /** Quick-add a variant to the default target; undefined when there's no add target. */
  onQuickAdd?: (printing: Printing) => void;
  onAddToCollection: (printing: Printing, collectionId: string) => void;
  onRemoveFromCollection: (printing: Printing, collectionId: string) => void;
  closeVariants: (pressTarget?: EventTarget | null) => void;
}

/**
 * Hosts the variant×collection popover as its own subscriber to the add-mode
 * store. Kept separate from CollectionGrid on purpose: the grid must NOT
 * subscribe to `variantPopover`, or opening/closing the popover would re-render
 * the whole virtualized grid — which resets the window scroll position, so a
 * card the user scrolled to would jump away and the popover would open anchored
 * off-screen. Here only this small subtree re-renders on open/close.
 *
 * @returns The popover when one is open and the card resolves to variants, else null.
 */
export function VariantLocationsPopoverHost({
  catalogPrintingsByCardId,
  languageScopedPrintingsByCardId,
  onQuickAdd,
  onAddToCollection,
  onRemoveFromCollection,
  closeVariants,
}: VariantLocationsPopoverHostProps) {
  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const selectedCardId = useSelectionStore((s) => s.selectedCard?.id);
  const [addCollectionTarget, setAddCollectionTarget] = useState<Printing | null>(null);

  // Clear the in-popover "add to another collection" page whenever the popover
  // closes or switches to a different card — otherwise the next time it opens,
  // it would still be showing the stale collection picker sub-page.
  useEffect(() => {
    setAddCollectionTarget(null);
  }, [variantPopover?.cardId]);

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
        // ESC inside the "add to another collection" sub-page goes back to the
        // main page, mirroring how cmdk "pages" work. The popover stays mounted
        // because `open` is hard-coded true; clearing addCollectionTarget swaps
        // the content back.
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
          onAddToCollection={onAddToCollection}
          onRemoveFromCollection={onRemoveFromCollection}
          addCollectionTarget={addCollectionTarget}
          setAddCollectionTarget={setAddCollectionTarget}
        />
      </PopoverContent>
    </Popover>
  );
}
