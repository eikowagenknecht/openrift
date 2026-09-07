import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

const mql = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(QUERY) : null;

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
 * Tracks `(pointer: coarse)`; the server snapshot is always `false` so the
 * first client render matches SSR. Use over the `IS_COARSE_POINTER` module
 * constant anywhere the result affects rendered HTML.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
