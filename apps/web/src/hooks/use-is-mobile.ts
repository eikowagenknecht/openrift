import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const mql =
  typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(MOBILE_QUERY) : null;

function subscribe(onChange: () => void): () => void {
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return mql?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Reactively tracks the mobile media query (viewport below Tailwind's `md` breakpoint).
 * @returns Whether the viewport currently matches the mobile breakpoint.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
