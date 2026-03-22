import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

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
 * Reactively tracks the `(max-width: 767px)` media query (Tailwind `md` breakpoint).
 * @returns Whether the viewport currently matches the mobile breakpoint.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
