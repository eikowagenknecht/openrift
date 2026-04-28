import type { Printing } from "@openrift/shared";
import { useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useSelectionStore } from "@/stores/selection-store";

interface UseGridKeyboardNavParams {
  items: CardViewerItem[];
  siblingPrintings?: Printing[];
}

/**
 * Arrow-key navigation for the card grid. Left/right step through `items`
 * by index; up/down cycle through sibling printings (variants) of the
 * selected card without changing the grid position unless the sibling is
 * itself a tile in the grid.
 */
export function useGridKeyboardNav({ items, siblingPrintings }: UseGridKeyboardNavParams) {
  const selectedCard = useSelectionStore((s) => s.selectedCard);
  const selectedIndex = useSelectionStore((s) => s.selectedIndex);
  const navigateToIndex = useSelectionStore((s) => s.navigateToIndex);
  const setSelectedCard = useSelectionStore((s) => s.setSelectedCard);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        return;
      }

      if (e.key === "ArrowLeft" && selectedIndex > 0) {
        e.preventDefault();
        navigateToIndex(selectedIndex - 1, items[selectedIndex - 1].printing);
        return;
      }
      if (e.key === "ArrowRight" && selectedIndex >= 0 && selectedIndex < items.length - 1) {
        e.preventDefault();
        navigateToIndex(selectedIndex + 1, items[selectedIndex + 1].printing);
        return;
      }

      // Up/Down: cycle sibling printings (variants). If the sibling is also
      // a tile in the grid (cards+set), jump to it; otherwise keep the
      // current tile and just swap the printing in the detail pane.
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!siblingPrintings || siblingPrintings.length < 2 || !selectedCard) {
          return;
        }
        e.preventDefault();
        const idx = siblingPrintings.findIndex((p) => p.id === selectedCard.id);
        const next =
          e.key === "ArrowUp"
            ? idx > 0
              ? idx - 1
              : siblingPrintings.length - 1
            : idx < siblingPrintings.length - 1
              ? idx + 1
              : 0;
        const sibling = siblingPrintings[next];
        const siblingIdx = items.findIndex((i) => i.printing.id === sibling.id);
        if (siblingIdx === -1) {
          setSelectedCard(sibling);
        } else {
          navigateToIndex(siblingIdx, sibling);
        }
      }
    };

    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [items, siblingPrintings, selectedCard, selectedIndex, navigateToIndex, setSelectedCard]);
}
