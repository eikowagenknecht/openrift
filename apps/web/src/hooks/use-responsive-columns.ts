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

export function useResponsiveColumns(maxColumns?: number | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => {
    if (maxColumns !== undefined && maxColumns !== null) {
      return maxColumns;
    }
    const match = breakpoints.find((bp) => globalThis.innerWidth >= bp.minWidth);
    return match?.cols ?? 2;
  });
  const [physicalMax, setPhysicalMax] = useState(8);
  const [physicalMin, setPhysicalMin] = useState(1);
  const [autoColumns, setAutoColumns] = useState(() => {
    const match = breakpoints.find((bp) => globalThis.innerWidth >= bp.minWidth);
    return match?.cols ?? 2;
  });
  const [containerWidth, setContainerWidth] = useState(400);

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

  return { containerRef, columns, physicalMax, physicalMin, autoColumns, containerWidth };
}
