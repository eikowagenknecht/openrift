/**
 * The query vocabulary of the server-rendered share images (ADR-024). The web
 * app writes these params into og:image and download URLs and the API parses
 * them back out, so both halves read from this one definition rather than
 * restating the names and their defaults as string literals.
 */

/**
 * Canvas an image is rendered on. `landscape` (the default everywhere) is the
 * link-unfurl shape every og:image uses; `vertical` is the 9:16 download for a
 * story, a photo-mode slide, or a plate in a video editor. `vertical` is
 * download-only: no crawler consumes a 9:16 og:image (they crop or letterbox
 * it), so an aspect never reaches an og:image URL.
 */
export type ShareImageAspect = "landscape" | "vertical";

/**
 * Base canvas per aspect. 1200×630 is the og convention; 1080×1920 is the
 * native upload resolution for every vertical surface, so the 1× vertical
 * render is already the deliverable. The API renders at these dimensions and
 * the web export dialog labels its size buttons with the pixels they produce.
 */
export const SHARE_IMAGE_CANVAS: Record<ShareImageAspect, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  vertical: { width: 1080, height: 1920 },
};

/**
 * Public, immutably-cached images are capped at 2× because rasterizing cost
 * grows super-linearly and every URL is a new cache entry. 3× is offered only
 * on the owner-only download routes (authenticated, `no-store`, low traffic).
 */
export const MAX_IMAGE_SCALE = 3;

/** What an image-download surface lets a creator vary about a render. */
export interface ShareImageQuery {
  /** Canvas shape. `vertical` is the 9:16 export. */
  aspect?: ShareImageAspect;
  /**
   * The older two-valued multiplier, meaning 2×. Every image route accepts it;
   * the public share routes accept only this form.
   */
  size?: "hq";
  /**
   * Explicit render multiplier. 1 is the native canvas (1200×630, or 1080×1920
   * vertical). Owner-only routes accept it, capped at {@link MAX_IMAGE_SCALE}.
   */
  scale?: number;
  /** Draws the scannable mark. Only has an effect on a thing that is shared. */
  qr?: boolean;
}

/**
 * The query params for a set of image options. Every option is omitted at its
 * default, so a plain call still produces the bare `image.png` URL the routes
 * rendered before any of these params existed.
 *
 * @returns The params, with undefined for each option left at its default.
 */
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

/** @returns The canvas the `aspect` param asks for, landscape by default. */
export function aspectFromQuery(value: string | undefined): ShareImageAspect {
  return value === "vertical" ? "vertical" : "landscape";
}

/**
 * `?size=hq` still means 2×, so existing og:image and download URLs keep
 * rendering what they did. An unparseable `scale` falls through rather than
 * erroring — a bad multiplier should cost sharpness, not the whole image.
 *
 * @returns The render multiplier, between 1 and {@link MAX_IMAGE_SCALE}.
 */
export function scaleFromQuery(scale: string | undefined, size: string | undefined): number {
  const asked = Number(scale);
  if (Number.isInteger(asked) && asked >= 1 && asked <= MAX_IMAGE_SCALE) {
    return asked;
  }
  return size === "hq" ? 2 : 1;
}

/**
 * `?qr=0` is the opt-out for a creator who wants a clean plate to composite over.
 *
 * @returns Whether to draw the scannable mark.
 */
export function qrFromQuery(value: string | undefined): boolean {
  return value !== "0";
}
