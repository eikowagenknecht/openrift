import { useLayoutEffect, useState } from "react";

import { getHeaderHeight, SSR_HEADER_HEIGHT } from "@/lib/header-height";

/**
 * Seeds to the SSR fallback so the first client render matches the
 * server-rendered markup, then measures the live header after mount.
 * Feeding `getHeaderHeight()` straight into render otherwise mismatches
 * hydration on notched devices.
 */
export function useHeaderHeight(): number {
  const [height, setHeight] = useState(SSR_HEADER_HEIGHT);

  useLayoutEffect(() => {
    const header = document.querySelector("header[data-app-header]");
    const measure = () => setHeight(getHeaderHeight());
    measure();
    if (!header) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    globalThis.addEventListener("resize", measure);
    globalThis.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
      globalThis.removeEventListener("orientationchange", measure);
    };
  }, []);

  return height;
}
