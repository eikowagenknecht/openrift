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
