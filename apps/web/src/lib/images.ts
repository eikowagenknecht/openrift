const THUMBNAIL_WIDTHS = [200, 300, 400, 600, 750];

function appendParams(baseUrl: string, params: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${params}`;
}

function isSelfHosted(url: string): boolean {
  return url.startsWith("/card-images/");
}

/**
 * Returns true when a landscape card uses a self-hosted image that needs
 * CSS rotation (the CDN previously handled this server-side via `&or=270`).
 * @returns Whether the image needs a -90deg CSS rotation for display
 */
export function needsCssRotation(imageUrl: string, orientation: string): boolean {
  return orientation === "landscape" && isSelfHosted(imageUrl);
}

/**
 * Style for a wrapper div that rotates a landscape image to display as portrait.
 * The wrapper is sized to landscape dimensions (width = container height,
 * height = container width via aspect-ratio), centered, then rotated -90deg
 * so it fills the portrait container exactly. The img inside uses
 * `size-full object-cover`.
 */
export const LANDSCAPE_ROTATION_STYLE: React.CSSProperties = {
  width: "139.65%",
  aspectRatio: "88 / 63",
  transform: "translate(-50%, -50%) rotate(-90deg)",
};

export function getCardImageUrl(
  baseUrl: string,
  size: "thumbnail" | "full",
  orientation: string,
): string {
  if (isSelfHosted(baseUrl)) {
    return size === "thumbnail" ? `${baseUrl}-300w.webp` : `${baseUrl}-full.webp`;
  }

  const orientationSuffix = orientation === "landscape" ? "&or=270" : "";
  if (size === "thumbnail") {
    return appendParams(baseUrl, `w=300&fit=max&fm=webp&q=75${orientationSuffix}`);
  }
  return appendParams(baseUrl, `fm=webp${orientationSuffix}`);
}

export function getCardImageSrcSet(baseUrl: string, orientation: string): string {
  if (isSelfHosted(baseUrl)) {
    return `${baseUrl}-300w.webp 300w, ${baseUrl}-400w.webp 400w`;
  }

  const orientationSuffix = orientation === "landscape" ? "&or=270" : "";
  return THUMBNAIL_WIDTHS.map(
    (w) => `${appendParams(baseUrl, `w=${w}&fit=max&fm=webp&q=75${orientationSuffix}`)} ${w}w`,
  ).join(", ");
}
