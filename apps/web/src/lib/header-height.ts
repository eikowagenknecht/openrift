/**
 * Site header height in pixels, sourced from the `--header-height` CSS
 * variable (defined in `index.css`). Includes the header's 1px bottom border,
 * so callers can use it directly as a sticky-top offset.
 *
 * Returns the SSR fallback (57) when `window` is undefined.
 *
 * @returns Header height in pixels.
 */
export function getHeaderHeight(): number {
  if (globalThis.window === undefined) {
    return 57;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue("--header-height");
  return Number.parseFloat(value) || 57;
}
