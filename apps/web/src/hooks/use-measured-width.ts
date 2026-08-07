import { useLayoutEffect, useState } from "react";

/**
 * Observed border-box width of an element, rounded to whole pixels — the width
 * sibling of `useMeasuredHeight` (page-top-bar.tsx). 0 until the element
 * exists and has been measured, so callers can treat "unmeasured" and "absent"
 * the same way.
 * @returns The measured width in px.
 */
export function useMeasuredWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) {
      setWidth(0);
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
