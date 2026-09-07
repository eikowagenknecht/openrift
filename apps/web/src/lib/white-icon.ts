/**
 * html2canvas-pro ignores the CSS filters the card template uses to tint glyph
 * icons, so exported cards would show icons in their source color. This rasters
 * a real flat-colored silhouette instead.
 */

export const TINT_WHITE = "#ffffff";
export const TINT_BLACK = "#000000";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function cacheKey(src: string, color: string): string {
  return `${color}\n${src}`;
}

export function getCachedTintedIcon(src: string, color: string): string | undefined {
  return cache.get(cacheKey(src, color));
}

// Best-effort: any failure (decode error, no 2D context, tainted canvas)
// resolves to null so callers fall back to the CSS-filter rendering.
function tintIcon(src: string, color: string): Promise<string | null> {
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

export async function prewarmTintedIcons(
  icons: readonly { src: string; color: string }[],
): Promise<void> {
  await Promise.all(icons.map((icon) => tintIcon(icon.src, icon.color)));
}
