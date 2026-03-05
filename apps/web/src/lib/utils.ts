import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
