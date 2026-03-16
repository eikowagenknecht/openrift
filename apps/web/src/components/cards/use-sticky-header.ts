import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

import { APP_HEADER_HEIGHT } from "./card-grid-constants";
import type { VRow } from "./card-grid-types";

interface UseStickyHeaderParams {
  multipleGroups: boolean;
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
}

export function useStickyHeader({
  multipleGroups,
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
}: UseStickyHeaderParams) {
  const [activeHeaderRow, setActiveHeaderRow] = useState<(VRow & { kind: "header" }) | null>(null);

  // Mirror refs so the scroll handler reads current values without
  // re-subscribing every render.
  const multipleGroupsRef = useRef(multipleGroups);
  multipleGroupsRef.current = multipleGroups;

  const virtualRowsRef = useRef(virtualRows);
  virtualRowsRef.current = virtualRows;

  const rowStartsRef = useRef(rowStarts);
  rowStartsRef.current = rowStarts;

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const scrollMarginRef = useRef(scrollMargin);
  scrollMarginRef.current = scrollMargin;

  useEffect(() => {
    if (!multipleGroups) {
      setActiveHeaderRow(null);
      return;
    }

    const update = () => {
      if (!multipleGroupsRef.current) {
        return;
      }

      const rows = virtualRowsRef.current;
      const starts = rowStartsRef.current;
      const margin = scrollMarginRef.current;
      const threshold = globalThis.scrollY - margin + APP_HEADER_HEIGHT;

      // Prefer the virtualizer's measured positions over rowStarts (estimated).
      const measuredStarts = new Map(
        virtualizerRef.current.getVirtualItems().map((item) => [item.index, item.start - margin]),
      );

      // The active header is the last one whose top has reached/crossed the
      // sticky threshold.
      let active: (VRow & { kind: "header" }) | null = null;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.kind !== "header") {
          continue;
        }
        const start = measuredStarts.get(i) ?? starts[i];
        if (start <= threshold + 1) {
          active = row;
        }
      }

      // Compare by set code to avoid re-renders from new object references.
      setActiveHeaderRow((prev) => {
        const prevCode = prev?.set.id ?? null;
        const nextCode = active?.set.id ?? null;
        return prevCode === nextCode ? prev : active;
      });
    };

    update();
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => globalThis.removeEventListener("scroll", update);
  }, [multipleGroups]);

  return activeHeaderRow;
}
