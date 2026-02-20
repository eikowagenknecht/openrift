import { useCallback, useEffect, useRef, useState } from "react";

const breakpoints = [
  { minWidth: 1280, cols: 6 },
  { minWidth: 1024, cols: 5 },
  { minWidth: 768, cols: 4 },
  { minWidth: 640, cols: 3 },
  { minWidth: 0, cols: 2 },
];

export function useResponsiveColumns() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  const updateColumns = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const width = containerRef.current.offsetWidth;
    const match = breakpoints.find((bp) => width >= bp.minWidth);
    if (match) {
      setColumns(match.cols);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    updateColumns();

    const observer = new ResizeObserver(() => {
      updateColumns();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [updateColumns]);

  return { containerRef, columns };
}
