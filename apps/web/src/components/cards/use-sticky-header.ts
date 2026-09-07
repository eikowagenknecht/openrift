import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

import { useScopeEffect } from "@/hooks/use-scope-effect";

import type { VRow } from "./card-grid-types";

interface UseStickyHeaderParams {
  multipleGroups: boolean;
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
  stickyOffset: number;
  headerHeight: number;
}

export function useStickyHeader({
  multipleGroups,
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
  stickyOffset,
  headerHeight,
}: UseStickyHeaderParams) {
  const [activeHeaderRow, setActiveHeaderRow] = useState<(VRow & { kind: "header" }) | null>(null);

  // Refs mirror props so the scroll handler avoids re-subscribing every render;
  // writes happen in an effect since refs must not be touched during render.
  const multipleGroupsRef = useRef(multipleGroups);
  const virtualRowsRef = useRef(virtualRows);
  const rowStartsRef = useRef(rowStarts);
  const virtualizerRef = useRef(virtualizer);
  const scrollMarginRef = useRef(scrollMargin);
  const stickyOffsetRef = useRef(stickyOffset);
  const headerHeightRef = useRef(headerHeight);

  useEffect(() => {
    multipleGroupsRef.current = multipleGroups;
    virtualRowsRef.current = virtualRows;
    rowStartsRef.current = rowStarts;
    virtualizerRef.current = virtualizer;
    scrollMarginRef.current = scrollMargin;
    stickyOffsetRef.current = stickyOffset;
    headerHeightRef.current = headerHeight;
  });

  if (!multipleGroups && activeHeaderRow !== null) {
    setActiveHeaderRow(null);
  }

  useScopeEffect(`${multipleGroups} ${scrollMargin}`, () => {
    if (!multipleGroups) {
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

      const measuredStarts = new Map(
        virtualizerRef.current.getVirtualItems().map((item) => [item.index, item.start - margin]),
      );

      // The last header whose row has fully scrolled past the threshold, so
      // the overlay never doubles up a header still sliding under the toolbar.
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
      if (active && activeStart + headerHeightRef.current > threshold + 1) {
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

    // Runs after paint: `update` forces a synchronous layout, and inline it
    // would land on the same commit as a filter change showing new cards.
    const frame = requestAnimationFrame(update);
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("scroll", update);
    };
  });

  return activeHeaderRow;
}
