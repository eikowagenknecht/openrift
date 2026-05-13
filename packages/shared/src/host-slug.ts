/**
 * Derive a short slug from an image URL's hostname for display purposes.
 *
 * Takes the second-to-last hostname label (the registrable name without the
 * TLD) so `i.imgur.com` → `imgur`, `images.tcgplayer.com` → `tcgplayer`.
 *
 * @returns A short slug like `"imgur"`, or `null` if the URL can't be parsed.
 */
export function hostSlugFromUrl(url: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  if (!hostname) {
    return null;
  }

  const labels = hostname.split(".").filter((label) => label.length > 0);
  if (labels.length === 0) {
    return null;
  }
  if (labels.length === 1) {
    return labels.at(0) ?? null;
  }
  return labels.at(-2) ?? null;
}
