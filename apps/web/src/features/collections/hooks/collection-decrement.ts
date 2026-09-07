import type { Printing } from "@openrift/shared/types/catalog";
import type { GroupByField } from "@openrift/shared/types/search";

import { cardsViewTileKey } from "@/features/cards/lib/card-tiles";
import type { VariantPopoverIntent } from "@/features/collections/stores/add-mode-store";

interface RouteDecrementDeps {
  dataView: "cards" | "printings" | "copies";
  groupBy: GroupByField;
  ownedPrintingIdsByTile: Map<string, string[]>;
  handleOpenVariants?: (
    printing: Printing,
    anchorEl: HTMLElement,
    intent: VariantPopoverIntent,
  ) => void;
  tryUndoAdd?: (printing: Printing) => Promise<"done" | "ambiguous">;
}

/**
 * Escalates to the variant×collection popover when multiple owned variants
 * share the tile, or a single variant's copies span multiple collections.
 */
export function buildOnDecrement({
  dataView,
  groupBy,
  ownedPrintingIdsByTile,
  handleOpenVariants,
  tryUndoAdd,
}: RouteDecrementDeps): (printing: Printing, anchorEl?: HTMLElement) => void {
  return (printing, anchorEl) => {
    const ownedVariantIds = ownedPrintingIdsByTile.get(cardsViewTileKey(printing, groupBy));
    const ambiguousVariant = dataView === "cards" && (ownedVariantIds?.length ?? 0) > 1;
    if (ambiguousVariant && handleOpenVariants && anchorEl) {
      handleOpenVariants(printing, anchorEl, "remove");
      return;
    }
    void (async () => {
      const result = await tryUndoAdd?.(printing);
      if (result === "ambiguous" && handleOpenVariants && anchorEl) {
        handleOpenVariants(printing, anchorEl, "remove");
      }
    })();
  };
}
