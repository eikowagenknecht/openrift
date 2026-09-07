import type { Printing } from "@openrift/shared";
import { useEffect } from "react";

import type { CardViewerItem } from "@/lib/card-viewer-types";
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
      const digit = parseDigitKey(e.key);
      if (!NAV_KEYS.includes(e.key) && digit === null) {
        return;
      }
      // Ctrl/Cmd +/=/- zooms and Ctrl/Cmd/Alt+digit switches tabs; let the browser handle those.
      if ((isAddRemoveKey(e.key) || digit !== null) && (e.ctrlKey || e.metaKey || e.altKey)) {
        return;
      }
      // The variant×collection popover handles its own arrow/+/=/-/Enter keys when open.
      const addMode = useAddModeStore.getState();
      if (addMode.variantPopover) {
        return;
      }

      if (digit !== null) {
        // Ignore auto-repeat: one press adds one batch of `digit` copies, not a stream.
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
        // Anchors the variant×collection popover to the tile's displayed printing,
        // which can differ from selectedCard after an Up/Down cycle.
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
        if (target) {
          navigateToIndex(selectedIndex - 1, target.printing, target.zone);
        }
        return;
      }
      if (e.key === "ArrowRight" && selectedIndex >= 0 && selectedIndex < items.length - 1) {
        e.preventDefault();
        const target = items[selectedIndex + 1];
        if (target) {
          navigateToIndex(selectedIndex + 1, target.printing, target.zone);
        }
        return;
      }

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
        if (!sibling) {
          return;
        }
        const siblingIdx = items.findIndex((i) => i.printing.id === sibling.id);
        const siblingItem = items[siblingIdx];
        if (siblingItem) {
          navigateToIndex(siblingIdx, sibling, siblingItem.zone);
        } else {
          setSelectedCard(sibling);
        }
      }
    };

    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [items, siblingPrintings, selectedCard, selectedIndex, navigateToIndex, setSelectedCard]);
}
