import type { ImageVariant } from "@openrift/shared/image-url";

const REHOSTED_PREFIX = "/media/cards/";

/** Rehosted URLs are stored without the variant suffix; source URLs are served as they are. */
export function deskImageSrc(url: string | null, variant: ImageVariant): string | null {
  if (url === null) {
    return null;
  }
  return url.startsWith(REHOSTED_PREFIX) ? `${url}-${variant}.webp` : url;
}
