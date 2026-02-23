import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const updateColumns = () => {
      const width = el.offsetWidth;
      const match = breakpoints.find((bp) => width >= bp.minWidth);
      if (match) {
        setColumns(match.cols);
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
  }, []);

  return { containerRef, columns };
}
