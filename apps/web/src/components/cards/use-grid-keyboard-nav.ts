import type { Printing } from "@openrift/shared";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import type { VRow } from "./card-grid-types";

interface UseGridKeyboardNavParams {
  selectedCardId?: string;
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
  virtualRows,
  columns,
  onCardClick,
  virtualizer,
  siblingPrintings,
}: UseGridKeyboardNavParams) {
  const siblingPrintingsRef = useRef(siblingPrintings);
  siblingPrintingsRef.current = siblingPrintings;

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

      // Left/Right: grid navigation
      const cardPos = new Map<string, { vRowIndex: number; colIndex: number }>();
      const cardRowIndices: number[] = [];
      for (let i = 0; i < virtualRows.length; i++) {
        const row = virtualRows[i];
        if (row.kind !== "cards") {
          continue;
        }
        cardRowIndices.push(i);
        for (let c = 0; c < row.items.length; c++) {
          cardPos.set(row.items[c].printing.id, { vRowIndex: i, colIndex: c });
        }
      }

      const current = cardPos.get(selectedCardId);
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
  }, [selectedCardId, virtualRows, columns, onCardClick, virtualizer]);
}
