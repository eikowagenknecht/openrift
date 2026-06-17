/**
 * Site header height in pixels. Includes the header's 1px bottom border, so
 * callers can use it directly as a sticky-top offset.
 *
 * Prefers measuring the live header element, because on iOS standalone PWAs the
 * header pads its blur up behind the Dynamic Island (`env(safe-area-inset-top)`)
 * and is taller than the 57px chrome. The `--header-height` CSS variable folds
 * that inset in too, but it is an unregistered custom property whose `calc()` /
 * `env()` value does not resolve to pixels through `getComputedStyle`, so it is
 * only useful as a numeric fallback before the header mounts.
 *
 * Returns the SSR fallback (57) when `window` is undefined.
 *
 * @returns Header height in pixels.
 */
export function getHeaderHeight(): number {
  if (globalThis.window === undefined) {
    return 57;
  }
  const header = document.querySelector("header[data-app-header]");
  if (header) {
    return header.getBoundingClientRect().height;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue("--header-height");
  return Number.parseFloat(value) || 57;
}
