import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// custom: the scaffold used useState + useEffect, which sets state inside the
// custom: effect (react/set-state-in-effect) and renders twice on mount.
function subscribe(onChange: () => void): () => void {
  const mql = globalThis.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`); // custom: globalThis per lint
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return globalThis.innerWidth < MOBILE_BREAKPOINT; // custom: globalThis per lint
}

// custom: matches the scaffold's pre-effect value, so hydration sees the same markup.
function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); // custom: see above
}
