/**
 * Renders an icon to a flat-colored silhouette as a PNG data URL (ADR-023).
 *
 * The card template tints its glyph icons (white, or black on the might shield)
 * with CSS filters, but html2canvas-pro ignores CSS filters, so exported cards
 * show the icons in their source color. This produces a real silhouette raster
 * in the wanted color that html2canvas can rasterize. Browser-only; kept apart
 * from the pure helpers in `card-designer.ts`. Same-origin assets, so the canvas
 * stays untainted.
 */

/** Tint colors used by the card template's glyph icons. */
export const TINT_WHITE = "#ffffff";
export const TINT_BLACK = "#000000";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function cacheKey(src: string, color: string): string {
  return `${color}\n${src}`;
}

/**
 * Synchronously returns a previously-tinted icon, if one is cached.
 *
 * @returns The tinted data URL, or undefined when not yet tinted.
 */
export function getCachedTintedIcon(src: string, color: string): string | undefined {
  return cache.get(cacheKey(src, color));
}

/**
 * Tints an icon to a flat-colored silhouette and caches the result. Best-effort:
 * any failure (decode error, no 2D context, tainted canvas) resolves to null and
 * callers fall back to the CSS-filter rendering.
 *
 * @returns The tinted data URL, or null on failure.
 */
export function tintIcon(src: string, color: string): Promise<string | null> {
  const key = cacheKey(src, color);
  const cached = cache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  const inflight = pending.get(key);
  if (inflight) {
    return inflight;
  }
  // oxlint-disable-next-line promise/avoid-new -- wrapping the HTMLImageElement load callbacks
  const promise = new Promise<string | null>((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      const width = image.naturalWidth || 64;
      const height = image.naturalHeight || 64;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      // Keep the icon's alpha shape, then flood it with the wanted color: a
      // silhouette that matches the `brightness-0[ invert]` CSS filter.
      context.drawImage(image, 0, 0, width, height);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      try {
        const url = canvas.toDataURL("image/png");
        cache.set(key, url);
        resolve(url);
      } catch {
        resolve(null);
      }
    });
    image.addEventListener("error", () => resolve(null));
    image.src = src;
  });
  pending.set(key, promise);
  return promise;
}

/**
 * Tints several icons ahead of time so a later synchronous render (the export
 * clone) finds them cached.
 *
 * @returns Resolves once every icon has been tinted or has failed.
 */
export async function prewarmTintedIcons(
  icons: readonly { src: string; color: string }[],
): Promise<void> {
  await Promise.all(icons.map((icon) => tintIcon(icon.src, icon.color)));
}
