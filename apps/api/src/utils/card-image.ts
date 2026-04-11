import type { CardImageVariants } from "@openrift/shared";

/**
 * Expands a stored base URL like `/card-images/{prefix}/{uuid}` into the
 * concrete files on disk: `{base}-full.webp` and `{base}-400w.webp`. The
 * rehoster bakes both variants for every image (see `apps/api/src/services/image-rehost.ts`),
 * so callers never need to know the suffix scheme — the API hands them
 * ready-to-use URLs.
 *
 * @returns Variant URLs, or `null` when the input is null.
 */
export function toCardImageVariants(baseUrl: string): CardImageVariants;
export function toCardImageVariants(baseUrl: string | null): CardImageVariants | null;
export function toCardImageVariants(baseUrl: string | null): CardImageVariants | null {
  if (baseUrl === null) {
    return null;
  }
  return {
    full: `${baseUrl}-full.webp`,
    thumbnail: `${baseUrl}-400w.webp`,
  };
}
