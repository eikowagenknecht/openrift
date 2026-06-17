import { useLayoutEffect, useState } from "react";

import { getHeaderHeight, SSR_HEADER_HEIGHT } from "@/lib/header-height";

/**
 * Render-safe header height for sticky offsets.
 *
 * Seeds to the SSR fallback (57) so the first client render matches the
 * server-rendered markup — feeding `getHeaderHeight()` straight into an inline
 * `top` / `--sticky-top` during render otherwise emits 57 on the server and the
 * measured value (e.g. 116 on a notched iOS device) on the first client render,
 * which React refuses to patch up ("tree hydrated but some attributes didn't
 * match"). After mount we measure the live header and update; on notch devices
 * the offset settles one frame later instead of mismatching.
 *
 * The safe-area inset can change without resizing the header's box (orientation
 * change), so we re-measure on resize and orientation changes too.
 *
 * For imperative / non-render reads, use `getHeaderHeight()` directly.
 *
 * @returns Header height in pixels, including the safe-area inset once measured.
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
