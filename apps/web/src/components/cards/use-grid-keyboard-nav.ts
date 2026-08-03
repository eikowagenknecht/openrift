import type { Printing } from "@openrift/shared";
import { useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { parseDigitKey } from "@/lib/parse-digit-key";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useSelectionStore } from "@/stores/selection-store";

interface UseGridKeyboardNavParams {
  items: CardViewerItem[];
  siblingPrintings?: Printing[];
}

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-"];

// `=` is accepted as a no-shift alias for `+` — on US layouts `+` requires
// Shift+= and the asymmetry with `-` is awkward.
const isIncrementKey = (key: string) => key === "+" || key === "=";
const isAddRemoveKey = (key: string) => isIncrementKey(key) || key === "-";

/**
 * Arrow-key navigation for the card grid. Left/right step through `items`
 * by index; up/down cycle through sibling printings (variants) of the
 * selected card without changing the grid position unless the sibling is
 * itself a tile in the grid. `+` / `=` / `-` trigger the add-mode strip's
 * increment / decrement on the selected card, and a digit key 1-9 increments
 * by that many at once (all no-ops when add mode is off); when the variant
 * popover is open, it handles its own arrows and +/=/-.
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
      // A digit key adds that many copies in one press — the keyboard twin of
      // holding a digit while dragging a stack between collections.
      const digit = parseDigitKey(e.key);
      if (!NAV_KEYS.includes(e.key) && digit === null) {
        return;
      }
      // Don't hijack the browser's own combos: Ctrl/Cmd +/=/- zooms, and
      // Ctrl/Cmd/Alt + a digit switches tabs.
      if ((isAddRemoveKey(e.key) || digit !== null) && (e.ctrlKey || e.metaKey || e.altKey)) {
        return;
      }
      // While the variant×collection popover is open it handles its own arrow /
      // +/=/- / Enter keys; the grid handler steps back so we don't fight over
      // the same keystrokes.
      const addMode = useAddModeStore.getState();
      if (addMode.variantPopover) {
        return;
      }

      if (digit !== null) {
        // Held keys auto-repeat; one press means one batch of `digit` copies,
        // not a stream of them. (The repeats still arm the drag-quantity
        // modifier on /collections, which reads the key state, not the press.)
        if (e.repeat || !selectedCard) {
          return;
        }
        const handlers = useCardRowActionsStore.getState().handlers;
        if (!handlers.onIncrement) {
          return;
        }
        e.preventDefault();
        handlers.onIncrement(selectedCard, undefined, digit);
        return;
      }

      if (isAddRemoveKey(e.key) && selectedCard) {
        const handlers = useCardRowActionsStore.getState().handlers;
        if (isIncrementKey(e.key)) {
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
        // Anchor for the variant×collection popover. The tile's
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
        const target = items[selectedIndex - 1];
        navigateToIndex(selectedIndex - 1, target.printing, target.zone);
        return;
      }
      if (e.key === "ArrowRight" && selectedIndex >= 0 && selectedIndex < items.length - 1) {
        e.preventDefault();
        const target = items[selectedIndex + 1];
        navigateToIndex(selectedIndex + 1, target.printing, target.zone);
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
          navigateToIndex(siblingIdx, sibling, items[siblingIdx].zone);
        }
      }
    };

    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [items, siblingPrintings, selectedCard, selectedIndex, navigateToIndex, setSelectedCard]);
}
