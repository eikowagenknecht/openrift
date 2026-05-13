/**
 * Derive a short provider slug from an image URL's hostname.
 *
 * Used for the admin "add image from URL" flow to label each image with its
 * source so the `(printingId, face, provider)` unique key gives each source
 * its own slot. Takes the second-to-last hostname label (the registrable
 * name without the TLD) so `i.imgur.com` → `imgur`, `images.tcgplayer.com` →
 * `tcgplayer`. Falls back to `"manual"` if the URL can't be parsed or has no
 * usable hostname.
 *
 * @returns A short slug like `"imgur"`, or `"manual"` on parse failure.
 */
export function urlToProvider(url: string): string {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return "manual";
  }

  if (!hostname) {
    return "manual";
  }

  const labels = hostname.split(".").filter((label) => label.length > 0);
  if (labels.length === 0) {
    return "manual";
  }
  if (labels.length === 1) {
    return labels.at(0) ?? "manual";
  }
  return labels.at(-2) ?? "manual";
}
