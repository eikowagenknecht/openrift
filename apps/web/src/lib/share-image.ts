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
 * Absolute URL of the server-rendered share image for a shared deck (ADR-031),
 * used as the og:image. `size: "hq"` requests the 3× download variant.
 * @returns The deck image URL.
 */
export function deckShareImageUrl(
  siteUrl: string,
  shareToken: string,
  version: number,
  size?: "hq",
): string {
  const base = `${siteUrl}${API_BASE}/decks/share/${shareToken}/image.png?v=${version}`;
  return size === "hq" ? `${base}&size=hq` : base;
}

/**
 * Absolute URL of the owner-authenticated image for one of the caller's own
 * decks (ADR-031). The export dialog's "Image" download uses this so it works
 * whether or not the deck is shared. `size: "hq"` requests the 2× download.
 * @returns The deck image URL.
 */
export function deckOwnerImageUrl(siteUrl: string, deckId: string, size?: "hq"): string {
  const base = `${siteUrl}${API_BASE}/decks/${deckId}/image.png`;
  return size === "hq" ? `${base}?size=hq` : base;
}

/**
 * Absolute URL of the public from-cards deck image renderer (ADR-031), used to
 * download an image of a browser-local deck that has no server row.
 * @returns The render endpoint URL.
 */
export function deckImageFromCardsUrl(siteUrl: string, size?: "hq"): string {
  const base = `${siteUrl}${API_BASE}/decks/image`;
  return size === "hq" ? `${base}?size=hq` : base;
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
  triggerBlobDownload(await fetchImageBlob(url), filename);
}

/**
 * Fetches a share image as a blob without downloading it, for callers that
 * re-wrap the image (e.g. the A4 PDF export).
 * @returns The image blob.
 */
export async function fetchImageBlob(url: string): Promise<Blob> {
  return await readImageBlob(await fetch(url));
}

/**
 * Fetches a from-cards image (`POST`) as a blob without downloading it.
 * @returns The image blob.
 */
export async function fetchImageBlobFromPost(url: string, body: unknown): Promise<Blob> {
  return await readImageBlob(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Unwraps an image response, turning a non-OK status into an error.
 * @returns The response body as a blob.
 */
async function readImageBlob(response: Response): Promise<Blob> {
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }
  return await response.blob();
}

/**
 * Fetches a from-cards deck image (`POST`) and triggers a browser download.
 * Used for browser-local decks, which have no server row to resolve by id.
 * @returns A promise that resolves once the download has been triggered.
 */
export async function downloadImageFromPost(
  url: string,
  body: unknown,
  filename: string,
): Promise<void> {
  triggerBlobDownload(await fetchImageBlobFromPost(url, body), filename);
}

/**
 * Triggers a browser download of an image blob via an object URL.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
