import { useSyncExternalStore } from "react";

const LANDSCAPE_QUERY = "(orientation: landscape)";

const mql =
  typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(LANDSCAPE_QUERY) : null;

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
 * Reactively tracks whether the viewport is in landscape orientation.
 * @returns Whether the viewport currently matches `(orientation: landscape)`.
 */
export function useIsLandscape(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
