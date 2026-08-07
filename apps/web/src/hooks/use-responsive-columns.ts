import { useLayoutEffect, useState } from "react";

import { GRID_GAP_MAX, GRID_GAP_MIN } from "@/components/cards/card-grid-metrics";

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
export const SSR_SAFE_COLUMNS = 2;

export function useResponsiveColumns(maxColumns?: number | null) {
  // Hold the measured node in state rather than a plain ref so the effect below
  // re-runs when the element actually mounts. The container is often gated
  // behind an async query — deck-check renders a "Loading…" placeholder first,
  // so on a cold cache the node appears on a render *after* this hook first ran.
  // A `useRef` would never notify us of that late mount, leaving columns frozen
  // at the SSR fallback (the intermittent 2-column bug). The `useState` setter
  // is referentially stable, so binding it directly as the ref callback doesn't
  // re-attach on every render.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(() =>
    maxColumns !== undefined && maxColumns !== null ? maxColumns : SSR_SAFE_COLUMNS,
  );
  const [physicalMax, setPhysicalMax] = useState(8);
  const [physicalMin, setPhysicalMin] = useState(1);
  const [autoColumns, setAutoColumns] = useState(SSR_SAFE_COLUMNS);
  const [containerWidth, setContainerWidth] = useState(400);
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const el = containerEl;
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
      // The gap isn't fixed — it shrinks with the card (card-grid-metrics.ts).
      // The densest layout therefore packs at GRID_GAP_MIN and the sparsest at
      // GRID_GAP_MAX, so each bound uses the gap it will actually be laid out
      // with. Using one value for both would let the column controls offer a
      // count the grid can't honour.
      const pMax = Math.max(
        1,
        Math.floor((width + GRID_GAP_MIN) / (MIN_CARD_WIDTH + GRID_GAP_MIN)),
      );
      const pMin = Math.max(1, Math.ceil((width + GRID_GAP_MAX) / (MAX_CARD_WIDTH + GRID_GAP_MAX)));

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
  }, [maxColumns, containerEl]);

  return {
    containerRef: setContainerEl,
    // The measured node itself, for consumers that need to read/observe the
    // element (not just bind the ref). Depend on this rather than a ref's
    // `.current` so their own effects also re-run when the node mounts late.
    containerEl,
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

// The matching gap for each of those bands, since the grid can't be measured
// yet. `cqw` resolves against the same `@container/grid`, so the browser
// evaluates the live gap rule (card-grid-metrics.ts) against the real container
// width and the cards don't shift when the measured grid takes over. One
// expression per band because the gutter ratio binds in all of them.
//
// ⚠ Generated by `gridGapCss(cols)` — written out literally because Tailwind
// only sees class names it can find in the source. `use-responsive-columns.test.ts`
// regenerates and compares them, so retuning the gutter constants fails there
// rather than silently desyncing SSR from the live grid.
export const SSR_RESPONSIVE_GRID_GAP =
  "gap-[clamp(4px,calc(4.9881cqw_-_5.7007px),22px)] @min-[640px]/grid:gap-[clamp(4px,calc(3.271cqw_-_5.6075px),22px)] @min-[768px]/grid:gap-[clamp(4px,calc(2.4334cqw_-_5.562px),22px)] @min-[1024px]/grid:gap-[clamp(4px,calc(1.9373cqw_-_5.5351px),22px)] @min-[1280px]/grid:gap-[clamp(4px,calc(1.6092cqw_-_5.5172px),22px)] @min-[1600px]/grid:gap-[clamp(4px,calc(1.3761cqw_-_5.5046px),22px)] @min-[1920px]/grid:gap-[clamp(4px,calc(1.2021cqw_-_5.4951px),22px)]";

/** Column counts `SSR_RESPONSIVE_GRID_COLS` / `SSR_RESPONSIVE_GRID_GAP` pair with, per band. */
export const SSR_BANDS = [
  { minWidth: 0, columns: 2 },
  { minWidth: 640, columns: 3 },
  { minWidth: 768, columns: 4 },
  { minWidth: 1024, columns: 5 },
  { minWidth: 1280, columns: 6 },
  { minWidth: 1600, columns: 7 },
  { minWidth: 1920, columns: 8 },
] as const;
