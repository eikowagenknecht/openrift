export const SSR_HEADER_HEIGHT = 57;

// `--header-height` is an unregistered custom property whose calc()/env()
// value doesn't resolve through getComputedStyle, so it's only a pre-mount fallback.
export function getHeaderHeight(): number {
  if (globalThis.window === undefined) {
    return SSR_HEADER_HEIGHT;
  }
  const header = document.querySelector("header[data-app-header]");
  if (header) {
    return header.getBoundingClientRect().height;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue("--header-height");
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- CSS px string; Number() would yield NaN
  return Number.parseFloat(value) || SSR_HEADER_HEIGHT;
}
