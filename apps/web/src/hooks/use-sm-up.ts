import { useSyncExternalStore } from "react";

const SM_QUERY = "(min-width: 640px)";

const mql = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(SM_QUERY) : null;

function subscribe(onChange: () => void): () => void {
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return mql?.matches ?? true;
}

// True on the server so SSR HTML keeps the desktop chrome; it is CSS-hidden on
// phones anyway, and phones drop it right after hydration.
function getServerSnapshot(): boolean {
  return true;
}

/** Tracks Tailwind's `sm` breakpoint, to unmount (not just CSS-hide) expensive chrome on phones. */
export function useSmUp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
