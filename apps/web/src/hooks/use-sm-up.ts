import { useSyncExternalStore } from "react";

// Tailwind's `sm` breakpoint (40rem). Keep in sync with the CSS classes that
// pair with this hook (`hidden sm:flex` on the desktop filter chrome).
const SM_QUERY = "(min-width: 640px)";

const mql = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(SM_QUERY) : null;

function subscribe(onChange: () => void): () => void {
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return mql?.matches ?? true;
}

// True on the server so SSR HTML keeps the desktop chrome (it is CSS-hidden on
// phones anyway, so there is no flash either way); phones drop it right after
// hydration and stop re-rendering it on every filter change.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Reactively tracks whether the viewport is at or above Tailwind's `sm`
 * breakpoint. Used to unmount (not just CSS-hide) the desktop filter chrome on
 * phones: a `hidden sm:flex` subtree still re-renders on every filter change,
 * and the compact filter bar is expensive.
 * @returns Whether the viewport is at least `sm` wide.
 */
export function useSmUp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
