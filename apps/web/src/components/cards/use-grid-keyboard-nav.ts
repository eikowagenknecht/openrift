import type { Printing } from "@openrift/shared";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import type { VRow } from "./card-grid-types";

interface UseGridKeyboardNavParams {
  selectedCardId?: string;
  /**
   * Optional fallback cardId — used when `selectedCardId` (the printing id)
   * isn't in the grid (e.g. a chevron-picked or detail-pane-picked variant
   * that isn't represented as its own tile). Lets arrow-key navigation still
   * pick up from whichever tile in the grid shares this cardId.
   */
  selectedCardCardId?: string;
  virtualRows: VRow[];
  columns: number;
  onCardClick?: (printing: Printing) => void;
  virtualizer: Virtualizer<Window, Element>;
  siblingPrintings?: Printing[];
}

/**
 * Arrow-key navigation for the card grid.
 * - Left/Right: move to adjacent cards, wrapping across rows.
 * - Up/Down: cycle sibling printings (versions) of the selected card.
 */
export function useGridKeyboardNav({
  selectedCardId,
  selectedCardCardId,
  virtualRows,
  columns,
  onCardClick,
  virtualizer,
  siblingPrintings,
}: UseGridKeyboardNavParams) {
  const siblingPrintingsRef = useRef(siblingPrintings);
  useEffect(() => {
    siblingPrintingsRef.current = siblingPrintings;
  }, [siblingPrintings]);

  useEffect(() => {
    if (!selectedCardId || !onCardClick) {
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        return;
      }

      // Up/Down: cycle sibling printings (versions)
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const siblings = siblingPrintingsRef.current;
        if (!siblings || siblings.length < 2) {
          return;
        }
        e.preventDefault();
        const idx = siblings.findIndex((p) => p.id === selectedCardId);
        const next =
          e.key === "ArrowUp"
            ? idx > 0
              ? idx - 1
              : siblings.length - 1
            : idx < siblings.length - 1
              ? idx + 1
              : 0;
        const targetPrinting = siblings[next];
        onCardClick(targetPrinting);

        // Scroll grid to the target printing if it's in the current view
        for (let i = 0; i < virtualRows.length; i++) {
          const row = virtualRows[i];
          if (
            row.kind === "cards" &&
            row.items.some((item) => item.printing.id === targetPrinting.id)
          ) {
            virtualizer.scrollToIndex(i, { align: "auto" });
            break;
          }
        }
        return;
      }

      // Left/Right: grid navigation. Index by both printing id and cardId so a
      // detail-pane picker that lands on a non-grid printing (e.g. an
      // off-grid art variant) can still navigate from whichever tile shares
      // its cardId. First-seen-wins for cardId so multi-tile cards (cards+set)
      // anchor consistently.
      const cardPos = new Map<string, { vRowIndex: number; colIndex: number }>();
      const cardPosByCardId = new Map<string, { vRowIndex: number; colIndex: number }>();
      const cardRowIndices: number[] = [];
      for (let i = 0; i < virtualRows.length; i++) {
        const row = virtualRows[i];
        if (row.kind !== "cards") {
          continue;
        }
        cardRowIndices.push(i);
        for (let c = 0; c < row.items.length; c++) {
          const pos = { vRowIndex: i, colIndex: c };
          const printing = row.items[c].printing;
          cardPos.set(printing.id, pos);
          if (!cardPosByCardId.has(printing.cardId)) {
            cardPosByCardId.set(printing.cardId, pos);
          }
        }
      }

      const current =
        cardPos.get(selectedCardId) ??
        (selectedCardCardId ? cardPosByCardId.get(selectedCardCardId) : undefined);
      if (!current) {
        return;
      }

      const crIdx = cardRowIndices.indexOf(current.vRowIndex);
      let targetPrinting: Printing | undefined;
      let targetRowIndex: number | undefined;

      if (e.key === "ArrowLeft") {
        if (current.colIndex > 0) {
          const row = virtualRows[current.vRowIndex];
          if (row.kind === "cards") {
            targetPrinting = row.items[current.colIndex - 1].printing;
            targetRowIndex = current.vRowIndex;
          }
        } else if (crIdx > 0) {
          const prevRow = virtualRows[cardRowIndices[crIdx - 1]];
          if (prevRow.kind === "cards") {
            targetPrinting = prevRow.items.at(-1)?.printing;
            targetRowIndex = cardRowIndices[crIdx - 1];
          }
        }
      } else if (e.key === "ArrowRight") {
        const row = virtualRows[current.vRowIndex];
        if (row.kind === "cards" && current.colIndex < row.items.length - 1) {
          targetPrinting = row.items[current.colIndex + 1].printing;
          targetRowIndex = current.vRowIndex;
        } else if (crIdx < cardRowIndices.length - 1) {
          const nextRow = virtualRows[cardRowIndices[crIdx + 1]];
          if (nextRow.kind === "cards") {
            targetPrinting = nextRow.items[0].printing;
            targetRowIndex = cardRowIndices[crIdx + 1];
          }
        }
      }

      if (targetPrinting && targetRowIndex !== undefined) {
        e.preventDefault();
        onCardClick(targetPrinting);
        virtualizer.scrollToIndex(targetRowIndex, { align: "auto" });
      }
    };

    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [selectedCardId, selectedCardCardId, virtualRows, columns, onCardClick, virtualizer]);
}
