import { useLayoutEffect, useRef, useState } from "react";

const breakpoints = [
  { minWidth: 1920, cols: 8 },
  { minWidth: 1600, cols: 7 },
  { minWidth: 1280, cols: 6 },
  { minWidth: 1024, cols: 5 },
  { minWidth: 768, cols: 4 },
  { minWidth: 640, cols: 3 },
  { minWidth: 0, cols: 2 },
];

const MIN_CARD_WIDTH = 100;
const MAX_CARD_WIDTH = 500;
const GAP = 16;

// Initial state must be identical on server and client so SSR-rendered grids
// hydrate without an attribute mismatch on `style.gridTemplateColumns`. The
// server has no `innerWidth`, so we can't derive cols from a breakpoint at
// initializer time — every consumer starts at the narrowest column count and
// the useLayoutEffect below upgrades to the measured value before the browser
// paints. /cards is gated behind useHydrated() so it never SSRs the grid,
// but /promos renders during SSR for crawlers and would mismatch otherwise.
// Pair the `measured` flag with CSS container-query grid classes on the SSR
// markup so the browser's first paint already shows the right column count
// based on the actual container width (see /promos for the pattern).
const SSR_SAFE_COLUMNS = 2;

export function useResponsiveColumns(maxColumns?: number | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() =>
    maxColumns !== undefined && maxColumns !== null ? maxColumns : SSR_SAFE_COLUMNS,
  );
  const [physicalMax, setPhysicalMax] = useState(8);
  const [physicalMin, setPhysicalMin] = useState(1);
  const [autoColumns, setAutoColumns] = useState(SSR_SAFE_COLUMNS);
  const [containerWidth, setContainerWidth] = useState(400);
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    // Track previous computed values to skip redundant state updates
    let prevPMax = -1;
    let prevPMin = -1;
    let prevAuto = -1;
    let prevCols = -1;
    let prevWidth = -1;
    let rafId = 0;

    const updateColumns = () => {
      const width = el.offsetWidth;
      const pMax = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
      const pMin = Math.max(1, Math.ceil((width + GAP) / (MAX_CARD_WIDTH + GAP)));

      const match = breakpoints.find((bp) => width >= bp.minWidth);
      const auto = match?.cols ?? 2;

      const cols =
        maxColumns !== undefined && maxColumns !== null
          ? Math.max(pMin, Math.min(maxColumns, pMax))
          : auto;

      // Only update state when values actually change
      const changed =
        pMax !== prevPMax ||
        pMin !== prevPMin ||
        auto !== prevAuto ||
        cols !== prevCols ||
        width !== prevWidth;
      if (!changed) {
        return;
      }

      prevPMin = pMin;
      prevPMax = pMax;
      prevAuto = auto;
      prevCols = cols;
      prevWidth = width;
      setPhysicalMax(pMax);
      setPhysicalMin(pMin);
      setAutoColumns(auto);
      setColumns(cols);
      setContainerWidth(width);
      setMeasured(true);
    };

    updateColumns();

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateColumns);
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [maxColumns]);

  return {
    containerRef,
    columns,
    physicalMax,
    physicalMin,
    autoColumns,
    containerWidth,
    measured,
  };
}

// Tailwind container-query classes mirroring the JS breakpoints above. Apply
// these on a grid container nested inside `@container/grid` (set in
// card-browser-layout) when `measured` is still false — i.e. during SSR and
// the pre-hydration paint. The browser then renders the right column count
// from CSS alone, and the inline `gridTemplateColumns` style takes over once
// JS has the precise measurement.
export const SSR_RESPONSIVE_GRID_COLS =
  "grid-cols-2 @min-[640px]/grid:grid-cols-3 @min-[768px]/grid:grid-cols-4 @min-[1024px]/grid:grid-cols-5 @min-[1280px]/grid:grid-cols-6 @min-[1600px]/grid:grid-cols-7 @min-[1920px]/grid:grid-cols-8";
