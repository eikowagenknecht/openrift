import { useSyncExternalStore } from "react";

/**
 * How much room the scanning page has, which decides where the camera, the
 * controls and the session tray go.
 *
 * - `boxed` is the desktop/tablet layout: the camera sits in a normal page
 *   column under the page top bar, with the tray as a block below it.
 * - `portrait` is a phone held upright: the camera goes full-bleed and the
 *   tray becomes a sheet that peeks over the bottom edge.
 * - `landscape` is a phone on its side, where a bottom sheet would eat the
 *   short axis: the tray moves to a fixed side panel instead.
 */
export type ScanLayout = "boxed" | "portrait" | "landscape";

/**
 * A landscape viewport this short is a phone, not a laptop. Chosen against the
 * short side of current phones (a 6.7" phone is ~430px, the largest common
 * tablet-in-landscape is well above 600), so laptops and tablets stay boxed.
 */
const LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 600px)";

/** Tailwind's `md` breakpoint, the same phone cutoff the rest of the app uses. */
const PORTRAIT_QUERY = "(max-width: 767px)";

/**
 * Resolved lazily rather than at module scope so a test can install its own
 * `matchMedia` before the first render, and so an environment without the API
 * (SSR, jsdom without a stub) simply reports the boxed layout.
 *
 * @returns The media query list, or null when `matchMedia` is unavailable.
 */
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

/**
 * Read the current layout. Landscape wins over portrait: a phone rotated
 * sideways can still be under the width cutoff, and the side panel is the
 * layout that actually fits there.
 *
 * @returns The layout the viewport currently calls for.
 */
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

/**
 * Reactively track which scanning layout the viewport calls for.
 *
 * @returns The current {@link ScanLayout}.
 */
export function useScanLayout(): ScanLayout {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
