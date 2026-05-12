import type { Printing } from "@openrift/shared";
import { useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useSelectionStore } from "@/stores/selection-store";

interface UseGridKeyboardNavParams {
  items: CardViewerItem[];
  siblingPrintings?: Printing[];
}

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"];

/**
 * Arrow-key navigation for the card grid. Left/right step through `items`
 * by index; up/down cycle through sibling printings (variants) of the
 * selected card without changing the grid position unless the sibling is
 * itself a tile in the grid. `+` / `-` trigger the add-mode strip's
 * increment / decrement on the selected card (no-op when add mode is off);
 * when the variant popover is open, it handles its own arrows and +/-.
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
      if (!NAV_KEYS.includes(e.key)) {
        return;
      }
      // Don't hijack Ctrl/Cmd +/- (browser zoom). Shift is fine — on US
      // layouts `+` requires Shift+=.
      if ((e.key === "+" || e.key === "-") && (e.ctrlKey || e.metaKey || e.altKey)) {
        return;
      }
      // While the variant or dispose picker popover is open it handles its
      // own arrow / +/- / Enter keys; the grid handler steps back so we don't
      // fight over the same keystrokes.
      const addMode = useAddModeStore.getState();
      if (addMode.variantPopover || addMode.disposePicker) {
        return;
      }

      if ((e.key === "+" || e.key === "-") && selectedCard) {
        const handlers = useCardRowActionsStore.getState().handlers;
        if (e.key === "+") {
          if (!handlers.onIncrement) {
            return;
          }
          e.preventDefault();
          handlers.onIncrement(selectedCard);
          return;
        }
        if (!handlers.onDecrement) {
          return;
        }
        e.preventDefault();
        // Anchor for popovers (variants or dispose picker). The tile's
        // data-printing-id is the *displayed* printing for that grid item,
        // which differs from selectedCard only when the user has Up/Down'd
        // to a sibling. Either way, the tile is a sensible visual anchor.
        const tileId = items[selectedIndex]?.printing.id;
        const tileEl = tileId
          ? document.querySelector<HTMLElement>(`[data-printing-id="${tileId}"]`)
          : null;
        handlers.onDecrement(selectedCard, tileEl ?? undefined);
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
