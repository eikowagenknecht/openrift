import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Responsive container width classes shared by header and main content.
 * Widens in steps: 1280px (default) → 1800px (wide) → 2240px (xwide) → 2560px (xxwide).
 */
export const CONTAINER_WIDTH =
  "mx-auto max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)";

/** Standard page padding applied by leaf routes that want the default inset. */
export const PAGE_PADDING = "px-3 py-3";

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
