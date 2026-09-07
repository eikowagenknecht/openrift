/** `vertical` is download-only: no crawler consumes a 9:16 og:image, so an aspect never reaches an og:image URL. */
export type ShareImageAspect = "landscape" | "vertical";

export const SHARE_IMAGE_CANVAS: Record<ShareImageAspect, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  vertical: { width: 1080, height: 1920 },
};

export const MAX_IMAGE_SCALE = 3;

export interface ShareImageQuery {
  aspect?: ShareImageAspect;
  size?: "hq";
  scale?: number;
  qr?: boolean;
}

export function shareImageQueryParams(
  options: ShareImageQuery = {},
): Record<string, string | undefined> {
  return {
    size: options.size,
    scale: options.scale !== undefined && options.scale > 1 ? String(options.scale) : undefined,
    aspect: options.aspect === "vertical" ? "vertical" : undefined,
    qr: options.qr === false ? "0" : undefined,
  };
}

export function aspectFromQuery(value: string | undefined): ShareImageAspect {
  return value === "vertical" ? "vertical" : "landscape";
}

// `size=hq` must still resolve to scale 2: already-issued og:image and
// download URLs depend on it.
export function scaleFromQuery(scale: string | undefined, size: string | undefined): number {
  const asked = Number(scale);
  if (Number.isInteger(asked) && asked >= 1 && asked <= MAX_IMAGE_SCALE) {
    return asked;
  }
  return size === "hq" ? 2 : 1;
}

export function qrFromQuery(value: string | undefined): boolean {
  return value !== "0";
}
