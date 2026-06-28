import type { GroupByField, Printing } from "@openrift/shared";

import { cardsViewTileKey } from "@/lib/card-tiles";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";

interface RouteDecrementDeps {
  dataView: "cards" | "printings" | "copies";
  /** Tile axis — owned printings are bucketed per tile (see cardsViewTileKey). */
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
 * Builds the registered onDecrement handler for the collection grid. The tile
 * `-` removes a copy only when there is exactly one place it could come from;
 * otherwise it opens the variant×collection popover so the user picks the exact
 * row to remove. It escalates in two cases: multiple owned variants in the tile
 * (cards view), or a single variant whose copies span multiple collections
 * (reported as "ambiguous" by tryUndoAdd). The popover needs `anchorEl`, so
 * callers must forward it through.
 * @returns A function that routes a `-` click to the right action.
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
    // Single owned variant: try the silent path (session undo / single-collection
    // dispose). If the variant spans multiple collections, escalate to the
    // popover so the user picks the exact collection row to remove from.
    void (async () => {
      const result = await tryUndoAdd?.(printing);
      if (result === "ambiguous" && handleOpenVariants && anchorEl) {
        handleOpenVariants(printing, anchorEl, "remove");
      }
    })();
  };
}
