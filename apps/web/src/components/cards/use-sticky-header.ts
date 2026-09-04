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
  /** Height of a header row in px; the overlay waits until the whole row is out of view. */
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

  // Mirror refs so the scroll handler reads current values without
  // re-subscribing every render. Writes live in an effect so the compiler
  // can optimize the render phase (refs must not be touched during render).
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

      // Prefer the virtualizer's measured positions over rowStarts (estimated).
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

    // The first pass runs after paint, not inside the commit. `update` reads
    // `scrollY` and the virtualizer's measured items, which forces a synchronous
    // layout — and this effect re-subscribes exactly when the layout above the
    // grid has just changed (`scrollMargin` moved) or the grid gained a second
    // group. Both happen on the same commit as a filter change, so running it
    // inline put a full forced layout on the path to showing the new cards:
    // measured at 22–40ms on a phone (8× CPU), ~50ms of the toggle's total.
    // After paint it costs the same but nobody is waiting on it, and the
    // overlay is only ever one frame late.
    const frame = requestAnimationFrame(update);
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("scroll", update);
    };
  });

  return activeHeaderRow;
}
