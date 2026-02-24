const THUMBNAIL_WIDTHS = [200, 400, 600, 750];

export function getCardImageUrl(
  baseUrl: string,
  size: "thumbnail" | "full",
  orientation: string,
): string {
  const orientationSuffix = orientation === "landscape" ? "&or=270" : "";
  if (size === "thumbnail") {
    return `${baseUrl}?w=300&fit=max&fm=webp${orientationSuffix}`;
  }
  return `${baseUrl}?fm=webp${orientationSuffix}`;
}

export function getCardImageSrcSet(baseUrl: string, orientation: string): string {
  const orientationSuffix = orientation === "landscape" ? "&or=270" : "";
  return THUMBNAIL_WIDTHS.map(
    (w) => `${baseUrl}?w=${w}&fit=max&fm=webp${orientationSuffix} ${w}w`,
  ).join(", ");
}
