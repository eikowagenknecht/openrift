import type { Printing } from "@openrift/shared";

import type { VariantPopoverIntent } from "@/stores/add-mode-store";

interface RouteDecrementDeps {
  dataView: "cards" | "printings" | "copies";
  ownedPrintingIdsByCardId: Map<string, string[]>;
  handleOpenVariants?: (
    printing: Printing,
    anchorEl: HTMLElement,
    intent: VariantPopoverIntent,
  ) => void;
  handleUndoAdd?: (printing: Printing, anchorEl?: HTMLElement) => void | Promise<void>;
}

/**
 * Builds the registered onDecrement handler for the collection grid. In cards
 * view with multiple owned variants of a card, `-` opens the variant popover so
 * the user can pick which variant to remove. Otherwise it forwards to
 * handleUndoAdd, which itself opens the "Remove from" picker when copies span
 * multiple collections — that downstream picker needs `anchorEl`, so callers
 * must forward it through.
 * @returns A function that routes a `-` click to the right action.
 */
export function buildOnDecrement({
  dataView,
  ownedPrintingIdsByCardId,
  handleOpenVariants,
  handleUndoAdd,
}: RouteDecrementDeps): (printing: Printing, anchorEl?: HTMLElement) => void {
  return (printing, anchorEl) => {
    const ownedVariantIds = ownedPrintingIdsByCardId.get(printing.cardId);
    const hasAmbiguousRemoval = dataView === "cards" && (ownedVariantIds?.length ?? 0) > 1;
    if (hasAmbiguousRemoval && handleOpenVariants && anchorEl) {
      handleOpenVariants(printing, anchorEl, "remove");
      return;
    }
    void handleUndoAdd?.(printing, anchorEl);
  };
}
