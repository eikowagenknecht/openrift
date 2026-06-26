/**
 * Helpers for the server-rendered share images (ADR-024): the og:image URL
 * builders and the content version used to cache-bust them. The image is served
 * with a long immutable cache keyed by URL, so the `?v=` version must change
 * whenever the list's contents change (the parent `updatedAt` advances on every
 * entry add/edit/delete).
 */

const API_BASE = "/api/v1";

/**
 * Epoch-ms cache-bust token derived from a list's ISO `updatedAt`.
 * @returns The epoch milliseconds, or 0 when the input is missing or invalid.
 */
export function shareImageVersion(isoTimestamp: string | undefined): number {
  if (!isoTimestamp) {
    return 0;
  }
  const epochMs = new Date(isoTimestamp).getTime();
  return Number.isNaN(epochMs) ? 0 : epochMs;
}

/**
 * Absolute URL of the server-rendered share image for a single shared list.
 * @returns The image URL, used as the og:image and the download source.
 */
export function listShareImageUrl(siteUrl: string, shareToken: string, version: number): string {
  return `${siteUrl}${API_BASE}/lists/share/${shareToken}/image.png?v=${version}`;
}

/**
 * Absolute URL of the owner-authenticated image for one of the caller's own
 * lists. The share dialog's download uses this so it works whether or not the
 * list is publicly shared (the public/og route needs a share token).
 * @returns The image URL.
 */
export function listOwnerImageUrl(siteUrl: string, listId: string, version: number): string {
  return `${siteUrl}${API_BASE}/lists/${listId}/image.png?v=${version}`;
}

/**
 * Absolute URL of the server-rendered share image for a user's share bundle.
 * @returns The image URL, used as the og:image and the download source.
 */
export function bundleShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number | string,
): string {
  return `${siteUrl}${API_BASE}/users/share/${shareToken}/image.png?v=${version}`;
}

/**
 * Absolute URL of the server-rendered share image for a shared collection.
 * Adding/removing copies does not advance `collections.updatedAt`, so callers
 * pass a composite `updatedAt-copyCount` version to keep the cached og:image
 * fresh as the collection changes.
 * @returns The image URL, used as the og:image.
 */
export function collectionShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number | string,
): string {
  return `${siteUrl}${API_BASE}/collections/share/${shareToken}/image.png?v=${version}`;
}

/**
 * Fetches a share image and triggers a browser download with the given
 * filename. Done via fetch + object URL (rather than an `<a download>` on the
 * image URL directly) so the chosen filename is honored regardless of
 * cross-origin download-attribute quirks.
 * @returns A promise that resolves once the download has been triggered.
 */
export async function downloadImageFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
