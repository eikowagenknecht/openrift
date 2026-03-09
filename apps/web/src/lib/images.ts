const THUMBNAIL_WIDTHS = [200, 300, 400, 600, 750];

function appendParams(baseUrl: string, params: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${params}`;
}

function isSelfHosted(url: string): boolean {
  return url.startsWith("/card-images/");
}

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
