const THUMBNAIL_WIDTHS = [200, 300, 400, 600, 750];

function appendParams(baseUrl: string, params: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${params}`;
}

export function getCardImageUrl(
  baseUrl: string,
  size: "thumbnail" | "full",
  orientation: string,
): string {
  const orientationSuffix = orientation === "landscape" ? "&or=270" : "";
  if (size === "thumbnail") {
    return appendParams(baseUrl, `w=300&fit=max&fm=webp&q=75${orientationSuffix}`);
  }
  return appendParams(baseUrl, `fm=webp${orientationSuffix}`);
}

export function getCardImageSrcSet(baseUrl: string, orientation: string): string {
  const orientationSuffix = orientation === "landscape" ? "&or=270" : "";
  return THUMBNAIL_WIDTHS.map(
    (w) => `${appendParams(baseUrl, `w=${w}&fit=max&fm=webp&q=75${orientationSuffix}`)} ${w}w`,
  ).join(", ");
}
