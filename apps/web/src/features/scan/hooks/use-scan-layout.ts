import { useSyncExternalStore } from "react";

export type ScanLayout = "boxed" | "portrait" | "landscape";

// 600px keeps laptops/tablets boxed; the largest common tablet-in-landscape
// short side is well above that, the largest phone (~430px) well below.
const LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 600px)";

const PORTRAIT_QUERY = "(max-width: 767px)";

function queryList(query: string): MediaQueryList | null {
  return typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(query) : null;
}

function subscribe(onChange: () => void): () => void {
  const landscape = queryList(LANDSCAPE_QUERY);
  const portrait = queryList(PORTRAIT_QUERY);
  landscape?.addEventListener("change", onChange);
  portrait?.addEventListener("change", onChange);
  return () => {
    landscape?.removeEventListener("change", onChange);
    portrait?.removeEventListener("change", onChange);
  };
}

// Landscape wins over portrait: a rotated phone can still be under the width
// cutoff, and the side panel is what actually fits there.
function getSnapshot(): ScanLayout {
  if (queryList(LANDSCAPE_QUERY)?.matches === true) {
    return "landscape";
  }
  if (queryList(PORTRAIT_QUERY)?.matches === true) {
    return "portrait";
  }
  return "boxed";
}

function getServerSnapshot(): ScanLayout {
  return "boxed";
}

export function useScanLayout(): ScanLayout {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
