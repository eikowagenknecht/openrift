import { useLayoutEffect, useRef, useState } from "react";

const breakpoints = [
  { minWidth: 1280, cols: 6 },
  { minWidth: 1024, cols: 5 },
  { minWidth: 768, cols: 4 },
  { minWidth: 640, cols: 3 },
  { minWidth: 0, cols: 2 },
];

const MIN_CARD_WIDTH = 100;
const GAP = 16;

export function useResponsiveColumns(maxColumns?: number | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => {
    if (maxColumns !== undefined && maxColumns !== null) {
      return maxColumns;
    }
    const width = typeof window !== "undefined" ? window.innerWidth : 1024;
    const match = breakpoints.find((bp) => width >= bp.minWidth);
    return match?.cols ?? 2;
  });
  const [physicalMax, setPhysicalMax] = useState(8);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const updateColumns = () => {
      const width = el.offsetWidth;
      const pMax = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
      setPhysicalMax(pMax);

      if (maxColumns !== undefined && maxColumns !== null) {
        setColumns(Math.min(maxColumns, pMax));
      } else {
        const match = breakpoints.find((bp) => width >= bp.minWidth);
        if (match) {
          setColumns(match.cols);
        }
      }
    };

    updateColumns();

    const observer = new ResizeObserver(() => {
      updateColumns();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [maxColumns]);

  return { containerRef, columns, physicalMax };
}
