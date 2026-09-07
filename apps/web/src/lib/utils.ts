import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CONTAINER_WIDTH =
  "w-full mx-auto max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)";

// Deliberately no third value: PageTopBarSticky requires one of these, so a
// new width can't be introduced at a call site.
export const PAGE_WIDTH = {
  full: CONTAINER_WIDTH,
  capped: "w-full mx-auto max-w-5xl",
} as const;

export type PageWidth = keyof typeof PAGE_WIDTH;

const PAGE_X = "px-safe";

export const PAGE_PADDING = `${PAGE_X} py-3`;

export const PAGE_PADDING_NO_TOP = `${PAGE_X} pb-3`;

export const FOOTER_PADDING_NO_TOP = `${PAGE_X} pb-safe`;

export function sanitizeRedirect(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  // Backslashes are rejected too: some browsers normalize "\" to "/", which
  // would turn "/\evil.com" into a protocol-relative URL.
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) {
    return url;
  }
  return undefined;
}
