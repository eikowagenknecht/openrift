import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

import type { VRow } from "./card-grid-types";

interface UseStickyHeaderParams {
  multipleGroups: boolean;
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
  stickyOffset: number;
}

export function useStickyHeader({
  multipleGroups,
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
  stickyOffset,
}: UseStickyHeaderParams) {
  const [activeHeaderRow, setActiveHeaderRow] = useState<(VRow & { kind: "header" }) | null>(null);

  // Mirror refs so the scroll handler reads current values without
  // re-subscribing every render. Writes live in an effect so the compiler
  // can optimize the render phase (refs must not be touched during render).
  const multipleGroupsRef = useRef(multipleGroups);
  const virtualRowsRef = useRef(virtualRows);
  const rowStartsRef = useRef(rowStarts);
  const virtualizerRef = useRef(virtualizer);
  const scrollMarginRef = useRef(scrollMargin);
  const stickyOffsetRef = useRef(stickyOffset);

  useEffect(() => {
    multipleGroupsRef.current = multipleGroups;
    virtualRowsRef.current = virtualRows;
    rowStartsRef.current = rowStarts;
    virtualizerRef.current = virtualizer;
    scrollMarginRef.current = scrollMargin;
    stickyOffsetRef.current = stickyOffset;
  });

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
      const threshold = globalThis.scrollY - margin + stickyOffsetRef.current;

      // Prefer the virtualizer's measured positions over rowStarts (estimated).
      const measuredStarts = new Map(
        virtualizerRef.current.getVirtualItems().map((item) => [item.index, item.start - margin]),
      );

      // The active header is the last one whose top has reached/crossed the
      // sticky threshold.
      let active: (VRow & { kind: "header" }) | null = null;
      let activeStart = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.kind !== "header") {
          continue;
        }
        const start = measuredStarts.get(i) ?? starts[i];
        if (start <= threshold + 1) {
          active = row;
          activeStart = start;
        }
      }

      // Hide the overlay when the real header is at/near the sticky position
      // (e.g. right after scrollToGroup jumps to a header).
      // scrollToIndex lands the header exactly at the threshold (gap=0).
      // The +1 in the activation check means we need to clear gap < 2.
      if (active && threshold - activeStart < 2) {
        active = null;
      }

      // Compare by set code to avoid re-renders from new object references.
      const resolved = active;
      setActiveHeaderRow((prev) => {
        const prevCode = prev?.group.id ?? null;
        const nextCode = resolved?.group.id ?? null;
        return prevCode === nextCode ? prev : resolved;
      });
    };

    update();
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => globalThis.removeEventListener("scroll", update);
  }, [multipleGroups, scrollMargin]);

  return activeHeaderRow;
}
