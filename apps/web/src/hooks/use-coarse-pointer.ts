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
 * Reactively tracks the `(pointer: coarse)` media query — true on touch
 * devices (and DevTools mobile emulation). The server snapshot is always
 * `false`, so the first client render matches SSR and the real value kicks
 * in one paint later. Use this instead of the `IS_COARSE_POINTER` module
 * constant in any code path that contributes to rendered HTML; the constant
 * is safe only for module-level non-render uses (timing constants, layout
 * math) where SSR vs. client divergence isn't observable.
 *
 * @returns Whether the primary pointer is coarse.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
