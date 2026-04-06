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

/** Horizontal page padding — shared axis constant for one-off compositions. */
export const PAGE_X = "px-3";

/** Standard page padding applied by leaf routes that want the default inset. */
export const PAGE_PADDING = `${PAGE_X} py-3`;

/** Page padding without top — for pages whose sticky toolbar already provides top spacing. */
export const PAGE_PADDING_NO_TOP = `${PAGE_X} pb-3`;

/** Footer padding — horizontal + bottom only. */
export const FOOTER_PADDING_NO_TOP = `${PAGE_X} pb-3`;

/** Returns a safe relative redirect path, or `undefined` if the input is missing or unsafe.
 * @returns The sanitized path, or `undefined` if invalid.
 */
export function sanitizeRedirect(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  // Only allow paths that start with "/" but not "//" (protocol-relative URLs)
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }
  return undefined;
}
