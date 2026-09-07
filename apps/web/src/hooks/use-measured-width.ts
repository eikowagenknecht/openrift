import { useLayoutEffect, useState } from "react";

export function useMeasuredWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  const [measuredEl, setMeasuredEl] = useState(el);
  if (measuredEl !== el) {
    setMeasuredEl(el);
    if (!el) {
      setWidth(0);
    }
  }
  useLayoutEffect(() => {
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
      setWidth(Math.round(measured));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return width;
}
