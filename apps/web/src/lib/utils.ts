import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Responsive container width classes shared by header and main content.
 * Widens in steps: 1280px (default) → 1720px (wide) → 2160px (xwide) → 2560px (xxwide).
 */
export const CONTAINER_WIDTH =
  "w-full mx-auto max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)";

/**
 * Horizontal page padding — shared axis constant for one-off compositions.
 * `px-safe` keeps the normal 0.75rem gutter but grows to clear the iOS safe
 * areas (Dynamic Island / rounded corners intruding from the sides in
 * landscape); resolves to plain 0.75rem on every non-notched device.
 */
const PAGE_X = "px-safe";

/** Standard page padding applied by leaf routes that want the default inset. */
export const PAGE_PADDING = `${PAGE_X} py-3`;

/** Page padding without top — for pages whose sticky toolbar already provides top spacing. */
export const PAGE_PADDING_NO_TOP = `${PAGE_X} pb-3`;

/** Footer padding — horizontal + bottom only. `pb-safe` clears the iOS home indicator. */
export const FOOTER_PADDING_NO_TOP = `${PAGE_X} pb-safe`;

/**
 * Capitalises the first character of a single word (e.g. "regions" → "Regions").
 *
 * @returns The capitalised word.
 */
export function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

/** Returns a safe relative redirect path, or `undefined` if the input is missing or unsafe.
 * @returns The sanitized path, or `undefined` if invalid.
 */
export function sanitizeRedirect(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  // Only allow paths that start with "/" but not "//" (protocol-relative URLs).
  // Backslashes are rejected too: some browsers normalize "\" to "/", which
  // would turn "/\evil.com" into a protocol-relative URL.
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) {
    return url;
  }
  return undefined;
}
